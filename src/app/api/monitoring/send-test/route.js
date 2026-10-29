// POST /api/monitoring/send-test — send today's report to the configured
// recipients, for setup verification.
//
// This performs an OUTBOUND action, so it is listed in dashboardGuard's
// ALWAYS_PROTECTED (a valid JWT or CLI token, never the requireLogin=false
// bypass) and rate-limited here. An unthrottled trigger would be both a spam
// vector and a way to confirm which accounts exist.

import { NextResponse } from "next/server";
import { assembleReport } from "@/lib/monitoring/tickDeps.js";
import { resolveMonitorConfig, sendReportMail } from "@/lib/monitoring/mailer.js";
import { dateKeyFor } from "@/lib/monitoring/clock.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const SEND_TEST_COOLDOWN_MS = 60000;
const NO_STORE = { "Cache-Control": "no-store" };

// Module-level: one cooldown per process, which is the blast radius that
// matters for a local single-instance app.
let lastSentAt = 0;

export async function POST() {
  const since = Date.now() - lastSentAt;
  if (since < SEND_TEST_COOLDOWN_MS) {
    return NextResponse.json(
      { sent: false, reason: `rate limited, retry in ${Math.ceil((SEND_TEST_COOLDOWN_MS - since) / 1000)}s` },
      { status: 429, headers: NO_STORE }
    );
  }
  try {
    // Live config: SMTP from env, recipients from dashboard settings.
    const config = await resolveMonitorConfig();
    const dateKey = dateKeyFor(new Date(), config.timeZone);
    const report = await assembleReport(dateKey, config.timeZone);
    // sendReportMail already scrubs its reason; it never returns credentials.
    const result = await sendReportMail(report, config);
    // Only a successful send starts the cooldown: locking the operator out for
    // a minute after a FAILED attempt punishes exactly the setup iteration
    // this endpoint exists for.
    if (result.sent) lastSentAt = Date.now();
    return NextResponse.json(result, { status: result.sent ? 200 : 400, headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ sent: false, reason: error.message }, { status: 500, headers: NO_STORE });
  }
}
