// View-model logic for the monitoring dashboard page.
//
// Separated from the JSX so it can be unit-tested: this repo's vitest runs in
// a node environment with no JSX transform, and the decisions worth testing
// (which label an empty cell gets, which tone a tile takes) are decisions, not
// markup.

import { SEV_CSS_VARS } from "./tokens.js";

export const UNMEASURABLE = "tak terukur";
export const NO_WINDOW = "tidak ada";

/**
 * Bar geometry and colour for one quota meter. Colours are LIVE CSS variables,
 * not the email's flattened hex, so the page themes correctly in dark mode.
 */
export function meterStyle(percent, severity) {
  const sev = SEV_CSS_VARS[severity] || SEV_CSS_VARS.info;
  // --input is a translucent neutral that reads on both themes. --line-2 is
  // near-transparent in dark mode, which made the bar invisible and left the
  // severity carried by colour alone.
  const track = "var(--input, rgba(127,127,127,0.18))";
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    return { width: null, fill: sev.dot, text: sev.text, track };
  }
  const clamped = Math.max(0, Math.min(100, percent));
  return {
    width: `${clamped}%`,
    fill: sev.dot,
    text: sev.text,
    track,
  };
}

/**
 * Text for a cell, keeping the two kinds of absence distinct:
 * a window the account does not have vs a value we cannot measure.
 */
export function cellText(percent, { hasWindow, ok } = {}) {
  if (typeof percent === "number" && Number.isFinite(percent)) return `${Math.round(percent)}%`;
  if (!hasWindow && ok) return NO_WINDOW;
  return UNMEASURABLE;
}

export function sourceLabel(source) {
  const measured = source === "9router";
  return {
    // The stored source value stays "9router" — it is written into every
    // snapshot row — but what the reader sees is the product's name.
    label: measured ? "Dakara Router" : "Desktop",
    measured,
    severity: measured ? "low" : "info",
  };
}

const nf = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function formatUnits(units) {
  if (typeof units !== "number" || !Number.isFinite(units)) return UNMEASURABLE;
  return nf.format(Math.round(units));
}

export function formatUsd(cost) {
  if (typeof cost !== "number" || !Number.isFinite(cost)) return UNMEASURABLE;
  // Sub-cent values keep four decimals rather than rounding to $0.00, which
  // would read as "free".
  return `$${cost > 0 && cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}`;
}

/**
 * Summary tiles. `tone` colours the value by what the data MEANS rather than a
 * fixed status (the design system's StatCard tone semantics).
 */
export function summaryTiles(report) {
  const s = report?.summary || {};
  const c = report?.coverage || {};
  const tiles = [
    {
      key: "atRisk",
      label: "Akun di atas 90%",
      value: s.atRiskCount || 0,
      tone: s.atRiskCount > 0 ? "critical" : "low",
      hint: `dari ${s.accountCount || 0} akun`,
    },
    {
      key: "limitDays",
      label: "Hari kena limit (7h)",
      value: s.limitDaysThisWeek || 0,
      tone: s.limitDaysThisWeek >= 3 ? "critical" : s.limitDaysThisWeek > 0 ? "medium" : "low",
      hint: "berdasarkan sampel tersimpan",
    },
    {
      key: "measured",
      label: "Terukur penuh",
      value: s.measuredCount || 0,
      tone: "info",
      hint: "lewat Dakara Router",
    },
    {
      key: "unmeasured",
      label: "Hanya kuota",
      value: s.unmeasuredCount || 0,
      tone: "info",
      hint: "Desktop — hanya persen kuota, token & biaya tak terukur",
    },
    {
      key: "coverage",
      label: "Cakupan sampling",
      value: `${Math.round(c.percent || 0)}%`,
      tone: c.partial ? "medium" : "low",
      hint: `${c.samplesTaken || 0}/${c.samplesExpected || 0} sampel`,
    },
  ];

  // Only when there is something to report — a zero tile would be noise.
  if (s.failedReadCount > 0) {
    tiles.push({
      key: "failed",
      label: "Gagal dibaca",
      value: s.failedReadCount,
      tone: "high",
      hint: "token kedaluwarsa atau endpoint menolak",
    });
  }

  return tiles;
}
