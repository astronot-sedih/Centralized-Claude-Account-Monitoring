import { describe, expect, it } from "vitest";
import { renderReportText } from "../../src/lib/monitoring/report/renderText.js";
import { buildReport } from "../../src/lib/monitoring/report/buildReport.js";

const report = buildReport({
  dateKey: "2026-10-28", samplesExpected: 24, weekSnapshots: [],
  usageByConnection: {}, pricing: {},
  snapshots: [
    { connectionId: "alice", accountEmail: "alice@t.io", source: "9router", ok: 1,
      capturedAt: "2026-10-28T15:00:00.000Z", quotas: { "session (5h)": { used: 94 } } },
    { connectionId: "sari", accountEmail: "sari@t.io", source: "desktop", ok: 1,
      capturedAt: "2026-10-28T15:00:00.000Z", quotas: { "session (5h)": { used: 97 } } },
  ],
});

describe("renderReportText", () => {
  const text = renderReportText(report);

  it("contains every account row", () => {
    expect(text).toContain("alice@t.io");
    expect(text).toContain("sari@t.io");
  });

  it("carries the percentages and the unmeasurable marker", () => {
    expect(text).toContain("94");
    expect(text).toContain("tak terukur");
  });

  it("carries the footnotes and the coverage line", () => {
    expect(text).toContain("Dakara Router");
    // The product name must not arrive clipped by the column width.
    expect(text).not.toMatch(/Dakara\s*…/);
    expect(text).toMatch(/cakupan|coverage/i);
  });

  it("emits no HTML tags at all", () => {
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
  });

  it("uses the same column labels as the HTML part", () => {
    // Two parts of one email that disagree are worse than one part.
    expect(text).toContain("Sesi 5j");
    expect(text).toContain("Units");
  });

  it("reports a failed read rather than printing a zero", () => {
    const t = renderReportText(buildReport({
      dateKey: "2026-10-28", samplesExpected: 1, weekSnapshots: [],
      usageByConnection: {}, pricing: {},
      snapshots: [{ connectionId: "d", accountEmail: "d@t.io", source: "desktop",
                    ok: 0, quotas: null, errorMessage: "token expired",
                    capturedAt: "2026-10-28T15:00:00.000Z" }],
    }));
    expect(t).toMatch(/gagal/i);
    expect(t).toContain("token expired");
  });
});

describe("renderReportText — column sizing", () => {
  it("does not truncate a per-model window label", () => {
    // "Mingguan opus 7h" overflowed the original fixed 12-char column.
    const t = renderReportText(buildReport({
      dateKey: "2026-10-28", samplesExpected: 1, weekSnapshots: [],
      usageByConnection: {}, pricing: {},
      snapshots: [{ connectionId: "a", accountEmail: "a@t.io", source: "desktop", ok: 1,
                    capturedAt: "2026-10-28T15:00:00.000Z",
                    quotas: { "weekly opus (7d)": { used: 88 } } }],
    }));
    expect(t).toContain("Mingguan opus 7h");
    expect(t).not.toContain("…");
  });
});

describe("renderReportText — reset times are local", () => {
  it("renders reset in the report's timezone, not UTC", () => {
    // A 23:00 Jakarta reset printed as 16:00Z, while the dashboard showed
    // 23.00 — the two surfaces disagreeing is what buildReport exists to stop.
    const r = buildReport({
      dateKey: "2026-10-28", samplesExpected: 24, weekSnapshots: [],
      usageByConnection: {}, pricing: {}, timeZone: "Asia/Jakarta",
      snapshots: [{ connectionId: "a", accountEmail: "a@t.io", source: "desktop", ok: 1,
                    capturedAt: "2026-10-28T15:00:00.000Z",
                    quotas: { "session (5h)": { used: 10, resetAt: "2026-10-28T16:00:00Z" } } }],
    });
    const t = renderReportText(r);
    expect(t).toContain("23:00");     // 16:00Z is 23:00 in Jakarta
    expect(t).not.toContain("16:00Z");
  });
});

describe("web & desktop section", () => {
  const web = {
    ok: true,
    range: { startDate: "2026-10-01", endDate: "2026-10-29" },
    summary: { totalCostUsd: 1548.81, activeUsers: 5, totalSessions: 199, linesAccepted: 90767 },
    users: [{ email: "a@x.io", totalCostUsd: 99.5, avgCostPerDayUsd: 4.1, sessions: 12 }],
  };

  it("renders the per-person figures the proxy cannot see", async () => {
    const { renderReportText: renderText } = await import("../../src/lib/monitoring/report/renderText.js");
    const out = renderText({ dateKey: "2026-10-29", rows: [], summary: {}, coverage: {}, claudeWeb: web });
    expect(out).toMatch(/WEB & DESKTOP/);
    expect(out).toMatch(/a@x\.io/);
    expect(out).toMatch(/\$1548\.81|\$1,548\.81/);
  });

  it("states a failed read instead of dropping the section", async () => {
    // A missing section reads as "the team did nothing on web and desktop",
    // the costliest misreading this report can produce.
    const { renderReportText: renderText } = await import("../../src/lib/monitoring/report/renderText.js");
    const out = renderText({
      dateKey: "2026-10-29", rows: [], summary: {}, coverage: {},
      claudeWeb: { ok: false, error: "sesi claude.ai kedaluwarsa", summary: null, users: [] },
    });
    expect(out).toMatch(/tidak terbaca/);
    expect(out).toMatch(/kedaluwarsa/);
  });

  it("leaves the section out entirely when the integration is off", async () => {
    const { renderReportText: renderText } = await import("../../src/lib/monitoring/report/renderText.js");
    const out = renderText({ dateKey: "2026-10-29", rows: [], summary: {}, coverage: {} });
    expect(out).not.toMatch(/WEB & DESKTOP/);
  });
});
