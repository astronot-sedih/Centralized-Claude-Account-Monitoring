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
 * Neutral DS `--sev-*` tiers as literal hex.
 *
 * Literal, not `var(--sev-critical)`, because email HTML cannot use CSS custom
 * properties (spec §4.3) and both surfaces must read one map or they drift.
 * Shape per tier follows the Badge/InfoBanner soft pattern: soft `fill`, 1px
 * `line`, `text` for the label, `dot` for the 6px marker.
 */
export const SEV_TOKENS = Object.freeze({
  critical: Object.freeze({ fill: "#fdecea", line: "#e5b7af", text: "#8c2f1d", dot: "#b4442e" }),
  high:     Object.freeze({ fill: "#fdf3e2", line: "#e3c9a0", text: "#8a5a08", dot: "#b8860b" }),
  medium:   Object.freeze({ fill: "#fdf9e3", line: "#ddd4a6", text: "#6f5b10", dot: "#9c8415" }),
  low:      Object.freeze({ fill: "#eaf3ed", line: "#b4cebf", text: "#2f6b47", dot: "#3f8f5e" }),
  info:     Object.freeze({ fill: "#f4f4f5", line: "#d4d4d8", text: "#52525b", dot: "#71717a" }),
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
