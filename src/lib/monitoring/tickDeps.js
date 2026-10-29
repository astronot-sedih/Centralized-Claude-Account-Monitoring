// Wires the scheduler's injectable deps to the real collaborators.
//
// Kept separate from scheduler.js so that module stays unit-testable with no
// DB, no SMTP and no clock, and separate from instrumentation.js so boot does
// not grow report-assembly logic.

import { getMeta, setMeta } from "@/lib/db/helpers/metaStore.js";
import { getSnapshotsForDate } from "@/lib/db/repos/quotaSnapshotsRepo.js";
import { getUsageHistory } from "@/lib/db/repos/usageRepo.js";
import { getPricing } from "@/lib/db/repos/pricingRepo.js";
import { listProfiles, getConnectionProfileMap } from "@/lib/db/repos/profilesRepo.js";
import { claudeWebSettingsFromEnv, fetchTeamAnalytics } from "./claudeWeb/client.js";
import { fetchActivity } from "./claudeWeb/activity.js";
import {
  normalizeOverview,
  normalizeUsers,
  monthRangeFor,
  normalizeActivityOverview,
  normalizeMembers,
  normalizeSeries,
  normalizeTimeseries,
} from "./claudeWeb/normalize.js";
import { buildReport } from "./report/buildReport.js";
import { collectOnce } from "./quotaCollector.js";
import { pruneSnapshotsOlderThan } from "@/lib/db/repos/quotaSnapshotsRepo.js";
import { LAST_SENT_KEY, LAST_PRUNED_KEY, SAMPLE_INTERVAL_MS } from "./scheduler.js";
import { dateKeyFor } from "./clock.js";

function daysBack(dateKey, n) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Assembles the report for one local date from the stored snapshots, the proxy
 * usage rows and the pricing table.
 * @returns {Promise<object>} a report object (see buildReport)
 */
export async function assembleReport(dateKey, timeZone) {
  const snapshots = await getSnapshotsForDate(dateKey);

  // Seven days of snapshots, for "hit the limit on N of 7 days".
  const weekSnapshots = [];
  for (let i = 0; i < 7; i++) {
    weekSnapshots.push(...(await getSnapshotsForDate(daysBack(dateKey, i))));
  }

  // Proxy usage for the day, grouped per connection. Claude only.
  //
  // Bounded by date at the SQL level: without it this selected the ENTIRE
  // history (50k+ rows on a months-old install) on every dashboard load, and
  // grew forever. +/- 1 day because the stored timestamp is a UTC instant and
  // dateKey is local, so the local day straddles two UTC days.
  const usageByConnection = {};
  const history = await getUsageHistory({
    provider: "claude",
    startDate: `${daysBack(dateKey, 1)}T00:00:00.000Z`,
    endDate: `${daysBack(dateKey, -1)}T23:59:59.999Z`,
  }).catch(() => []);
  for (const row of history || []) {
    if (!row?.connectionId) continue;
    if (dateKeyFor(new Date(row.timestamp), timeZone) !== dateKey) continue;
    (usageByConnection[row.connectionId] ||= []).push(row);
  }

  const pricing = await getPricing().catch(() => ({}));

  // Workspace names, for the report's Profil column. A LABEL only — every
  // account stays in the report whichever workspace owns it, because the
  // report is the case for the whole team.
  const profileNames = {};
  try {
    const [profiles, assignments] = await Promise.all([
      listProfiles(),
      getConnectionProfileMap(),
    ]);
    const nameById = Object.fromEntries(profiles.map((p) => [p.id, p.name]));
    for (const [connectionId, profileId] of Object.entries(assignments)) {
      if (nameById[profileId]) profileNames[connectionId] = nameById[profileId];
    }
  } catch {
    // An unnamed account is still reportable; a failed lookup must not take
    // the whole report down.
  }

  // Web and Desktop use, from claude.ai's org analytics. This is the only
  // source that sees teammates who never route through the gateway, so the
  // emailed report would otherwise understate the team to the person deciding
  // on a plan. Fail-open: a dead cookie costs this section, not the report.
  let claudeWeb = null;
  const web = claudeWebSettingsFromEnv();
  if (web.configured) {
    const range = monthRangeFor(dateKey);
    // Both lenses in parallel: Claude Code detail, and org-wide adoption that
    // also covers members who only ever chat in the browser or Desktop.
    const [r, a] = await Promise.all([
      fetchTeamAnalytics({ ...web, ...range }),
      fetchActivity({ ...web, startDate: range.startDate }),
    ]);
    claudeWeb = {
      ok: r.ok,
      error: r.error,
      range,
      summary: r.overview ? normalizeOverview(r.overview) : null,
      users: normalizeUsers(r.users),
      // Daily series, for the charts. The email renders them as plain table
      // cells with background colours — a mail client runs no JavaScript and
      // most block remote images, so a canvas or a hosted PNG would reach the
      // reader as a blank rectangle.
      series: r.overview ? normalizeSeries(r.overview) : [],
      activity: a.ok
        ? {
            overview: normalizeActivityOverview(a.overview),
            members: normalizeMembers(a.members),
            series: normalizeTimeseries(a.series),
            dataAsOf: a.dataAsOf,
          }
        : null,
      activityError: a.error,
    };
  }

  // samplesExpected = one sample per hour of the day, which is what the
  // sampler aims for; coverage below that is reported, never hidden.
  return buildReport({
    dateKey,
    samplesExpected: Math.round(86400000 / SAMPLE_INTERVAL_MS),
    snapshots,
    weekSnapshots,
    usageByConnection,
    pricing,
    profileNames,
    claudeWeb,
  });
}

/**
 * @param {object} config from monitorSettingsFromEnv()
 * @param {{sendReportMail: Function}} services
 * @returns {Promise<object>} deps for startScheduler/tick
 */
export async function buildMonitorTickDeps(config, services) {
  const { sendReportMail } = services;

  return {
    // Re-read per beat: the send guard lives in the DB, so a restart mid-day
    // cannot resend, and a config change takes effect without a reboot.
    resolveDeps: async () => ({
      ...config,
      now: () => new Date(),
      collectOnce,
      pruneSnapshotsOlderThan,
      lastSentDateKey: await getMeta(LAST_SENT_KEY, null),
      setLastSentDateKey: (dateKey) => setMeta(LAST_SENT_KEY, dateKey),
      lastPrunedDateKey: await getMeta(LAST_PRUNED_KEY, null),
      setLastPrunedDateKey: (dateKey) => setMeta(LAST_PRUNED_KEY, dateKey),
      sendReport: async ({ dateKey, timeZone }) => {
        const report = await assembleReport(dateKey, timeZone);
        // Re-resolved per send so a recipient change in the dashboard takes
        // effect on the next report, with no restart.
        const { resolveMonitorConfig } = await import("./mailer.js");
        const live = await resolveMonitorConfig();
        const result = await sendReportMail(report, { ...config, to: live.to });
        // Throw on failure so the scheduler does NOT mark the day sent — one
        // SMTP outage must not cost that day's report permanently.
        if (!result?.sent) throw new Error(result?.reason || "send failed");
        return true;
      },
    }),
  };
}
