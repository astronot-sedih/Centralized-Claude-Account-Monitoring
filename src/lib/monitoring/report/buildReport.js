// Snapshots + proxy usage rows -> one plain report object.
//
// Pure: no I/O, no HTML, no strings beyond the fixed footnotes. Both the email
// renderers and the dashboard page consume the result, so the two surfaces
// cannot disagree about a number.

import { computeUnits, severityForWindow } from "../tokens.js";

const MTOK = 1_000_000;

// An account at or past this on any window is "at risk" for the summary line.
export const AT_RISK_PERCENT = 90;
// A window at this is spent — what "hit the limit" counts.
export const LIMIT_PERCENT = 100;

/**
 * The fixed footnotes. Always present, never conditional: a reader who sees
 * blank cells and no explanation concludes those people did no work, which is
 * the single most costly misreading this report can produce.
 */
export const FOOTNOTES = Object.freeze([
  "Kolom units dan estimasi biaya hanya terisi untuk akun yang jalan lewat 9router. Pemakaian dari Claude Desktop tidak bisa diukur per-akun.",
  '"tak terukur" berarti alat ini tidak dapat mengukurnya — BUKAN berarti akunnya tidak dipakai. Lihat kolom kuota untuk pemakaian sebenarnya.',
  "Angka biaya adalah estimasi setara harga API (USD), bukan tagihan. Paket Pro/Team ditagih per kursi, bukan per token.",
  "Units dihitung berbobot: cache_creation x1,25 + cache_read x0,1 + input x1 + output x5.",
]);

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

// getUsageHistory() returns { timestamp, provider, model, connectionId, cost,
// status, tokens } with the counts nested INSIDE `tokens`. Flatten so callers
// (and computeUnits) see one shape; a record whose counts stay nested scores
// zero, which reads as "this person did no work".
function flatten(record) {
  if (!record || typeof record !== "object") return {};
  const nested = record.tokens && typeof record.tokens === "object" ? record.tokens : null;
  return nested ? { ...record, ...nested } : record;
}

// USD per the repo's pricing table, which is per-MTok. This is an API-PRICE
// EQUIVALENT, never billed spend: on Pro/Team the seat is a flat fee.
function costForRecord(raw, pricing, provider = "claude") {
  // The gateway already priced this request when it recorded it; trust that
  // over a second calculation that could disagree with the usage dashboard.
  const recorded = num(raw?.cost);
  if (recorded !== null && recorded > 0) return recorded;

  const record = flatten(raw);
  const entry = pricing?.[provider]?.[record?.model];
  if (!entry) return 0;
  const g = (keys) => {
    for (const k of keys) {
      const v = num(record?.[k]);
      if (v !== null) return v;
    }
    return 0;
  };
  const input = g(["promptTokens", "input_tokens", "prompt_tokens"]);
  const output = g(["completionTokens", "output_tokens", "completion_tokens"]);
  const cacheRead = g(["cacheReadInputTokens", "cache_read_input_tokens", "cached_tokens"]);
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
  const {
    snapshots = [],
    usageByConnection = {},
    pricing = {},
    // connectionId -> workspace name. LABELS the row, never filters it: the
    // report is the case for the whole team, so narrowing it to a workspace
    // would understate it — the opposite of its purpose.
    profileNames = {},
  } = input || {};

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
        isActive: w?.isActive === true,
      }))
      .filter((w) => w.percent !== null);

    const measurable = snap.source === "9router";
    const records = usageByConnection[snap.connectionId] || [];

    // Units and cost come from proxy rows, independent of whether the quota
    // read succeeded — a dead token does not erase traffic already recorded.
    const units = measurable
      ? records.reduce((sum, r) => sum + computeUnits(flatten(r)), 0)
      : null;
    const costUsd = measurable
      ? records.reduce((sum, r) => sum + costForRecord(r, pricing, snap.provider || "claude"), 0)
      : null;

    // Spec §4.1: the reset of the window Anthropic marks ACTIVE — the one
    // actually binding the account — not merely the soonest. For an account
    // whose 5-hour window is idle and whose weekly window is the binding one,
    // the earliest reset is the wrong number to show.
    const activeWindow = windows.find((w) => w.isActive);
    const nextReset = activeWindow?.resetAt
      || windows.map((w) => w.resetAt).filter(Boolean).sort()[0]
      || null;

    return {
      connectionId: snap.connectionId,
      account: snap.accountName || snap.name || snap.accountEmail || snap.connectionId,
      email: snap.accountEmail || null,
      provider: snap.provider || null,
      profile: profileNames[snap.connectionId] || null,
      plan: snap.plan || null,
      source: snap.source || null,
      windows,
      units,
      costUsd,
      resetAt: nextReset,
      measurable,
      ok: snap.ok === 1 || snap.ok === true,
      errorMessage: snap.errorMessage || null,
      capturedAt: snap.capturedAt || null,
    };
  });
}

/**
 * The whole report: rows, the decision-relevant summary, the sampling coverage
 * those numbers rest on, and the footnotes.
 *
 * @param {object} input snapshots, usageByConnection, pricing, dateKey,
 *                       samplesExpected, weekSnapshots
 * @returns {object}
 */
export function buildReport(input) {
  const {
    dateKey = null,
    samplesExpected = 0,
    weekSnapshots = [],
    timeZone = "Asia/Jakarta",
    now = () => new Date().toISOString(),
  } = input || {};

  const rows = buildReportRows(input);

  const atRiskCount = rows.filter((r) =>
    r.windows.some((w) => w.percent >= AT_RISK_PERCENT)
  ).length;

  // Distinct DAYS, not rows: one busy day with several spent windows is still
  // one day, and counting rows would inflate the headline the Max case rests on.
  const limitDays = new Set(
    (weekSnapshots || [])
      .filter((s) =>
        Object.values(s?.quotas || {}).some(
          (w) => (num(w?.used) ?? num(w?.utilization) ?? num(w?.percent)) >= LIMIT_PERCENT
        )
      )
      .map((s) => s.dateKey)
      .filter(Boolean)
  );

  // Coverage counts PASSES, not rows. The collector now stamps one instant per
  // pass, but rows written before that fix carry a per-account instant, so
  // bucket by the hour: the sampler runs hourly, and a pass cannot straddle an
  // hour at 11 accounts x 1.5s. Without this an 11-account pass counted as 11
  // samples and a 12.5%-covered day reported 137% with no partial warning.
  const samplesTaken = new Set(
    (input?.snapshots || [])
      .map((s) => s.capturedAt)
      .filter(Boolean)
      .map((t) => String(t).slice(0, 13))
  ).size;
  // Clamp: a legacy day with more buckets than expected must not read >100%.
  const rawPercent = samplesExpected > 0 ? (samplesTaken / samplesExpected) * 100 : 0;
  const percent = Math.min(100, rawPercent);

  return {
    dateKey,
    timeZone,
    generatedAt: now(),
    rows,
    summary: {
      atRiskCount,
      limitDaysThisWeek: limitDays.size,
      measuredCount: rows.filter((r) => r.measurable).length,
      unmeasuredCount: rows.filter((r) => !r.measurable).length,
      failedReadCount: rows.filter((r) => !r.ok).length,
      accountCount: rows.length,
    },
    coverage: {
      samplesTaken,
      samplesExpected,
      percent,
      partial: samplesExpected > 0 && samplesTaken < samplesExpected,
    },
    footnotes: [...FOOTNOTES],
  };
}
