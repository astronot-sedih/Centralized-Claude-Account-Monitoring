import { describe, expect, it } from "vitest";
import { buildReport } from "../../src/lib/monitoring/report/buildReport.js";

const base = {
  dateKey: "2026-10-28", samplesExpected: 24, weekSnapshots: [],
  usageByConnection: {}, pricing: {},
};
const snap = (id, used, over = {}) => ({
  connectionId: id, source: "desktop", ok: 1,
  capturedAt: "2026-10-28T15:00:00.000Z",
  quotas: { "session (5h)": { used } }, ...over,
});

describe("buildReport summary", () => {
  it("counts accounts at or past 90% on any window", () => {
    const r = buildReport({ ...base, snapshots: [snap("a", 94), snap("b", 12)] });
    expect(r.summary.atRiskCount).toBe(1);
  });

  it("splits measured from unmeasured accounts", () => {
    const r = buildReport({ ...base, snapshots: [
      snap("a", 10, { source: "9router" }), snap("b", 10), snap("c", 10),
    ]});
    expect(r.summary).toMatchObject({ measuredCount: 1, unmeasuredCount: 2 });
  });

  it("reports sampling coverage and flags a partial day", () => {
    // A trend computed from 40% coverage, presented as fact, would mislead
    // a budget decision. Downtime makes limit-days UNDERcount.
    const samples = Array.from({ length: 9 }, (_, i) => ({
      connectionId: "a", capturedAt: `2026-10-28T${String(i).padStart(2, "0")}:00:00.000Z`,
      ok: 1, source: "desktop", quotas: { "session (5h)": { used: 5 } },
    }));
    const r = buildReport({ ...base, snapshots: samples });
    expect(r.coverage).toMatchObject({ samplesTaken: 9, samplesExpected: 24, partial: true });
    expect(r.coverage.percent).toBeCloseTo(37.5, 1);
  });

  it("does not flag a full day as partial", () => {
    const samples = Array.from({ length: 24 }, (_, i) => ({
      connectionId: "a", capturedAt: `2026-10-28T${String(i).padStart(2, "0")}:00:00.000Z`,
      ok: 1, source: "desktop", quotas: { "session (5h)": { used: 5 } },
    }));
    const r = buildReport({ ...base, snapshots: samples });
    expect(r.coverage.partial).toBe(false);
  });

  it("counts days this week on which any account hit a limit", () => {
    const r = buildReport({ ...base, snapshots: [snap("a", 10)], weekSnapshots: [
      { dateKey: "2026-10-26", quotas: { "session (5h)": { used: 100 } }, ok: 1 },
      { dateKey: "2026-10-27", quotas: { "session (5h)": { used: 100 } }, ok: 1 },
      { dateKey: "2026-10-27", quotas: { "weekly (7d)": { used: 100 } }, ok: 1 },
      { dateKey: "2026-10-28", quotas: { "session (5h)": { used: 40 } }, ok: 1 },
    ]});
    expect(r.summary.limitDaysThisWeek).toBe(2);   // distinct days, not rows
  });

  it("always carries the three footnotes the spec fixes", () => {
    const r = buildReport({ ...base, snapshots: [snap("a", 10)] });
    const all = r.footnotes.join(" ");
    expect(all).toContain("Dakara Router");    // token/cost only for proxied accounts
    expect(all).toContain("tak terukur");      // what it means
    expect(all).toContain("API");              // cost is an API-price equivalent
    expect(r.footnotes.length).toBeGreaterThanOrEqual(3);
  });

  it("counts a failed read as neither at-risk nor safe, and says so", () => {
    // An unreadable account must not be silently counted as fine.
    const r = buildReport({ ...base, snapshots: [
      snap("a", 94), { connectionId: "d", source: "desktop", ok: 0, quotas: null,
                       capturedAt: "2026-10-28T15:00:00.000Z", errorMessage: "token expired" },
    ]});
    expect(r.summary.atRiskCount).toBe(1);
    expect(r.summary.failedReadCount).toBe(1);
  });

  it("carries the report date and a generated timestamp", () => {
    const r = buildReport({ ...base, snapshots: [snap("a", 10)] });
    expect(r.dateKey).toBe("2026-10-28");
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("buildReport coverage — passes, not rows", () => {
  // The collector stamps capturedAt once PER CONNECTION inside its loop, so a
  // single hourly pass over 11 accounts produces 11 distinct instants. Counting
  // instants reported 137.5% coverage on a day that was 12.5% sampled — and
  // suppressed the partial warning entirely.
  const pass = (hour, accounts) =>
    Array.from({ length: accounts }, (_, i) => ({
      connectionId: `c${i}`, source: "desktop", ok: 1,
      // seconds apart, as the 1500ms inter-account delay produces
      capturedAt: `2026-10-28T${String(hour).padStart(2, "0")}:00:${String(i * 2).padStart(2, "0")}.000Z`,
      quotas: { "session (5h)": { used: 5 } },
    }));

  it("counts one sample per pass however many accounts it covered", () => {
    const snapshots = [...pass(9, 11), ...pass(10, 11), ...pass(11, 11)];
    const r = buildReport({ ...base, snapshots });
    expect(r.coverage.samplesTaken).toBe(3);
    expect(r.coverage.percent).toBeCloseTo(12.5, 1);
    expect(r.coverage.partial).toBe(true);
  });

  it("never reports more than 100% coverage", () => {
    const snapshots = Array.from({ length: 24 }, (_, h) => pass(h, 11)).flat();
    const r = buildReport({ ...base, snapshots });
    expect(r.coverage.samplesTaken).toBe(24);
    expect(r.coverage.percent).toBeLessThanOrEqual(100);
    expect(r.coverage.partial).toBe(false);
  });
});
