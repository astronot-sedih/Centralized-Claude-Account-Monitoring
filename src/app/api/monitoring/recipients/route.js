// GET/PUT /api/monitoring/recipients — who the daily report is mailed to.
//
// Recipients live in settings rather than .env because they change: people
// join, a manager wants a copy. Editing a file on the host and restarting is
// the wrong shape for that. The SMTP host and password stay in env — those are
// deployment secrets, and monitorSmtpPass is deliberately unreadable through
// the settings API.
//
// Auth: covered by dashboardGuard's deny-by-default rule for /api/*. This repo
// has no roles, so "admin-only" means any authenticated dashboard user; the
// operator doc says teammates get API keys, not dashboard logins.

import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/localDb";
import { parseRecipients, monitorSettingsFromEnv } from "@/lib/monitoring/mailer.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_RECIPIENTS = 20;

export async function GET() {
  try {
    const settings = await getSettings();
    const stored = parseRecipients(settings?.monitorMailTo);
    const env = monitorSettingsFromEnv();
    return NextResponse.json(
      {
        recipients: stored.length ? stored : env.to,
        // So the UI can say where the list is coming from rather than letting
        // someone edit a list that the env value is silently overriding.
        source: stored.length ? "settings" : "env",
        envFallback: env.to,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const raw = Array.isArray(body?.recipients)
      ? body.recipients.join(",")
      : body?.recipients;

    const valid = parseRecipients(raw);
    const offered = String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);
    // Report what was dropped instead of silently discarding it — a typo the
    // user cannot see is a recipient who never gets the report.
    const rejected = offered.filter((s) => !valid.includes(s));

    if (valid.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { error: `Too many recipients (max ${MAX_RECIPIENTS}).` },
        { status: 400, headers: NO_STORE }
      );
    }

    await updateSettings({ monitorMailTo: valid.join(",") });
    return NextResponse.json({ recipients: valid, rejected }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
}
