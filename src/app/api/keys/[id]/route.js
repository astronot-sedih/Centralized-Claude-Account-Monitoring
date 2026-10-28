import { NextResponse } from "next/server";
import { deleteApiKey, getApiKeyById, updateApiKey, getProviderConnectionById } from "@/lib/localDb";
import { validateKeyAccessInput } from "@/shared/utils/keyAccess.js";

// GET /api/keys/[id] - Get single key
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);
    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }
    return NextResponse.json({ key });
  } catch (error) {
    console.log("Error fetching key:", error);
    return NextResponse.json({ error: "Failed to fetch key" }, { status: 500 });
  }
}

// PUT /api/keys/[id] - Update key
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { isActive, access, pinnedConnectionId } = body;

    const existing = await getApiKeyById(id);
    if (!existing) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (access !== undefined) {
      const checked = validateKeyAccessInput(access);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      updateData.access = checked.value;
    }
    // Pin this key to one provider connection, so its traffic can only land on
    // that account and usage is attributed to the right person. Validated
    // rather than passed through: this value reaches account selection.
    if (pinnedConnectionId !== undefined) {
      if (pinnedConnectionId === null || pinnedConnectionId === "") {
        updateData.pinnedConnectionId = null;
      } else if (typeof pinnedConnectionId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(pinnedConnectionId.trim())) {
        const target = await getProviderConnectionById(pinnedConnectionId.trim());
        if (!target) return NextResponse.json({ error: "Connection not found" }, { status: 400 });
        updateData.pinnedConnectionId = pinnedConnectionId.trim();
      } else {
        return NextResponse.json({ error: "Invalid pinnedConnectionId" }, { status: 400 });
      }
    }

    const updated = await updateApiKey(id, updateData);

    return NextResponse.json({ key: updated });
  } catch (error) {
    console.log("Error updating key:", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }
}

// DELETE /api/keys/[id] - Delete API key
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const deleted = await deleteApiKey(id);
    if (!deleted) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Key deleted successfully" });
  } catch (error) {
    console.log("Error deleting key:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
