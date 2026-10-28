import { describe, expect, it } from "vitest";
import { renderReportHtml } from "../../src/lib/monitoring/report/renderHtml.js";
import { buildReport } from "../../src/lib/monitoring/report/buildReport.js";

const report = buildReport({
  dateKey: "2026-10-28", samplesExpected: 24, weekSnapshots: [],
  usageByConnection: { alice: [{ promptTokens: 10, completionTokens: 2 }] },
  pricing: {},
  snapshots: [
    { connectionId: "alice", accountEmail: "alice@t.io", source: "9router", ok: 1,
      capturedAt: "2026-10-28T15:00:00.000Z",
      quotas: { "session (5h)": { used: 94, severity: "critical" } } },
    { connectionId: "sari", accountEmail: "sari@t.io", source: "desktop", ok: 1,
      capturedAt: "2026-10-28T15:00:00.000Z",
      quotas: { "session (5h)": { used: 97 } } },
  ],
});

describe("renderReportHtml", () => {
  const html = renderReportHtml(report);

  it("survives an email client that strips CSS and blocks images", () => {
    // Dakara Badge rule, mandatory here: colour is never the only signal.
    expect(html).toContain("94");
    expect(html).toContain("97");
    expect(html).not.toContain("<img");
  });

  it("uses no CSS feature email clients drop", () => {
    expect(html).not.toContain("var(--");
    expect(html).not.toMatch(/display\s*:\s*flex/);
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/https?:\/\//);   // no external fetch of any kind
    expect(html).not.toContain("color-mix");
  });

  it("prints 'tak terukur' for an unmeasurable cell, not a blank or a zero", () => {
    expect(html).toContain("tak terukur");
  });

  it("includes every account row and the footnotes", () => {
    expect(html).toContain("alice@t.io");
    expect(html).toContain("sari@t.io");
    // Footnote text is HTML-escaped on the way in, so compare escaped.
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    for (const f of report.footnotes) expect(html).toContain(esc(f.slice(0, 24)));
  });

  it("states sampling coverage so a partial day cannot read as complete", () => {
    expect(html).toMatch(/cakupan|coverage/i);
  });

  it("escapes account text rather than interpolating it raw", () => {
    const evil = renderReportHtml(buildReport({
      dateKey: "2026-10-28", samplesExpected: 1, weekSnapshots: [],
      usageByConnection: {}, pricing: {},
      snapshots: [{ connectionId: "x", accountEmail: "<script>alert(1)</script>",
                    source: "desktop", ok: 1, capturedAt: "2026-10-28T15:00:00.000Z",
                    quotas: {} }],
    }));
    expect(evil).not.toContain("<script>alert(1)</script>");
    expect(evil).toContain("&lt;script&gt;");
  });

  it("uses the dakara severity colours", () => {
    // Real --sev-* values, not approximations.
    expect(html.toLowerCase()).toContain("#c92e2e");
  });

  it("renders a failed read as an error, never as 0%", () => {
    const withDead = renderReportHtml(buildReport({
      dateKey: "2026-10-28", samplesExpected: 1, weekSnapshots: [],
      usageByConnection: {}, pricing: {},
      snapshots: [{ connectionId: "d", accountEmail: "d@t.io", source: "desktop",
                    ok: 0, quotas: null, errorMessage: "token expired",
                    capturedAt: "2026-10-28T15:00:00.000Z" }],
    }));
    expect(withDead).toMatch(/gagal|tidak terbaca/i);
    expect(withDead).not.toMatch(/>\s*0%\s*</);
  });
});

describe("renderReportHtml — absence is not one thing", () => {
  it("distinguishes a window the account does not have from an unmeasurable token count", () => {
    // Conflating them tells the reader the wrong reason the cell is empty.
    const r = buildReport({
      dateKey: "2026-10-28", samplesExpected: 24, weekSnapshots: [],
      usageByConnection: {}, pricing: {},
      snapshots: [
        { connectionId: "a", accountEmail: "a@t.io", source: "desktop", ok: 1,
          capturedAt: "2026-10-28T15:00:00.000Z",
          quotas: { "session (5h)": { used: 10 }, "weekly opus (7d)": { used: 5 } } },
        { connectionId: "b", accountEmail: "b@t.io", source: "desktop", ok: 1,
          capturedAt: "2026-10-28T15:00:00.000Z",
          quotas: { "session (5h)": { used: 20 } } },
      ],
    });
    const html = renderReportHtml(r);
    expect(html).toContain("tidak ada");    // b has no opus window
    expect(html).toContain("tak terukur");  // neither has measurable units
  });
});
