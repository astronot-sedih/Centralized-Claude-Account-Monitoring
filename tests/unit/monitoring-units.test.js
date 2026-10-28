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
