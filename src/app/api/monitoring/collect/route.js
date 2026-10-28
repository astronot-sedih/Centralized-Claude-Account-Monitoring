// POST /api/monitoring/collect — sample every Claude account's quota now.
//
// Auth: deny-by-default /api guard (see report/route.js).

import { NextResponse } from "next/server";
import { collectOnce } from "@/lib/monitoring/quotaCollector.js";
import { monitorSettingsFromEnv } from "@/lib/monitoring/mailer.js";
import { dateKeyFor } from "@/lib/monitoring/clock.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST() {
  try {
    const { timeZone } = monitorSettingsFromEnv();
    const result = await collectOnce({ dateKey: dateKeyFor(new Date(), timeZone) });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
}
