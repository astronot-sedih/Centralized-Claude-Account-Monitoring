// POST /api/monitoring/collect — sample every Claude account's quota now.
//
// Auth: deny-by-default /api guard (see report/route.js).

import { NextResponse } from "next/server";
import { collectOnce } from "@/lib/monitoring/quotaCollector.js";
import { monitorSettingsFromEnv } from "@/lib/monitoring/mailer.js";
import { dateKeyFor } from "@/lib/monitoring/clock.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// A pass is 11 accounts x 1.5s against a rate-limited upstream. Each call
// starts a FRESH pass, so without a cooldown a loop of these defeats the
// sequential pacing entirely.
export const COLLECT_COOLDOWN_MS = 60000;
const NO_STORE = { "Cache-Control": "no-store" };

let lastCollectAt = 0;

export async function POST() {
  const since = Date.now() - lastCollectAt;
  if (since < COLLECT_COOLDOWN_MS) {
    return NextResponse.json(
      { error: `rate limited, retry in ${Math.ceil((COLLECT_COOLDOWN_MS - since) / 1000)}s` },
      { status: 429, headers: NO_STORE }
    );
  }
  lastCollectAt = Date.now();

  try {
    const { timeZone } = monitorSettingsFromEnv();
    const result = await collectOnce({ dateKey: dateKeyFor(new Date(), timeZone) });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
}
