// Shared arithmetic and colour semantics for the Claude monitoring report.
//
// Both the email renderer and the dashboard page read this module, so the two
// surfaces cannot drift apart on either the numbers or the severity tiers.
// Pure functions only — no I/O, no DB, no network.

/**
 * The weights Anthropic's quota windows are consumed by.
 *
 * Derived from 108 live Claude request records (spec §0.0.2): the formula fits
 * every row with a maximum deviation of 0.5, which is rounding. Output is
 * weighted 5x and cache reads only 0.1x, which is why raw token totals mislead
 * — two accounts with identical token counts can consume wildly different
 * amounts of quota.
 */
export const UNIT_WEIGHTS = Object.freeze({
  cacheCreation: 1.25,
  cacheRead: 0.1,
  input: 1,
  output: 5,
});

// Usage records reach us in two spellings: snake_case from the Anthropic API
// payloads, camelCase from usageHistory rows. Read both rather than making
// callers normalise.
const FIELD_ALIASES = {
  cacheCreation: ["cache_creation_input_tokens", "cacheCreationInputTokens"],
  cacheRead: ["cache_read_input_tokens", "cacheReadInputTokens"],
  input: ["input_tokens", "promptTokens"],
  output: ["output_tokens", "completionTokens"],
};

// A missing, null or non-numeric field counts as zero. Returning NaN here would
// propagate silently into a report figure, which is worse than undercounting.
function num(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return 0;
}

function read(usage, key) {
  for (const alias of FIELD_ALIASES[key]) {
    if (alias in usage) return num(usage[alias]);
  }
  return 0;
}

/**
 * Weighted quota units for one usage record.
 * @param {object|null|undefined} usage
 * @returns {number}
 */
export function computeUnits(usage) {
  if (!usage || typeof usage !== "object") return 0;
  let total = 0;
  for (const key of Object.keys(UNIT_WEIGHTS)) {
    total += read(usage, key) * UNIT_WEIGHTS[key];
  }
  return total;
}
