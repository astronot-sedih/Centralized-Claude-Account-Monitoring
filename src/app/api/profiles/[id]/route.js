// PATCH/DELETE /api/profiles/[id] — rename, or remove and unassign.

import { NextResponse } from "next/server";
import { renameProfile, deleteProfile, assignConnectionProfile } from "@/lib/db/repos/profilesRepo.js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Assigning a connection to this profile shares the route: it is the same
    // resource from the user's point of view.
    if (body?.connectionId !== undefined) {
      await assignConnectionProfile(body.connectionId, body.assign === false ? null : id);
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    const profile = await renameProfile(id, body?.name, body?.note);
    return NextResponse.json({ profile }, { headers: NO_STORE });
  } catch (error) {
    const bad = /required|already exists/i.test(error.message);
    return NextResponse.json(
      { error: error.message },
      { status: bad ? 400 : 500, headers: NO_STORE }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    // Connections assigned to it are unassigned, not orphaned — see the repo.
    const ok = await deleteProfile(id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: NO_STORE });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
}
