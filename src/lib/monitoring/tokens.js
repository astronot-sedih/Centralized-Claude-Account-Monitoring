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

// Usage records reach us in three spellings, and all three are real:
//   - Anthropic API payloads:      input_tokens / output_tokens /
//                                  cache_read_input_tokens
//   - usageHistory columns:        promptTokens / completionTokens
//   - usageHistory `tokens` JSON:  prompt_tokens / completion_tokens /
//                                  cached_tokens
// Read all of them rather than making callers normalise — a record in a
// spelling this function does not know scores 0, which looks like "this person
// did no work" rather than like a bug.
const FIELD_ALIASES = {
  cacheCreation: ["cache_creation_input_tokens", "cacheCreationInputTokens"],
  cacheRead: ["cache_read_input_tokens", "cacheReadInputTokens", "cached_tokens"],
  input: ["input_tokens", "promptTokens", "prompt_tokens"],
  output: ["output_tokens", "completionTokens", "completion_tokens"],
};

// In the `tokens` JSON shape, prompt_tokens is the TOTAL input including the
// cached part, which is billed at 0.1x rather than 1x. Counting both in full
// would overstate a cache-heavy account — exactly the accounts this report is
// meant to compare.
const INPUT_INCLUDES_CACHE = { input: "prompt_tokens", cache: "cached_tokens" };

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

  const parts = {};
  for (const key of Object.keys(UNIT_WEIGHTS)) parts[key] = read(usage, key);

  // Subtract the cached portion from input when this record's input field is
  // the inclusive one, so the cache discount applies instead of being added on
  // top of a full-price input.
  const { input, cache } = INPUT_INCLUDES_CACHE;
  if (input in usage && cache in usage) {
    parts.input = Math.max(0, parts.input - num(usage[cache]));
  }

  let total = 0;
  for (const key of Object.keys(UNIT_WEIGHTS)) total += parts[key] * UNIT_WEIGHTS[key];
  return total;
}

/**
 * Used ONLY when a quota window arrives without the API's own severity.
 * Anthropic supplies `severity` per window (observed in spike 0), and its
 * judgement of "you are in trouble" beats ours — these numbers cannot drift
 * from its definition if we never reach them.
 */
export const FALLBACK_THRESHOLDS = Object.freeze({
  critical: 90,
  high: 75,
  medium: 50,
});

// The API's severity vocabulary mapped onto the Neutral DS v1.12 tiers
// (critical / high / medium / low / sev-info — Badge, §2.1).
const API_SEVERITY = {
  critical: "critical",
  serious: "high",
  warning: "high",
  high: "high",
  medium: "medium",
  moderate: "medium",
  normal: "low",
  low: "low",
  ok: "low",
};

/**
 * Dakara DS `--sev-*` tiers, resolved to literal hex for the light surface.
 *
 * Values are the design system's own, from `dakara-ds/tokens.css`:
 *   --sev-critical #c92e2e  --sev-high #ff8a1f  --sev-medium #f0ab00
 *   --sev-low      #10a45a  --sev-info #3578b5
 *
 * `fill` / `line` / `text` are its `color-mix` derivations from
 * `dakara-ds/colors_and_type.css`, precomputed because email HTML supports
 * neither `color-mix()` nor custom properties (spec §4.3):
 *   soft = sev mixed p% with transparent  (critical/high/low 14%, medium 16%, info 14%)
 *   line = sev mixed p% with transparent  (critical/high/low 50%, medium 55%, info 45%)
 *   text = sev mixed p% with --ink        (critical 80%, high 58%, medium 45%, low 65%, info 70%)
 *
 * The transparent mixes are composited on white, since an email body is white
 * and `rgba()` over an unknown client background is not. `--ink` is the light
 * theme's `--sb-ink` (#0b0d10). The dashboard page keeps using the live CSS
 * variables so it themes correctly in dark mode; this map is the email's
 * flattened copy of the same system, and the one place to change if the brand
 * ramp moves.
 */
export const SEV_TOKENS = Object.freeze({
  critical: Object.freeze({ fill: "#f7e2e2", line: "#e49797", text: "#a32728", dot: "#c92e2e" }),
  high:     Object.freeze({ fill: "#ffefe0", line: "#ffc58f", text: "#995619", dot: "#ff8a1f" }),
  medium:   Object.freeze({ fill: "#fdf2d6", line: "#f7d173", text: "#725409", dot: "#f0ab00" }),
  low:      Object.freeze({ fill: "#def2e8", line: "#88d2ad", text: "#0e6f40", dot: "#10a45a" }),
  info:     Object.freeze({ fill: "#e3ecf5", line: "#a4c2de", text: "#285884", dot: "#3578b5" }),
});

/**
 * The live CSS custom properties the dashboard uses, so React components theme
 * with the design system instead of hardcoding the email's flattened hex.
 */
export const SEV_CSS_VARS = Object.freeze({
  critical: Object.freeze({ fill: "var(--sev-critical-soft)", line: "var(--sev-critical-line)", text: "var(--sev-critical-text)", dot: "var(--sev-critical)" }),
  high:     Object.freeze({ fill: "var(--sev-high-soft)",     line: "var(--sev-high-line)",     text: "var(--sev-high-text)",     dot: "var(--sev-high)" }),
  medium:   Object.freeze({ fill: "var(--sev-medium-soft)",   line: "var(--sev-medium-line)",   text: "var(--sev-medium-text)",   dot: "var(--sev-medium)" }),
  low:      Object.freeze({ fill: "var(--sev-low-soft)",      line: "var(--sev-low-line)",      text: "var(--sev-low-text)",      dot: "var(--sev-low)" }),
  info:     Object.freeze({ fill: "var(--sev-info-soft)",     line: "var(--sev-info-line)",     text: "var(--sev-info-text)",     dot: "var(--sev-info)" }),
});

// A window counts as present only when it carries a finite number. The existing
// usage service deliberately omits windows the API did not return, and a
// fabricated 0% would read to a manager as "plenty of headroom left".
function utilizationOf(window) {
  if (!window || typeof window !== "object") return null;
  for (const key of ["utilization", "percent"]) {
    if (typeof window[key] === "number" && Number.isFinite(window[key])) return window[key];
  }
  return null;
}

/**
 * Severity tier for one quota window.
 * @param {object|null|undefined} window
 * @returns {"critical"|"high"|"medium"|"low"|"info"}
 */
export function severityForWindow(window) {
  const used = utilizationOf(window);
  if (used === null) return "info";

  const supplied = API_SEVERITY[String(window.severity || "").toLowerCase()];
  if (supplied) return supplied;

  if (used >= FALLBACK_THRESHOLDS.critical) return "critical";
  if (used >= FALLBACK_THRESHOLDS.high) return "high";
  if (used >= FALLBACK_THRESHOLDS.medium) return "medium";
  return "low";
}

/**
 * The window currently binding the account, per Anthropic's own `is_active`
 * flag — not an assumption that it is always the 5-hour one.
 * @param {Array<object>|null|undefined} limits
 * @returns {object|null}
 */
export function pickActiveWindow(limits) {
  if (!Array.isArray(limits) || limits.length === 0) return null;
  const active = limits.find((l) => l?.is_active === true);
  if (active) return active;
  return limits.reduce((best, l) => {
    const p = utilizationOf(l);
    if (p === null) return best;
    return best === null || p > utilizationOf(best) ? l : best;
  }, null);
}
