// GET /api/monitoring/claude-web?start=YYYY-MM-DD&end=YYYY-MM-DD
//
// Team analytics read straight from claude.ai with an admin session cookie.
// This is the only source that covers WEB AND DESKTOP use — the teammates who
// never route through the gateway.
//
// Auth: covered by dashboardGuard's deny-by-default rule for /api/*.
//
// The cookie never leaves the server: the response carries figures only, and
// the client module scrubs any error string before it gets here.

import { NextResponse } from "next/server";
import {
  claudeWebSettingsFromEnv,
  fetchTeamAnalytics,
} from "@/lib/monitoring/claudeWeb/client.js";
import {
  normalizeOverview,
  normalizeSeries,
  normalizeUsers,
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
  const sp = new URL(request.url).searchParams;

  // Anything that is not a plain date falls back to month-to-date rather than
  // being passed through to the upstream query.
  const fallback = monthRangeFor(today);
  const startDate = isDate(sp.get("start")) ? sp.get("start") : fallback.startDate;
  const endDate = isDate(sp.get("end")) ? sp.get("end") : fallback.endDate;

  const { orgId, cookie, configured } = claudeWebSettingsFromEnv();

  const result = await fetchTeamAnalytics({
    orgId,
    cookie,
    configured,
    startDate,
    endDate,
  });

  // 200 even on a failed read: the shape is the same either way, and the page
  // shows the reason instead of an error boundary that hides the rest.
  return NextResponse.json(
    {
      configured: result.configured,
      ok: result.ok,
      error: result.error,
      range: { startDate, endDate },
      summary: result.overview ? normalizeOverview(result.overview) : null,
      series: result.overview ? normalizeSeries(result.overview) : [],
      users: normalizeUsers(result.users),
      totalUsers: result.totalUsers ?? null,
    },
    { headers: NO_STORE }
  );
}
