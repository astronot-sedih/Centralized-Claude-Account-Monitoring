import { describe, expect, it } from "vitest";
import { computeUnits, UNIT_WEIGHTS } from "../../src/lib/monitoring/tokens.js";

describe("computeUnits", () => {
  it("applies the weights Anthropic bills quota against", () => {
    // Spec §0.0.2, verified across 108 live records (max deviation 0.5).
    expect(UNIT_WEIGHTS).toEqual({ cacheCreation: 1.25, cacheRead: 0.1, input: 1, output: 5 });
  });

  it("matches observed records on the snake_case shape", () => {
    // First row of synthetic_9router.jsonl: 3061*1.25 + 0 + 0 + 135*5 = 4501.25
    expect(computeUnits({
      input_tokens: 0, cache_creation_input_tokens: 3061,
      cache_read_input_tokens: 0, output_tokens: 135,
    })).toBeCloseTo(4501.25, 2);
  });

  it("accepts the camelCase shape usageHistory rows use", () => {
    expect(computeUnits({
      promptTokens: 100, completionTokens: 10,
      cacheCreationInputTokens: 1000, cacheReadInputTokens: 2000,
    })).toBeCloseTo(1250 + 200 + 100 + 50, 2);
  });

  it("weights output far above cache reads", () => {
    // The whole reason raw token counts mislead: same token total, 50x the cost.
    expect(computeUnits({ output_tokens: 1000 }))
      .toBeGreaterThan(computeUnits({ cache_read_input_tokens: 1000 }) * 49);
  });

  it("treats missing and malformed fields as zero rather than NaN", () => {
    expect(computeUnits({})).toBe(0);
    expect(computeUnits(null)).toBe(0);
    expect(computeUnits(undefined)).toBe(0);
    expect(computeUnits({ output_tokens: "abc" })).toBe(0);
    expect(Number.isNaN(computeUnits({ cache_read_input_tokens: null }))).toBe(false);
  });
});

describe("computeUnits — the shapes this repo actually stores", () => {
  it("reads the usageHistory.tokens JSON shape", () => {
    // Real row from the dev DB. The keys are prompt_tokens / completion_tokens
    // / cached_tokens — NOT the Anthropic API spelling, and an earlier version
    // of this function scored every such row 0.
    expect(computeUnits({
      prompt_tokens: 421999, completion_tokens: 570,
      total_tokens: 422569, cached_tokens: 420965,
      cache_creation_input_tokens: 1032,
      // prompt_tokens (421999) is the inclusive input; the cached 420965 is
      // billed at 0.1x, so only the 1034 uncached tokens count at 1x.
    })).toBeCloseTo(1032 * 1.25 + 420965 * 0.1 + (421999 - 420965) + 570 * 5, 2);
  });

  it("does not double-count prompt_tokens against cached_tokens", () => {
    // prompt_tokens in this schema is the TOTAL input including cached; the
    // cached part is billed at 0.1x, so it must be subtracted from input.
    const u = computeUnits({ prompt_tokens: 1000, cached_tokens: 900, completion_tokens: 0 });
    expect(u).toBeCloseTo(100 * 1 + 900 * 0.1, 2);
  });
});
