// The report as email HTML.
//
// Email is not the web: no flexbox, no CSS custom properties, no stylesheet,
// no script, no external URL, no images. Layout is tables, styles are inline,
// and every colour is literal hex resolved from the Dakara tokens (see
// SEV_TOKENS in ../tokens.js for the derivation).
//
// The binding rule carried over from the design system's Badge: the label is
// always rendered — colour is never the only signal. Clients strip CSS and
// block images, and a colourblind reader must get the same table.

import { SEV_TOKENS } from "../tokens.js";

// Dakara light-theme surface tokens, flattened. Translucent values (--line
// family is rgba over an unknown client background) are composited on white.
const T = {
  bg: "#f7f8fa",
  surface: "#ffffff",
  surface2: "#f4f4f5",
  ink: "#0b0d10",
  ink2: "#4b5563",
  muted: "#4b5563",
  line: "#e4e6ea",
  lineSoft: "#eceef1",
  track: "#e4e4e7",
  fontBody: "'Manrope', system-ui, -apple-system, sans-serif",
  fontDisplay: "'Space Grotesk', 'Outfit', system-ui, sans-serif",
  fontLabel: "'Fira Code', Menlo, ui-monospace, monospace",
  radius: "10px",
};

function esc(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Two different absences, deliberately worded differently. "tak terukur" means
// the tool cannot measure it (a Desktop account's tokens). "tidak ada" means the
// API returned no such window for this account. Collapsing them into one label
// would tell the reader the wrong thing about why a cell is empty.
const NA = `<span style="color:${T.muted};font-style:italic;font-size:11px">tak terukur</span>`;
const NO_WINDOW = `<span style="color:${T.muted};font-size:11px">tidak ada</span>`;

const fmtNum = (n) =>
  n == null ? null : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

const fmtUsd = (n) =>
  n == null ? null : `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;

function fmtTime(iso, timeZone) {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  // The report's own timezone, not UTC: a 23:00 Jakarta reset printed as
  // "16:00Z" made the email disagree with the dashboard beside it.
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

/**
 * One quota meter: a track table with a severity-filled cell, and the numeral
 * beside it. Mirrors the design system's .ds-progress (6px, pill radius) while
 * being built from tables so email clients render it.
 */
function meter(percent, severity) {
  if (percent == null) return NA;
  const sev = SEV_TOKENS[severity] || SEV_TOKENS.info;
  const width = Math.max(0, Math.min(100, percent));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">
  <tr>
    <td style="width:54px;padding:0">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="54" style="border-collapse:collapse;background:${T.track};border-radius:9999px">
        <tr><td style="padding:0;font-size:0;line-height:0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}%" style="border-collapse:collapse">
            <tr><td style="height:6px;background:${sev.dot};border-radius:9999px;font-size:0;line-height:0">&nbsp;</td></tr>
          </table>
        </td></tr>
      </table>
    </td>
    <td style="padding:0 0 0 7px;font-family:${T.fontDisplay};font-size:12px;font-weight:600;color:${sev.text};white-space:nowrap">${esc(Math.round(percent))}%</td>
  </tr>
</table>`;
}

/** Mirrors .ds-alert: soft severity fill, 1px severity line, title + sentence. */
function banner(severity, title, body) {
  const sev = SEV_TOKENS[severity] || SEV_TOKENS.info;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 14px 0">
  <tr><td style="background:${sev.fill};border:1px solid ${sev.line};border-radius:${T.radius};padding:11px 14px;font-family:${T.fontBody};font-size:13px;line-height:1.5;color:${T.ink}">
    <strong style="color:${sev.text}">${esc(title)}</strong><br>${esc(body)}
  </td></tr>
</table>`;
}

function windowCell(row, key) {
  const w = row.windows.find((x) => x.key === key);
  if (!w) return row.ok ? NO_WINDOW : NA;
  return meter(w.percent, w.severity);
}

// Columns are the union of window keys present across all rows, so a window
// no account has is simply absent rather than an empty column of "tak terukur".
function windowKeys(rows) {
  const seen = [];
  for (const r of rows) {
    for (const w of r.windows) if (!seen.includes(w.key)) seen.push(w.key);
  }
  const rank = (k) => (k === "session (5h)" ? 0 : k === "weekly (7d)" ? 1 : 2);
  return seen.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function th(text, align = "left") {
  return `<th style="text-align:${align};font-family:${T.fontLabel};font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${T.muted};font-weight:600;padding:8px 10px;border-bottom:2px solid ${T.line};white-space:nowrap">${esc(text)}</th>`;
}

function td(html, align = "left", extra = "") {
  return `<td style="text-align:${align};padding:9px 10px;border-bottom:1px solid ${T.lineSoft};font-family:${T.fontBody};font-size:12px;color:${T.ink};vertical-align:middle;${extra}">${html}</td>`;
}

function sourceChip(source) {
  const proxied = source === "9router";
  const sev = proxied ? SEV_TOKENS.low : SEV_TOKENS.info;
  const label = proxied ? "9router" : "Desktop";
  return `<span style="display:inline-block;font-family:${T.fontLabel};font-size:10px;padding:2px 6px;border-radius:6px;background:${sev.fill};border:1px solid ${sev.line};color:${sev.text};white-space:nowrap">${esc(label)}</span>`;
}

/**
 * @param {object} report from buildReport()
 * @returns {string} a complete email document
 */
export function renderReportHtml(report) {
  const rows = report?.rows || [];
  const keys = windowKeys(rows);
  const s = report?.summary || {};
  const c = report?.coverage || {};
  const tz = report?.timeZone || "Asia/Jakarta";

  const header = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 16px 0">
  <tr><td>
    <div style="font-family:${T.fontDisplay};font-size:18px;font-weight:600;color:${T.ink}">Laporan Usage Claude Tim</div>
    <div style="font-family:${T.fontLabel};font-size:11px;color:${T.muted};padding-top:3px">${esc(report?.dateKey || "")} · ${esc(rows.length)} akun</div>
  </td></tr>
</table>`;

  const atRiskSev = s.atRiskCount > 0 ? "critical" : "low";
  const summary = banner(
    atRiskSev,
    s.atRiskCount > 0
      ? `${s.atRiskCount} akun di atas 90% kuota`
      : "Tidak ada akun mendekati limit",
    `${s.measuredCount || 0} akun terukur lewat 9router, ${s.unmeasuredCount || 0} hanya kuota.` +
      (s.limitDaysThisWeek ? ` Limit tercapai pada ${s.limitDaysThisWeek} hari dalam 7 hari terakhir.` : "") +
      (s.failedReadCount ? ` ${s.failedReadCount} akun gagal dibaca.` : "")
  );

  const coverage = c.partial
    ? banner(
        "medium",
        "Cakupan sampling belum penuh",
        `Hanya ${c.samplesTaken} dari ${c.samplesExpected} sampel terambil hari ini (${Math.round(c.percent || 0)}%). Angka tren di bawah kemungkinan lebih rendah dari kenyataan.`
      )
    : `<div style="font-family:${T.fontLabel};font-size:10px;color:${T.muted};margin:0 0 10px 0">Cakupan sampling: ${esc(c.samplesTaken || 0)}/${esc(c.samplesExpected || 0)} sampel.</div>`;

  const head = `<tr>${th("Akun")}${th("Sumber")}${keys
    .map((k) => th(rows.find((r) => r.windows.some((w) => w.key === k))?.windows.find((w) => w.key === k)?.label || k))
    .join("")}${th("Units", "right")}${th("Est. biaya API (USD)", "right")}${th("Reset")}</tr>`;

  const body = rows.length
    ? rows
        .map((r) => {
          const name = `<div style="font-weight:600;color:${T.ink}">${esc(r.account)}</div>` +
            (r.email && r.email !== r.account
              ? `<div style="color:${T.muted};font-size:10.5px;padding-top:1px">${esc(r.email)}</div>`
              : "");
          const failed = !r.ok
            ? `<div style="color:${SEV_TOKENS.critical.text};font-size:10.5px;padding-top:2px">Gagal dibaca: ${esc(r.errorMessage || "tidak diketahui")}</div>`
            : "";
          return `<tr>${td(name + failed)}${td(sourceChip(r.source))}${keys
            .map((k) => td(windowCell(r, k)))
            .join("")}${td(r.units == null ? NA : esc(fmtNum(r.units)), "right", `font-family:${T.fontDisplay};font-weight:600`)}${td(
            r.costUsd == null ? NA : esc(fmtUsd(r.costUsd)),
            "right",
            `font-family:${T.fontDisplay}`
          )}${td(`<span style="font-family:${T.fontLabel};font-size:11px;color:${T.ink2}">${esc(fmtTime(r.resetAt, tz))}</span>`)}</tr>`;
        })
        .join("")
    : `<tr>${td(`<span style="color:${T.muted}">Belum ada data snapshot.</span>`)}</tr>`;

  const table = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${T.surface};border:1px solid ${T.line};border-radius:${T.radius}">
  <thead>${head}</thead>
  <tbody>${body}</tbody>
</table>`;

  const notes = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:14px 0 0 0">
  <tr><td style="background:${T.surface2};border-left:3px solid ${T.line};border-radius:4px;padding:10px 12px;font-family:${T.fontBody};font-size:11px;line-height:1.6;color:${T.ink2}">
    ${(report?.footnotes || []).map((f) => `<div style="padding:2px 0">${esc(f)}</div>`).join("")}
  </td></tr>
</table>`;

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Usage Claude ${esc(report?.dateKey || "")}</title></head>
<body style="margin:0;padding:20px;background:${T.bg};font-family:${T.fontBody};color:${T.ink}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;max-width:860px">
  <tr><td>
${header}
${summary}
${coverage}
${table}
${notes}
  </td></tr>
</table>
</body></html>`;
}
