// GET /api/monitoring/history?connectionId=...&days=N
//
// Per-account trend. Auth: deny-by-default /api guard (see report/route.js).

import { NextResponse } from "next/server";
import { getSnapshotRange } from "@/lib/db/repos/quotaSnapshotsRepo.js";
import { monitorSettingsFromEnv } from "@/lib/monitoring/mailer.js";
import { dateKeyFor } from "@/lib/monitoring/clock.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_DAYS = 90;

function shiftDays(dateKey, n) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const connectionId = params.get("connectionId");
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId is required" }, { status: 400, headers: NO_STORE });
    }

    const days = Math.min(MAX_DAYS, Math.max(1, Number(params.get("days")) || 7));
    const { timeZone } = monitorSettingsFromEnv();
    const to = dateKeyFor(new Date(), timeZone);
    const rows = await getSnapshotRange(connectionId, shiftDays(to, -(days - 1)), to);

    // Only what a trend needs: never the raw snapshot, which could grow fields.
    const series = rows.map((r) => ({
      capturedAt: r.capturedAt,
      dateKey: r.dateKey,
      ok: r.ok === 1,
      quotas: r.quotas,
    }));
    return NextResponse.json({ connectionId, days, series }, { headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
}
