import { describe, expect, it } from "vitest";
import { buildReportRows } from "../../src/lib/monitoring/report/buildReport.js";

const snap = (id, over = {}) => ({
  connectionId: id, accountEmail: `${id}@t.io`, plan: "Claude Code",
  source: "9router", ok: 1, capturedAt: "2026-10-28T15:00:00.000Z",
  quotas: {
    "session (5h)": { used: 94, resetAt: "2026-10-28T16:00:00Z" },
    "weekly (7d)":  { used: 71, resetAt: "2026-11-03T14:00:00Z" },
  },
  ...over,
});

describe("buildReportRows", () => {
  it("fills units and cost for a proxied account", () => {
    const [row] = buildReportRows({
      snapshots: [snap("alice")],
      usageByConnection: {
        alice: [{ promptTokens: 1000, completionTokens: 100,
                  cacheCreationInputTokens: 2000, cacheReadInputTokens: 5000,
                  model: "claude-opus-5" }],
      },
      pricing: { claude: { "claude-opus-5": { input: 15, output: 75 } } },
    });
    expect(row.measurable).toBe(true);
    expect(row.units).toBeCloseTo(2000 * 1.25 + 5000 * 0.1 + 1000 + 100 * 5, 2);
    expect(row.costUsd).toBeGreaterThan(0);
  });

  it("marks a desktop row unmeasurable with null, not zero", () => {
    // A 0 would read as "this person did no work"; that misreading is the
    // single most costly failure this report can have.
    const [row] = buildReportRows({
      snapshots: [snap("sari", { source: "desktop" })],
      usageByConnection: {}, pricing: {},
    });
    expect(row.measurable).toBe(false);
    expect(row.units).toBe(null);
    expect(row.costUsd).toBe(null);
  });

  it("omits a window the API did not return rather than reporting 0%", () => {
    // seven_day_opus: null was observed live.
    const [row] = buildReportRows({
      snapshots: [snap("bob", { quotas: { "session (5h)": { used: 8 } } })],
      usageByConnection: {}, pricing: {},
    });
    expect(row.windows.map((w) => w.key)).toEqual(["session (5h)"]);
    expect(row.windows.find((w) => w.key === "weekly (7d)")).toBeUndefined();
  });

  it("carries the API's severity through per window", () => {
    const [row] = buildReportRows({
      snapshots: [snap("carl", {
        quotas: { "session (5h)": { used: 100, severity: "critical" } },
      })],
      usageByConnection: {}, pricing: {},
    });
    expect(row.windows[0].severity).toBe("critical");
  });

  it("surfaces a failed read as unknown rather than as zero use", () => {
    const [row] = buildReportRows({
      snapshots: [snap("dead", { ok: 0, quotas: null, errorMessage: "token expired" })],
      usageByConnection: {}, pricing: {},
    });
    expect(row.ok).toBe(false);
    expect(row.windows).toEqual([]);
    expect(row.errorMessage).toBe("token expired");
  });

  it("uses the newest snapshot per connection", () => {
    const [row] = buildReportRows({
      snapshots: [
        snap("alice", { capturedAt: "2026-10-28T09:00:00.000Z", quotas: { "session (5h)": { used: 10 } } }),
        snap("alice", { capturedAt: "2026-10-28T15:00:00.000Z", quotas: { "session (5h)": { used: 90 } } }),
      ],
      usageByConnection: {}, pricing: {},
    });
    expect(row.windows[0].percent).toBe(90);
  });

  it("still reports units for a measurable account whose quota read failed", () => {
    // The two data sources are independent: a dead token does not erase the
    // proxy traffic we already recorded.
    const [row] = buildReportRows({
      snapshots: [snap("alice", { ok: 0, quotas: null, errorMessage: "token expired" })],
      usageByConnection: { alice: [{ completionTokens: 10 }] },
      pricing: {},
    });
    expect(row.ok).toBe(false);
    expect(row.units).toBe(50);
  });

  it("counts units for a model with no pricing entry, with zero cost", () => {
    const [row] = buildReportRows({
      snapshots: [snap("alice")],
      usageByConnection: { alice: [{ completionTokens: 100, model: "unpriced-model" }] },
      pricing: {},
    });
    expect(row.units).toBe(500);
    expect(row.costUsd).toBe(0);
  });
});

describe("buildReportRows — getUsageHistory's actual row shape", () => {
  it("reads tokens out of the nested `tokens` object the repo returns", () => {
    // getUsageHistory() maps the row to { timestamp, provider, model,
    // connectionId, cost, status, tokens } — the counts live INSIDE tokens.
    // Passing the row straight to computeUnits scored every account 0.
    const [row] = buildReportRows({
      snapshots: [snap("alice")],
      usageByConnection: {
        alice: [{
          model: "claude-opus-5",
          cost: 0.5,
          tokens: { prompt_tokens: 1000, completion_tokens: 100, cached_tokens: 900,
                    cache_creation_input_tokens: 200 },
        }],
      },
      pricing: { claude: { "claude-opus-5": { input: 5, output: 25, cached: 0.5, cache_creation: 6.25 } } },
    });
    expect(row.units).toBeCloseTo(200 * 1.25 + 900 * 0.1 + 100 + 100 * 5, 2);
    expect(row.units).toBeGreaterThan(0);
  });

  it("prefers the cost the gateway already recorded over recomputing it", () => {
    const [row] = buildReportRows({
      snapshots: [snap("alice")],
      usageByConnection: { alice: [{ cost: 1.25, tokens: { completion_tokens: 10 } }] },
      pricing: {},
    });
    expect(row.costUsd).toBeCloseTo(1.25, 4);
  });
});
