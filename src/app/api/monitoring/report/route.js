// GET /api/monitoring/report?date=YYYY-MM-DD
//
// The same report object the email renders from, so the dashboard and the
// email can never disagree about a number.
//
// Auth: covered by dashboardGuard's deny-by-default rule for /api/* — any
// path not on PUBLIC_API_PATHS requires a dashboard session or CLI token.
// Note there are no roles in this repo: "admin-only" means any authenticated
// dashboard user (see docs/TEAM_MONITORING.md).

import { NextResponse } from "next/server";
import { assembleReport } from "@/lib/monitoring/tickDeps.js";
import { monitorSettingsFromEnv } from "@/lib/monitoring/mailer.js";
import { dateKeyFor } from "@/lib/monitoring/clock.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request) {
  try {
    const { timeZone } = monitorSettingsFromEnv();
    const asked = new URL(request.url).searchParams.get("date");
    // Reject anything that is not a plain date rather than passing it to SQL.
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(asked || "")
      ? asked
      : dateKeyFor(new Date(), timeZone);

    const report = await assembleReport(dateKey, timeZone);
    return NextResponse.json(report, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
}
