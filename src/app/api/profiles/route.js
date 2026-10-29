// GET/POST /api/profiles — the people who own Claude connections.
//
// Auth: covered by dashboardGuard's deny-by-default rule for /api/*.

import { NextResponse } from "next/server";
import { listProfiles, createProfile, getConnectionProfileMap } from "@/lib/db/repos/profilesRepo.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const [profiles, assignments] = await Promise.all([
      listProfiles(),
      getConnectionProfileMap(),
    ]);
    // Counts come back with the list so the UI can show "3 akun" without a
    // second round trip per profile.
    const counts = {};
    for (const pid of Object.values(assignments)) counts[pid] = (counts[pid] || 0) + 1;
    return NextResponse.json(
      { profiles: profiles.map((p) => ({ ...p, connectionCount: counts[p.id] || 0 })), assignments },
      { headers: NO_STORE }
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const profile = await createProfile({ name: body?.name, note: body?.note });
    return NextResponse.json({ profile }, { headers: NO_STORE });
  } catch (error) {
    // A duplicate or blank name is the caller's mistake, not a server fault.
    const bad = /required|already exists/i.test(error.message);
    return NextResponse.json(
      { error: error.message },
      { status: bad ? 400 : 500, headers: NO_STORE }
    );
  }
}
