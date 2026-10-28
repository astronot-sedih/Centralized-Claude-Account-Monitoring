// Snapshots + proxy usage rows -> one plain report object.
//
// Pure: no I/O, no HTML, no strings beyond the fixed footnotes. Both the email
// renderers and the dashboard page consume the result, so the two surfaces
// cannot disagree about a number.

import { computeUnits, severityForWindow } from "../tokens.js";

const MTOK = 1_000_000;

// Human labels for the window keys the usage service produces. An unknown key
// (Anthropic adds windows) falls through to its raw key rather than being
// dropped — an unlabelled window is still information.
const WINDOW_LABELS = {
  "session (5h)": "Sesi 5j",
  "weekly (7d)": "Mingguan 7h",
};

function labelFor(key) {
  if (WINDOW_LABELS[key]) return WINDOW_LABELS[key];
  const model = /^weekly (.+) \(7d\)$/.exec(key);
  if (model) return `Mingguan ${model[1]} 7h`;
  return key;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function percentOf(window) {
  return num(window?.used) ?? num(window?.utilization) ?? num(window?.percent);
}

// USD per the repo's pricing table, which is per-MTok. This is an API-PRICE
// EQUIVALENT, never billed spend: on Pro/Team the seat is a flat fee.
function costForRecord(record, pricing, provider = "claude") {
  const entry = pricing?.[provider]?.[record?.model];
  if (!entry) return 0;
  const g = (keys) => {
    for (const k of keys) {
      const v = num(record?.[k]);
      if (v !== null) return v;
    }
    return 0;
  };
  const input = g(["promptTokens", "input_tokens"]);
  const output = g(["completionTokens", "output_tokens"]);
  const cacheRead = g(["cacheReadInputTokens", "cache_read_input_tokens"]);
  const cacheCreate = g(["cacheCreationInputTokens", "cache_creation_input_tokens"]);
  return (
    (input * (entry.input || 0) +
      output * (entry.output || 0) +
      cacheRead * (entry.cached ?? entry.input ?? 0) +
      cacheCreate * (entry.cache_creation ?? entry.input ?? 0)) /
    MTOK
  );
}

function newestPerConnection(snapshots) {
  const byConn = new Map();
  for (const s of snapshots || []) {
    const prev = byConn.get(s.connectionId);
    if (!prev || String(s.capturedAt) > String(prev.capturedAt)) byConn.set(s.connectionId, s);
  }
  return [...byConn.values()];
}

/**
 * @param {{snapshots: Array, usageByConnection: object, pricing: object}} input
 * @returns {Array<object>} one row per connection
 */
export function buildReportRows(input) {
  const { snapshots = [], usageByConnection = {}, pricing = {} } = input || {};

  return newestPerConnection(snapshots).map((snap) => {
    // Only windows the API actually returned. Never a fixed list: a fabricated
    // 0% reads to a manager as "plenty of headroom".
    const windows = Object.entries(snap.quotas || {})
      .map(([key, w]) => ({
        key,
        label: labelFor(key),
        percent: percentOf(w),
        severity: severityForWindow({ ...w, utilization: percentOf(w) }),
        resetAt: w?.resetAt || w?.resets_at || null,
      }))
      .filter((w) => w.percent !== null);

    const measurable = snap.source === "9router";
    const records = usageByConnection[snap.connectionId] || [];

    // Units and cost come from proxy rows, independent of whether the quota
    // read succeeded — a dead token does not erase traffic already recorded.
    const units = measurable
      ? records.reduce((sum, r) => sum + computeUnits(r), 0)
      : null;
    const costUsd = measurable
      ? records.reduce((sum, r) => sum + costForRecord(r, pricing, snap.provider || "claude"), 0)
      : null;

    const earliestReset = windows
      .map((w) => w.resetAt)
      .filter(Boolean)
      .sort()[0] || null;

    return {
      connectionId: snap.connectionId,
      account: snap.accountName || snap.name || snap.accountEmail || snap.connectionId,
      email: snap.accountEmail || null,
      plan: snap.plan || null,
      source: snap.source || null,
      windows,
      units,
      costUsd,
      resetAt: earliestReset,
      measurable,
      ok: snap.ok === 1 || snap.ok === true,
      errorMessage: snap.errorMessage || null,
      capturedAt: snap.capturedAt || null,
    };
  });
}
