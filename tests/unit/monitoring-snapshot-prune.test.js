import { describe, expect, it, beforeEach } from "vitest";
import { insertSnapshot, pruneSnapshotsOlderThan, getSnapshotsForDate }
  from "../../src/lib/db/repos/quotaSnapshotsRepo.js";
import { getAdapter } from "../../src/lib/db/driver.js";

const C = "prune-test-conn";

// These tests run against the real dev DB, so they must leave no trace and
// must not depend on what a previous run left behind.
async function wipe() {
  const db = await getAdapter();
  db.run(`DELETE FROM quotaSnapshots WHERE connectionId = ?`, [C]);
}

describe("pruneSnapshotsOlderThan", () => {
  beforeEach(wipe);

  it("deletes older rows and keeps the boundary day", async () => {
    for (const d of ["2026-07-01", "2026-07-30", "2026-07-31", "2026-08-01"]) {
      await insertSnapshot({
        capturedAt: `${d}T00:00:00.000Z`, dateKey: d,
        connectionId: C, provider: "claude", quotas: {}, ok: 1,
      });
    }
    const deleted = await pruneSnapshotsOlderThan("2026-07-31");
    expect(deleted).toBe(2);                                   // 07-01 and 07-30
    const mine = (k) => getSnapshotsForDate(k).then((r) => r.filter((x) => x.connectionId === C));
    expect(await mine("2026-07-31")).toHaveLength(1);
    expect(await mine("2026-08-01")).toHaveLength(1);
    expect(await mine("2026-07-30")).toEqual([]);
    await wipe();
  });

  it("deletes nothing when every row is newer", async () => {
    await insertSnapshot({
      capturedAt: "2026-08-01T00:00:00.000Z", dateKey: "2026-08-01",
      connectionId: C, provider: "claude", quotas: {}, ok: 1,
    });
    expect(await pruneSnapshotsOlderThan("1999-01-01")).toBe(0);
    await wipe();
  });
});
