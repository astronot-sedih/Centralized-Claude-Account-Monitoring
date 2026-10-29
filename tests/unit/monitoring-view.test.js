import { describe, expect, it } from "vitest";
import {
  meterStyle, sourceLabel, cellText, summaryTiles, formatUnits, formatUsd,
} from "../../src/lib/monitoring/view.js";

describe("meterStyle", () => {
  it("uses live CSS variables so the page themes in dark mode", () => {
    // The email needs flattened hex; the page must NOT, or dark mode breaks.
    const s = meterStyle(94, "critical");
    expect(s.fill).toBe("var(--sev-critical)");
    expect(s.width).toBe("94%");
  });

  it("clamps out-of-range percentages rather than overflowing the track", () => {
    expect(meterStyle(140, "critical").width).toBe("100%");
    expect(meterStyle(-5, "low").width).toBe("0%");
  });

  it("returns no bar for an absent window", () => {
    expect(meterStyle(null, "info").width).toBe(null);
  });
});

describe("cellText", () => {
  it("distinguishes an absent window from an unmeasurable value", () => {
    // Two different absences; one label for both tells the reader the wrong
    // reason the cell is empty.
    expect(cellText(null, { hasWindow: false, ok: true })).toBe("tidak ada");
    expect(cellText(null, { hasWindow: true, ok: true })).toBe("tak terukur");
  });

  it("never renders a zero for missing data", () => {
    expect(cellText(null, { hasWindow: false, ok: true })).not.toMatch(/0/);
    expect(cellText(0, { hasWindow: true, ok: true })).toBe("0%");
  });
});

describe("sourceLabel", () => {
  it("names the two sources plainly", () => {
    // The STORED value is still "9router" — it is written into every snapshot
    // row, so changing it would make old rows stop counting as measured — but
    // the reader sees the product's name.
    expect(sourceLabel("9router")).toMatchObject({ label: "Dakara Router", measured: true });
    expect(sourceLabel("desktop")).toMatchObject({ label: "Desktop", measured: false });
    expect(sourceLabel(null)).toMatchObject({ measured: false });
  });

  it("still recognises the stored spelling as measured", () => {
    // A rename that silently reclassified existing snapshots as unmeasurable
    // would blank the units and cost columns for every past day.
    expect(sourceLabel("9router").measured).toBe(true);
  });
});

describe("summaryTiles", () => {
  const report = {
    summary: { atRiskCount: 2, measuredCount: 2, unmeasuredCount: 9, limitDaysThisWeek: 3, failedReadCount: 1, accountCount: 11 },
    coverage: { samplesTaken: 9, samplesExpected: 24, percent: 37.5, partial: true },
  };

  it("colours the at-risk tile by what the number means, not a fixed status", () => {
    // StatCard `tone` semantics from the design system.
    const tiles = summaryTiles(report);
    const risk = tiles.find((t) => t.key === "atRisk");
    expect(risk.value).toBe(2);
    expect(risk.tone).toBe("critical");
    expect(summaryTiles({ ...report, summary: { ...report.summary, atRiskCount: 0 } })
      .find((t) => t.key === "atRisk").tone).toBe("low");
  });

  it("always surfaces how many accounts cannot be measured", () => {
    const tile = summaryTiles(report).find((t) => t.key === "unmeasured");
    expect(tile.value).toBe(9);
    expect(tile.hint).toMatch(/kuota/i);
  });

  it("flags a failed read rather than hiding it", () => {
    expect(summaryTiles(report).find((t) => t.key === "failed").tone).toBe("high");
    expect(summaryTiles({ ...report, summary: { ...report.summary, failedReadCount: 0 } })
      .find((t) => t.key === "failed")).toBeUndefined();
  });
});

describe("formatters", () => {
  it("formats units with Indonesian grouping and no decimals", () => {
    expect(formatUnits(34833941)).toBe("34.833.941");
    expect(formatUnits(null)).toBe("tak terukur");
  });

  it("formats small costs without rounding them to zero", () => {
    expect(formatUsd(135.03)).toBe("$135.03");
    expect(formatUsd(0.0004)).toBe("$0.0004");
    expect(formatUsd(null)).toBe("tak terukur");
  });
});

describe("meterStyle — the track must be visible", () => {
  it("does not use --line-2, which is near-transparent in dark mode", () => {
    // Observed in the browser: the bar was invisible, leaving colour-only
    // severity with nothing but the numeral to carry it.
    const s = meterStyle(26, "medium");
    expect(s.track).not.toBe("var(--line-2)");
    expect(s.track).toMatch(/currentColor|rgba|var\(--line\b|var\(--input/);
  });
});
