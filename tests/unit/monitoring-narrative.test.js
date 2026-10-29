import { describe, expect, it } from "vitest";
import { summaryNarrative, readingGuide, limitations } from "../../src/lib/monitoring/report/narrative.js";

// Shaped like the live report for this organization.
const report = {
  summary: { atRiskCount: 1, accountCount: 2, limitDaysThisWeek: 1, unmeasuredCount: 0, failedReadCount: 0 },
  coverage: { samplesTaken: 6, samplesExpected: 24, percent: 25, partial: true },
  rows: [{ connectionId: "a", windows: [] }],
  claudeWeb: {
    summary: { totalCostUsd: 1548.92, activeUsers: 5, totalSessions: 199, linesAccepted: 90767 },
    series: [{ date: "2026-10-29", costUsd: 109 }],
    activity: {
      overview: {
        utilization: { value: 90 }, dau: { value: 8 }, wau: { value: 9 },
        mau: { value: 9 }, totalMembers: 10,
      },
      series: [{ date: "2026-10-29", value: 8 }],
      members: [],
    },
  },
};

describe("summaryNarrative", () => {
  it("leads with adoption, the widest number", () => {
    const [first] = summaryNarrative(report);
    expect(first).toMatch(/10 anggota/);
    expect(first).toMatch(/9 memakai Claude/);
    expect(first).toMatch(/90%/);
  });

  it("names the gap between the two lenses", () => {
    // 9 people use Claude; 5 use Claude Code. Those 4 are exactly who a
    // decision based on Claude Code alone would miss.
    const text = summaryNarrative(report).join(" ");
    expect(text).toMatch(/4 orang memakai Claude tanpa lewat Claude Code/);
  });

  it("omits the gap sentence when the two lenses agree", () => {
    // A sentence claiming "0 orang" invites the reader to look for a group
    // that does not exist.
    const same = {
      ...report,
      claudeWeb: {
        ...report.claudeWeb,
        summary: { ...report.claudeWeb.summary, activeUsers: 9 },
      },
    };
    expect(summaryNarrative(same).join(" ")).not.toMatch(/tanpa lewat Claude Code/);
  });

  it("calls the cost an API-price equivalent, never a bill", () => {
    expect(summaryNarrative(report).join(" ")).toMatch(/harga API/);
  });

  it("states the safe case as plainly as the risky one", () => {
    const safe = { ...report, summary: { ...report.summary, atRiskCount: 0, limitDaysThisWeek: 0 } };
    expect(summaryNarrative(safe).join(" ")).toMatch(/Tidak ada akun .* mendekati batas/);
  });

  it("says nothing at all when there is no data", () => {
    // Invented prose over an empty report is worse than silence.
    expect(summaryNarrative({})).toEqual([]);
  });
});

describe("readingGuide", () => {
  it("explains each section that is actually present", () => {
    const headings = readingGuide(report).map((g) => g.heading);
    expect(headings).toContain("Adopsi Tim");
    expect(headings).toContain("Pemakaian lewat Web & Desktop");
    expect(headings).toContain("Tabel kuota per akun");
    expect(headings).toContain("Grafik harian");
  });

  it("does not explain a section the report does not contain", () => {
    // A guide to a missing table sends the reader hunting for it.
    const headings = readingGuide({ rows: [] }).map((g) => g.heading);
    expect(headings).toEqual([]);
  });

  it("warns that an empty token cell is not zero use", () => {
    const quota = readingGuide(report).find((g) => g.heading === "Tabel kuota per akun");
    expect(quota.lines.join(" ")).toMatch(/BUKAN berarti akunnya tidak dipakai/);
  });

  it("explains that bar height is relative to the range, not to quota", () => {
    const chart = readingGuide(report).find((g) => g.heading === "Grafik harian");
    expect(chart.lines.join(" ")).toMatch(/bukan terhadap kuota/);
  });
});

describe("limitations", () => {
  it("reports partial sampling with the direction of the error", () => {
    // "Lower than reality" is the part that matters: a reader who assumes the
    // opposite concludes there is headroom.
    expect(limitations(report).join(" ")).toMatch(/lebih rendah dari kenyataan/);
  });

  it("is silent when nothing limits the report", () => {
    const clean = {
      summary: { unmeasuredCount: 0, failedReadCount: 0 },
      coverage: { partial: false },
    };
    expect(limitations(clean)).toEqual([]);
  });

  it("surfaces a failed claude.ai read", () => {
    const broken = { ...report, claudeWeb: { ...report.claudeWeb, error: "sesi kedaluwarsa" } };
    expect(limitations(broken).join(" ")).toMatch(/sesi kedaluwarsa/);
  });

  it("says a failed account read counts as neither safe nor at risk", () => {
    const failed = { ...report, summary: { ...report.summary, failedReadCount: 2 } };
    expect(limitations(failed).join(" ")).toMatch(/tidak dihitung aman maupun berisiko/);
  });
});

describe("the narrative in the plain-text part", () => {
  const full = {
    dateKey: "2026-10-29", rows: [], footnotes: ["x"],
    summary: { atRiskCount: 1, accountCount: 2, limitDaysThisWeek: 1, unmeasuredCount: 0, failedReadCount: 0 },
    coverage: { samplesTaken: 6, samplesExpected: 24, percent: 25, partial: true },
    claudeWeb: report.claudeWeb,
  };

  it("leads with the finding, before the tables", async () => {
    const { renderReportText } = await import("../../src/lib/monitoring/report/renderText.js");
    const out = renderReportText(full);
    expect(out.indexOf("Dari 10 anggota tim")).toBeLessThan(out.indexOf("RINGKASAN"));
  });

  it("gives a wrapped bullet one bullet, not one per line", async () => {
    // Repeating "- " on each wrapped line turns one caveat into a list of
    // unrelated claims.
    const { renderReportText } = await import("../../src/lib/monitoring/report/renderText.js");
    const out = renderReportText(full);
    const guide = out.slice(out.indexOf("CARA MEMBACA"), out.indexOf("CATATAN"));
    // The continuation line carries no bullet and aligns under the text.
    const lines = guide.split("\n");
    const i = lines.findIndex((l) => l.includes("Cakupan terluas"));
    expect(lines[i]).toMatch(/^ {4}- /);
    expect(lines[i + 1]).toMatch(/^ {6}\S/);
    expect(lines[i + 1]).not.toMatch(/^ *- /);
  });

  it("wraps prose instead of emitting one very long line", async () => {
    const { renderReportText } = await import("../../src/lib/monitoring/report/renderText.js");
    const out = renderReportText(full);
    const prose = out.slice(out.indexOf("CARA MEMBACA"), out.indexOf("CATATAN")).split("\n");
    expect(Math.max(...prose.map((l) => l.length))).toBeLessThanOrEqual(80);
  });

  it("keeps the plain-text part free of HTML", async () => {
    const { renderReportText } = await import("../../src/lib/monitoring/report/renderText.js");
    expect(renderReportText(full)).not.toMatch(/<[a-z/][^>]*>/i);
  });

  it("puts the same narrative in the HTML part", async () => {
    // Two parts of one email that disagree are worse than one part.
    const { renderReportHtml } = await import("../../src/lib/monitoring/report/renderHtml.js");
    const html = renderReportHtml(full);
    expect(html).toMatch(/Dari 10 anggota tim/);
    expect(html).toMatch(/Cara membaca laporan ini/);
    expect(html).toMatch(/Yang laporan ini belum bisa jawab/);
  });
});
