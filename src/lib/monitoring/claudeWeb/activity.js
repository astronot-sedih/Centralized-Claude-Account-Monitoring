// Organization-wide activity from claude.ai — the /analytics/activity family.
//
// This is a WIDER lens than the Claude Code metrics in client.js. Those cover
// only the people who run Claude Code; these cover EVERY member, including
// the ones whose whole relationship with Claude is chatting in the browser or
// in Desktop. On this team that is the difference between 5 people and 9.
//
// Same rules as client.js: undocumented endpoints, admin session cookie,
// fail-open on every call, and nothing credential-shaped may escape.

import { scrubSecrets } from "../scrub.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const base = (orgId) => `https://claude.ai/api/organizations/${orgId}/analytics`;

/**
 * One call, failure folded into the result.
 * @returns {Promise<{ok: boolean, data: any, error: string|null}>}
 */
async function get(url, { cookie, fetchImpl = fetch }) {
  try {
    const res = await fetchImpl(url, {
      headers: {
        cookie,
        accept: "application/json",
        "user-agent": UA,
        referer: "https://claude.ai/analytics/overview",
      },
    });
    if (!res.ok) {
      const reason =
        res.status === 401 || res.status === 403
          ? "sesi claude.ai kedaluwarsa atau bukan admin — perbarui CLAUDE_WEB_SESSION_KEY"
          : `HTTP ${res.status}`;
      return { ok: false, data: null, error: reason };
    }
    return { ok: true, data: await res.json(), error: null };
  } catch (e) {
    return { ok: false, data: null, error: scrubSecrets(e?.message || String(e)) };
  }
}

/** Org adoption: DAU/WAU/MAU, seat utilization, stickiness. */
export function fetchActivityOverview({ orgId, ...rest }) {
  return get(`${base(orgId)}/activity/overview`, rest);
}

/** Cowork-specific rates. */
export function fetchCoworkOverview({ orgId, ...rest }) {
  return get(`${base(orgId)}/activity/cowork_overview`, rest);
}

/**
 * Per-member activity across every product.
 *
 * Sorted by messages rather than the UI's default (cowork sessions): the
 * report's question is who uses Claude at all, and the heaviest chat user can
 * have zero Cowork sessions.
 *
 * The sort key is the API's own vocabulary ("messages"), not the member
 * field name ("message_count"), which it rejects with a 400.
 */
export function fetchActivityUsers({ orgId, startDate, pageSize = 100, sort = "messages", ...rest }) {
  const p = new URLSearchParams({
    page: "1",
    page_size: String(pageSize),
    sort,
    order: "desc",
    start_date: startDate,
  });
  return get(`${base(orgId)}/activity/users?${p}`, rest);
}

/**
 * A daily series for one metric.
 * @param {"dau"|"wau"|"mau"} metric
 * @param {string|null} productFilter e.g. "cowork", "claude-design"
 */
export function fetchActivityTimeseries({ orgId, metric = "dau", days = 30, productFilter = null, ...rest }) {
  const p = new URLSearchParams({ metric, days: String(days) });
  if (productFilter) p.set("product_filter", productFilter);
  return get(`${base(orgId)}/activity/timeseries?${p}`, rest);
}

/**
 * The organization's members — who the team actually is.
 *
 * Not under /analytics: this is the membership list itself, and it is what
 * profiles are synced against.
 */
export function fetchMembers({ orgId, ...rest }) {
  return get(`https://claude.ai/api/organizations/${orgId}/members`, rest);
}

/** What kinds of file Cowork touched. */
export function fetchCoworkFileCategories({ orgId, startDate, ...rest }) {
  const p = new URLSearchParams({ start_date: startDate });
  return get(`${base(orgId)}/cowork/file-categories?${p}`, rest);
}

/**
 * Every activity endpoint for one range, in parallel.
 *
 * Partial success is reported rather than discarded: knowing the team is 90%
 * utilized is worth showing even when the per-member call failed.
 */
/**
 * The latest day the activity endpoints will answer for.
 *
 * They refuse a date after yesterday UTC — "Data is only available through
 * yesterday (UTC); the requested window starts after that" — so asking for
 * today returns a 400 and the whole section reads as broken. The pipeline is
 * also often a further day behind, which is why this clamps to the
 * organization's own `data_as_of` when the overview reports one.
 *
 * @param {string|null} reportedAsOf the overview's data_as_of
 * @param {Date} now
 * @returns {string} YYYY-MM-DD
 */
export function latestAvailableDate(reportedAsOf, now = new Date()) {
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(reportedAsOf || "")) ? reportedAsOf : null;
  // The earlier of the two: asking past either end is a 400 or an empty day.
  if (asOf && asOf < yesterday) return asOf;
  return asOf || yesterday;
}

/**
 * The periods the Adopsi Tim card offers, mirroring the Usage page's control.
 *
 * `days` is how far back the window reaches from the latest available day.
 * 1 means that day alone — not "today", which the API refuses outright.
 */
export const ACTIVITY_PERIODS = Object.freeze([
  { value: "day", label: "1 Hari", days: 1 },
  { value: "7d", label: "7D", days: 7 },
  { value: "30d", label: "30D", days: 30 },
  { value: "mtd", label: "Bulan ini", days: null },
]);

/**
 * Turns a period into the window the endpoints want.
 *
 * `start_date` on the members and file-category endpoints is the START of a
 * range, not a single day: days_active rises with it, so the same call serves
 * every period.
 *
 * Month-to-date is clamped to the latest available day, never to today: the
 * API answers only through yesterday UTC and the pipeline usually lags a
 * further day, so an unclamped month would end on a date that 400s.
 *
 * @param {string} period one of ACTIVITY_PERIODS
 * @param {string} endDate latest available day, YYYY-MM-DD
 */
export function activityWindow(period, endDate) {
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ""))
    ? endDate
    : new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (period === "mtd") {
    const startDate = `${end.slice(0, 7)}-01`;
    // Day count inclusive of both ends, for the series.
    const days = Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1);
    return { startDate, endDate: end, days };
  }

  const found = ACTIVITY_PERIODS.find((p) => p.value === period);
  const days = found?.days || 1;
  const startDate = new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  return { startDate, endDate: end, days };
}

export async function fetchActivity(opts) {
  if (opts?.configured === false) {
    return {
      ok: false,
      configured: false,
      error: "CLAUDE_WEB_ORG_ID / CLAUDE_WEB_SESSION_KEY belum diisi",
      overview: null, cowork: null, members: [], series: [], fileCategories: [],
    };
  }

  // The overview ignores start_date and always answers for the latest day it
  // has, so it is asked FIRST and its data_as_of becomes the date for the
  // per-day calls. Without that the per-member table silently came back
  // empty whenever the caller passed a date the pipeline had not reached.
  const overview = await fetchActivityOverview(opts);
  const latest = latestAvailableDate(overview.data?.data_as_of, opts?.now);
  // The window the caller asked for, clamped to the latest day the API has.
  const win = activityWindow(opts?.period || "day", latest);
  const dayOpts = { ...opts, startDate: win.startDate };

  const [cowork, users, series, files] = await Promise.all([
    fetchCoworkOverview(dayOpts),
    fetchActivityUsers(dayOpts),
    // The series always spans at least a fortnight: a 1-day chart is a single
    // bar, which says nothing about trend — the one thing a chart is for.
    fetchActivityTimeseries({ ...dayOpts, metric: "dau", days: Math.max(14, win.days) }),
    fetchCoworkFileCategories(dayOpts),
  ]);

  const errors = [overview, cowork, users, series, files]
    .map((r) => r.error)
    .filter(Boolean);
  // One dead cookie produces the same message five times; say it once.
  const unique = [...new Set(errors)];

  return {
    ok: [overview, cowork, users, series, files].some((r) => r.ok),
    configured: true,
    error: unique.length ? unique.join(" · ") : null,
    overview: overview.data || null,
    cowork: cowork.data || null,
    members: users.data?.members || [],
    memberTotal: users.data?.total ?? null,
    medianSpendUsd: users.data?.median_spend_us_dollars ?? null,
    dataAsOf: overview.data?.data_as_of || users.data?.data_as_of || null,
    // The day the per-member figures describe, which is NOT the report's
    // date: Anthropic's pipeline runs a day or more behind.
    activityDate: win.startDate,
    activityEndDate: win.endDate,
    activityDays: win.days,
    period: opts?.period || "day",
    targetDate: overview.data?.target_date || null,
    series: series.data?.data_points || [],
    fileCategories: files.data?.categories || [],
    fileOperationTotal: files.data?.total_file_operation_count ?? null,
  };
}
