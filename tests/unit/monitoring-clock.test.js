import { describe, expect, it } from "vitest";
import { dateKeyFor, localHourFor, DEFAULT_TZ } from "../../src/lib/monitoring/clock.js";

describe("dateKeyFor", () => {
  it("defaults to Asia/Jakarta", () => {
    expect(DEFAULT_TZ).toBe("Asia/Jakarta");
  });

  it("rolls the day at local midnight, not UTC midnight", () => {
    // 2026-10-28T17:30Z is already 2026-10-29 00:30 in Jakarta (UTC+7).
    expect(dateKeyFor(new Date("2026-10-28T17:30:00Z"), "Asia/Jakarta")).toBe("2026-10-29");
    expect(dateKeyFor(new Date("2026-10-28T16:59:00Z"), "Asia/Jakarta")).toBe("2026-10-28");
  });

  it("gives the same instant a different key in a different zone", () => {
    const t = new Date("2026-10-28T17:30:00Z");
    expect(dateKeyFor(t, "Asia/Jakarta")).toBe("2026-10-29");
    expect(dateKeyFor(t, "UTC")).toBe("2026-10-28");
  });

  it("falls back to the default zone when given a bogus one", () => {
    // An operator typo must not crash the scheduler on every tick.
    expect(dateKeyFor(new Date("2026-10-28T17:30:00Z"), "Not/AZone")).toBe("2026-10-29");
  });
});

describe("localHourFor", () => {
  it("returns the local hour in the given zone", () => {
    expect(localHourFor(new Date("2026-10-28T00:30:00Z"), "Asia/Jakarta")).toBe(7);
    expect(localHourFor(new Date("2026-10-28T00:30:00Z"), "UTC")).toBe(0);
  });

  it("returns 0 for local midnight rather than 24", () => {
    expect(localHourFor(new Date("2026-10-28T17:30:00Z"), "Asia/Jakarta")).toBe(0);
  });
});
