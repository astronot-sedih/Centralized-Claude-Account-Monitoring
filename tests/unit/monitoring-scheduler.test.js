import { describe, expect, it, vi } from "vitest";
import { tick, startScheduler, RETENTION_DAYS } from "../../src/lib/monitoring/scheduler.js";

const deps = (over = {}) => ({
  enabled: true, timeZone: "Asia/Jakarta", reportHour: 7,
  now: () => new Date("2026-10-28T01:00:00Z"),   // 08:00 Jakarta
  lastSentDateKey: null,
  collectOnce: vi.fn(async () => ({ attempted: 2, ok: 2, failed: 0 })),
  sendReport: vi.fn(async () => true),
  setLastSentDateKey: vi.fn(async () => {}),
  pruneSnapshotsOlderThan: vi.fn(async () => 0),
  ...over,
});

describe("tick", () => {
  it("does nothing at all while the feature is disabled", async () => {
    const d = deps({ enabled: false });
    const r = await tick(d);
    expect(r).toMatchObject({ sampled: false, sent: false });
    expect(d.collectOnce).not.toHaveBeenCalled();
    expect(d.sendReport).not.toHaveBeenCalled();
  });

  it("samples on every tick", async () => {
    const d = deps({ now: () => new Date("2026-10-28T06:00:00Z") }); // 13:00, already past report hour
    const r = await tick(d);
    expect(d.collectOnce).toHaveBeenCalledTimes(1);
    expect(r.sampled).toBe(true);
  });

  it("sends once the local report hour has passed and nothing was sent today", async () => {
    const d = deps();
    const r = await tick(d);
    expect(r.sent).toBe(true);
    expect(d.setLastSentDateKey).toHaveBeenCalledWith("2026-10-28");
  });

  it("never sends twice for the same local day", async () => {
    const d = deps({ lastSentDateKey: "2026-10-28" });
    const r = await tick(d);
    expect(r.sent).toBe(false);
    expect(d.sendReport).not.toHaveBeenCalled();
  });

  it("catches up when the machine was asleep at the report hour", async () => {
    // 10:00 Jakarta, report hour 07:00, nothing sent yet today -> send now.
    const d = deps({ now: () => new Date("2026-10-28T03:00:00Z"), lastSentDateKey: "2026-10-27" });
    expect((await tick(d)).sent).toBe(true);
  });

  it("collapses a multi-day backlog into one report for today", async () => {
    const d = deps({ lastSentDateKey: "2026-10-20" });
    await tick(d);
    expect(d.sendReport).toHaveBeenCalledTimes(1);
    expect(d.setLastSentDateKey).toHaveBeenCalledWith("2026-10-28");
  });

  it("does not send before the report hour", async () => {
    // 05:00 Jakarta
    const d = deps({ now: () => new Date("2026-10-27T22:00:00Z"), lastSentDateKey: "2026-10-26" });
    expect((await tick(d)).sent).toBe(false);
  });

  it("still records the send when sampling failed, and vice versa", async () => {
    const d = deps({ collectOnce: vi.fn(async () => { throw new Error("db locked"); }) });
    const r = await tick(d);
    expect(r.sampled).toBe(false);
    expect(r.sent).toBe(true);        // a bad sample must not suppress the report
  });

  it("prunes past the retention window once a day, not on every tick", async () => {
    // 90 days, spec §5.1. Pruning hourly would be wasted writes; never pruning
    // lets ~/.9router grow without bound. Keyed on lastPrunedDateKey, NOT on
    // the send — see "pruning is not hostage to email" below.
    const prune = vi.fn(async () => 0);
    const first = await tick(deps({ pruneSnapshotsOlderThan: prune }));
    expect(RETENTION_DAYS).toBe(90);
    expect(first.pruned).toBe(true);
    expect(prune).toHaveBeenCalledWith("2026-07-30");   // 90 days before 2026-10-28

    prune.mockClear();
    await tick(deps({ lastPrunedDateKey: "2026-10-28", pruneSnapshotsOlderThan: prune }));
    expect(prune).not.toHaveBeenCalled();
  });

  it("does not let a failing prune suppress the report", async () => {
    const d = deps({ pruneSnapshotsOlderThan: vi.fn(async () => { throw new Error("locked"); }) });
    expect((await tick(d)).sent).toBe(true);
  });

  it("does not mark the day sent when sending itself failed", async () => {
    // Otherwise one SMTP outage silently costs that day's report forever.
    const d = deps({ sendReport: vi.fn(async () => { throw new Error("smtp down"); }) });
    const r = await tick(d);
    expect(r.sent).toBe(false);
    expect(d.setLastSentDateKey).not.toHaveBeenCalled();
  });
});

describe("startScheduler", () => {
  it("refuses to start twice in one process", async () => {
    const stop1 = startScheduler(deps());
    const stop2 = startScheduler(deps());
    expect(stop2).toBe(null);          // Next dev-mode double-invocation
    stop1();
  });
});

describe("tick — pruning is not hostage to email", () => {
  it("prunes once a day even when no report is sent", async () => {
    // The intended "sample hourly, read the dashboard, skip email" mode never
    // sends, so gating prune on a successful send meant ~96k rows/year
    // accumulating and the 90-day retention never applying.
    const prune = vi.fn(async () => 0);
    const setLastPruned = vi.fn(async () => {});
    const r = await tick(deps({
      sendReport: vi.fn(async () => { throw new Error("no SMTP host configured"); }),
      pruneSnapshotsOlderThan: prune,
      lastPrunedDateKey: "2026-10-27",
      setLastPrunedDateKey: setLastPruned,
    }));
    expect(r.sent).toBe(false);
    expect(prune).toHaveBeenCalledWith("2026-07-30");
    expect(setLastPruned).toHaveBeenCalledWith("2026-10-28");
  });

  it("prunes at most once per local day", async () => {
    const prune = vi.fn(async () => 0);
    await tick(deps({ lastPrunedDateKey: "2026-10-28", pruneSnapshotsOlderThan: prune }));
    expect(prune).not.toHaveBeenCalled();
  });
});
