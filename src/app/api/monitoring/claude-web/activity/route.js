// GET /api/monitoring/claude-web/activity?start=YYYY-MM-DD
//
// Organization-wide adoption from claude.ai. A WIDER lens than
// /api/monitoring/claude-web, which reports Claude Code only: this covers
// every member, including the people whose whole use of Claude is chatting in
// the browser or in Desktop.
//
// Auth: covered by dashboardGuard's deny-by-default rule for /api/*.
// The admin cookie stays on the server; only figures come back.

import { NextResponse } from "next/server";
import { claudeWebSettingsFromEnv } from "@/lib/monitoring/claudeWeb/client.js";
import { fetchActivity } from "@/lib/monitoring/claudeWeb/activity.js";
import {
  normalizeActivityOverview,
  normalizeCoworkOverview,
  normalizeMembers,
  normalizeTimeseries,
  normalizeFileCategories,
  monthRangeFor,
} from "@/lib/monitoring/claudeWeb/normalize.js";
import { monitorSettingsFromEnv } from "@/lib/monitoring/mailer.js";
import { dateKeyFor } from "@/lib/monitoring/clock.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

export async function GET(request) {
  const { timeZone } = monitorSettingsFromEnv();
  const today = dateKeyFor(new Date(), timeZone);
  const asked = new URL(request.url).searchParams.get("start");
  const startDate = isDate(asked) ? asked : monthRangeFor(today).startDate;

  const settings = claudeWebSettingsFromEnv();
  const r = await fetchActivity({ ...settings, startDate });

  // 200 even on failure: the shape is the same either way, and the page shows
  // the reason rather than an error boundary that hides everything else.
  return NextResponse.json(
    {
      configured: r.configured,
      ok: r.ok,
      error: r.error,
      startDate,
      dataAsOf: r.dataAsOf,
      // The day the per-member figures actually describe. Anthropic refuses
      // any date after yesterday UTC and often lags a further day, so this is
      // not the date the caller asked for and must not be presented as it.
      activityDate: r.activityDate || null,
      targetDate: r.targetDate || null,
      overview: normalizeActivityOverview(r.overview),
      cowork: normalizeCoworkOverview(r.cowork),
      members: normalizeMembers(r.members),
      memberTotal: r.memberTotal,
      medianSpendUsd: r.medianSpendUsd,
      series: normalizeTimeseries(r.series),
      fileCategories: normalizeFileCategories(r.fileCategories),
      fileOperationTotal: r.fileOperationTotal,
    },
    { headers: NO_STORE }
  );
}
