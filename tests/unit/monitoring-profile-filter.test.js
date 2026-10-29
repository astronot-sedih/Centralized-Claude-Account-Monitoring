import { describe, expect, it } from "vitest";
import { filterStatsByProfile, profileOptions } from "../../src/lib/monitoring/profileFilter.js";

const stats = {
  totalRequests: 10,
  totalCost: 3,
  byAccount: {
    "conn-a": { requests: 6, cost: 2, promptTokens: 600, completionTokens: 60 },
    "conn-b": { requests: 3, cost: 0.9, promptTokens: 300, completionTokens: 30 },
    "conn-c": { requests: 1, cost: 0.1, promptTokens: 100, completionTokens: 10 },
  },
};
const assignments = { "conn-a": "p1", "conn-b": "p1" };   // conn-c unassigned

describe("filterStatsByProfile", () => {
  it("returns everything when no profile is selected", () => {
    expect(filterStatsByProfile(stats, assignments, "")).toBe(stats);
    expect(filterStatsByProfile(stats, assignments, null)).toBe(stats);
  });

  it("keeps only the accounts belonging to the profile", () => {
    const r = filterStatsByProfile(stats, assignments, "p1");
    expect(Object.keys(r.byAccount).sort()).toEqual(["conn-a", "conn-b"]);
  });

  it("recomputes the totals from the kept accounts", () => {
    // Leaving the original totals would show one person's rows under the
    // whole team's numbers — worse than not filtering at all.
    const r = filterStatsByProfile(stats, assignments, "p1");
    expect(r.totalRequests).toBe(9);
    expect(r.totalCost).toBeCloseTo(2.9, 5);
  });

  it("supports the unassigned bucket", () => {
    const r = filterStatsByProfile(stats, assignments, "__none__");
    expect(Object.keys(r.byAccount)).toEqual(["conn-c"]);
    expect(r.totalRequests).toBe(1);
  });

  it("returns an empty, zeroed result for a profile with no accounts", () => {
    const r = filterStatsByProfile(stats, assignments, "p-unknown");
    expect(r.byAccount).toEqual({});
    expect(r.totalRequests).toBe(0);
    expect(r.totalCost).toBe(0);
  });

  it("tolerates stats with no byAccount at all", () => {
    expect(filterStatsByProfile({ totalRequests: 5 }, assignments, "p1")).toEqual({ totalRequests: 5 });
  });
});

describe("profileOptions", () => {
  const profiles = [{ id: "p1", name: "Rafli" }];

  it("offers the unassigned bucket when a connection has no profile", () => {
    const o = profileOptions(profiles, assignments, ["conn-a", "conn-b", "conn-c"]);
    expect(o.map((x) => x.value)).toEqual(["", "p1", "__none__"]);
  });

  it("hides the bucket when every connection is assigned", () => {
    // An option that can only ever show an empty table is noise.
    const o = profileOptions(profiles, { "conn-a": "p1" }, ["conn-a"]);
    expect(o.map((x) => x.value)).toEqual(["", "p1"]);
  });

  it("hides the bucket rather than guessing when the list is not given", () => {
    const o = profileOptions(profiles, { "conn-a": "p1" });
    expect(o.map((x) => x.value)).toEqual(["", "p1"]);
  });

  it("offers only All when no profiles exist yet", () => {
    expect(profileOptions([], {}, ["conn-a"]).map((x) => x.value)).toEqual([""]);
  });
});

describe("filterStatsByProfile — every total the payload carries", () => {
  // The real /api/usage/stats shape. A total left unrecomputed survives the
  // filter: the page showed Cached Tokens 480,247,770 beside Total Requests 0,
  // which reads as a bug in the data rather than in the filter.
  const real = {
    totalRequests: 100,
    totalPromptTokens: 9000,
    totalCompletionTokens: 900,
    totalCachedTokens: 8000,
    totalCost: 5,
    byAccount: {
      "conn-a": { requests: 70, promptTokens: 7000, completionTokens: 700, cachedTokens: 6000, cost: 4 },
      "conn-b": { requests: 30, promptTokens: 2000, completionTokens: 200, cachedTokens: 2000, cost: 1 },
    },
    byModel: { "claude-opus-5": { requests: 100 } },
  };
  const map = { "conn-a": "p1" };

  it("recomputes every total*, not just requests and cost", () => {
    const r = filterStatsByProfile(real, map, "p1");
    expect(r.totalRequests).toBe(70);
    expect(r.totalPromptTokens).toBe(7000);
    expect(r.totalCompletionTokens).toBe(700);
    expect(r.totalCachedTokens).toBe(6000);
    expect(r.totalCost).toBe(4);
  });

  it("zeroes every total when the profile has no traffic", () => {
    const r = filterStatsByProfile({ ...real, byAccount: {} }, map, "p1");
    expect(r.totalRequests).toBe(0);
    expect(r.totalCachedTokens).toBe(0);
    expect(r.totalPromptTokens).toBe(0);
    expect(r.totalCost).toBe(0);
  });
});
