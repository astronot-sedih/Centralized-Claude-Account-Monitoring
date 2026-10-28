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
    expect(text).toContain("9router");
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
