import { describe, expect, it } from "vitest";
import {
  severityForWindow, pickActiveWindow, FALLBACK_THRESHOLDS, SEV_TOKENS,
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
