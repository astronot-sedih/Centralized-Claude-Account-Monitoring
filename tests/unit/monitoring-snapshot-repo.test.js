import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  insertSnapshot, getLatestPerConnection, getSnapshotsForDate, getSnapshotRange,
} from "../../src/lib/db/repos/quotaSnapshotsRepo.js";
import { getAdapter } from "../../src/lib/db/driver.js";

const CONN = "test-conn-0001";

// Runs against the real dev DB: start from a known state and leave none behind,
// or the row counts these tests assert drift with every re-run.
async function wipe() {
  const db = await getAdapter();
  db.run(`DELETE FROM quotaSnapshots WHERE connectionId IN (?, ?)`, [CONN, CONN + "-fail"]);
}

describe("quotaSnapshotsRepo", () => {
  beforeAll(wipe);
  afterAll(wipe);
  it("round-trips a snapshot with its JSON columns parsed back", async () => {
    const quotas = { "session (5h)": { used: 8, total: 100, remaining: 92 } };
    await insertSnapshot({
      capturedAt: "2026-10-28T15:00:00.000Z", dateKey: "2026-10-28",
      connectionId: CONN, provider: "claude", accountEmail: "a@b.c",
      plan: "Claude Code", source: "9router",
      quotas, extraUsage: null, resetCredits: null, ok: 1, errorMessage: null,
    });
    const rows = await getSnapshotsForDate("2026-10-28");
    const mine = rows.find((r) => r.connectionId === CONN);
    expect(mine.quotas).toEqual(quotas);     // object, not string
    expect(mine.ok).toBe(1);
  });

  it("persists a failed read rather than dropping it", async () => {
    // "we could not read this account" is itself reportable; a missing row
    // would understate usage.
    await insertSnapshot({
      capturedAt: "2026-10-28T16:00:00.000Z", dateKey: "2026-10-28",
      connectionId: CONN + "-fail", provider: "claude",
      quotas: null, ok: 0, errorMessage: "token expired",
    });
    const rows = await getSnapshotsForDate("2026-10-28");
    const failed = rows.find((r) => r.connectionId === CONN + "-fail");
    expect(failed.ok).toBe(0);
    expect(failed.errorMessage).toBe("token expired");
    expect(failed.quotas).toBe(null);
  });

  it("returns only the newest row per connection", async () => {
    await insertSnapshot({
      capturedAt: "2026-10-28T17:00:00.000Z", dateKey: "2026-10-28",
      connectionId: CONN, provider: "claude",
      quotas: { "session (5h)": { used: 42 } }, ok: 1,
    });
    const latest = await getLatestPerConnection();
    const mine = latest.filter((r) => r.connectionId === CONN);
    expect(mine).toHaveLength(1);
    expect(mine[0].quotas["session (5h)"].used).toBe(42);
  });

  it("filters a range by dateKey inclusively", async () => {
    const rows = await getSnapshotRange(CONN, "2026-10-28", "2026-10-28");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.connectionId === CONN)).toBe(true);
  });
});
