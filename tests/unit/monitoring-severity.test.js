import { describe, expect, it } from "vitest";
import {
  severityForWindow, pickActiveWindow, FALLBACK_THRESHOLDS, SEV_TOKENS, SEV_CSS_VARS,
} from "../../src/lib/monitoring/tokens.js";

describe("severityForWindow", () => {
  it("prefers the severity the API supplies over our thresholds", () => {
    // Observed in spike 0: Anthropic ships its own severity per window.
    expect(severityForWindow({ percent: 100, severity: "critical" })).toBe("critical");
    // 34% would be "low" by our thresholds; the API says normal — same tier, but
    // the point is we do not recompute when it told us.
    expect(severityForWindow({ percent: 34, severity: "normal" })).toBe("low");
    expect(severityForWindow({ percent: 10, severity: "warning" })).toBe("high");
  });

  it("falls back to our thresholds only when severity is absent", () => {
    expect(FALLBACK_THRESHOLDS).toEqual({ critical: 90, high: 75, medium: 50 });
    expect(severityForWindow({ utilization: 95 })).toBe("critical");
    expect(severityForWindow({ utilization: 90 })).toBe("critical");
    expect(severityForWindow({ utilization: 80 })).toBe("high");
    expect(severityForWindow({ utilization: 60 })).toBe("medium");
    expect(severityForWindow({ utilization: 10 })).toBe("low");
  });

  it("returns info for an absent window rather than implying zero use", () => {
    // seven_day_opus: null was observed live. A fabricated 0% reads as headroom.
    expect(severityForWindow(null)).toBe("info");
    expect(severityForWindow(undefined)).toBe("info");
    expect(severityForWindow({})).toBe("info");
  });

  it("ships a colour token set for every tier it can return", () => {
    for (const tier of ["critical", "high", "medium", "low", "info"]) {
      expect(SEV_TOKENS[tier]).toMatchObject({
        fill: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        line: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        text: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        dot:  expect.stringMatching(/^#[0-9a-f]{6}$/i),
      });
    }
  });
});

describe("pickActiveWindow", () => {
  it("returns the window Anthropic marks active", () => {
    const limits = [
      { kind: "session", percent: 8, is_active: true },
      { kind: "weekly_all", percent: 63, is_active: false },
    ];
    expect(pickActiveWindow(limits).kind).toBe("session");
  });

  it("falls back to the highest percent when none is marked active", () => {
    expect(pickActiveWindow([
      { kind: "session", percent: 8 },
      { kind: "weekly_all", percent: 63 },
    ]).kind).toBe("weekly_all");
  });

  it("returns null for empty or missing input", () => {
    expect(pickActiveWindow([])).toBe(null);
    expect(pickActiveWindow(null)).toBe(null);
  });
});

describe("SEV_TOKENS provenance", () => {
  it("carries the dakara-ds solid severity colours as the dot", () => {
    // dakara-ds/tokens.css --sev-*: these are the design system's values, not
    // ours. If the brand ramp moves, this test is what catches the drift.
    expect(SEV_TOKENS.critical.dot).toBe("#c92e2e");
    expect(SEV_TOKENS.high.dot).toBe("#ff8a1f");
    expect(SEV_TOKENS.medium.dot).toBe("#f0ab00");
    expect(SEV_TOKENS.low.dot).toBe("#10a45a");
    expect(SEV_TOKENS.info.dot).toBe("#3578b5");
  });

  it("exposes live CSS variables for the dashboard, which must theme in dark mode", () => {
    // The email needs flattened hex; the page must NOT use it or dark mode breaks.
    expect(SEV_CSS_VARS.critical.fill).toBe("var(--sev-critical-soft)");
    expect(SEV_CSS_VARS.critical.text).toBe("var(--sev-critical-text)");
    for (const tier of ["critical", "high", "medium", "low", "info"]) {
      for (const slot of ["fill", "line", "text", "dot"]) {
        expect(SEV_CSS_VARS[tier][slot]).toMatch(/^var\(--sev-/);
      }
    }
  });
});
