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
import { summaryNarrative, readingGuide, limitations } from "./narrative.js";

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

/**
 * A bar chart built from table cells.
 *
 * Mail clients run no JavaScript and most block remote images by default, so
 * a canvas or a hosted PNG reaches the reader as a blank rectangle. A table
 * of coloured cells renders everywhere, including Outlook.
 *
 * @param {Array<{date: string, value: number}>} points
 * @param {(v: number) => string} fmt how to write a value in the tooltip
 */
function chart(points, { label, fmt = (v) => String(v), height = 44, valueKey = "value" } = {}) {
  // The two series name their value differently (`value` vs `costUsd`), so
  // the key is explicit: defaulting to one of them silently draws a flat zero
  // line for the other, which reads as "nobody spent anything".
  const rows = (points || [])
    .filter((p) => p && p.date)
    .map((p) => ({ date: p.date, value: Number(p[valueKey]) || 0 }));
  if (!rows.length) return "";

  const max = Math.max(1, ...rows.map((p) => p.value));
  const bars = rows
    .map((p) => {
      const v = Number(p.value) || 0;
      // Every bar keeps a visible floor, so a zero day reads as "nothing
      // happened here" rather than as a gap in the chart.
      const h = Math.max(2, Math.round((v / max) * height));
      return `<td valign="bottom" style="padding:0 1px" title="${esc(p.date)}: ${esc(fmt(v))}">
        <div style="height:${height - h}px;line-height:1px;font-size:1px">&nbsp;</div>
        <div style="height:${h}px;background:${v ? SEV_TOKENS.info.dot : T.track};border-radius:2px 2px 0 0;line-height:1px;font-size:1px">&nbsp;</div>
      </td>`;
    })
    .join("");

  // First and last date only: 30 labels would not fit, and the reader needs
  // the span more than each tick.
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;

  return `<div style="font-family:${T.fontLabel};font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${T.muted};margin:14px 0 4px 0">${esc(label)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${T.surface};border:1px solid ${T.line};border-radius:${T.radius};padding:8px">
  <tr><td style="padding:8px 8px 4px 8px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse"><tr>${bars}</tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:4px"><tr>
      <td style="font-family:${T.fontLabel};font-size:10px;color:${T.muted};text-align:left">${esc(first)}</td>
      <td style="font-family:${T.fontLabel};font-size:10px;color:${T.muted};text-align:right">${esc(last)} &middot; puncak ${esc(fmt(max))}</td>
    </tr></table>
  </td></tr>
</table>`;
}

/**
 * Cowork rates and the file-type mix.
 *
 * What the team DOES with Claude, which session counts alone do not say: a
 * manager asking whether a plan is worth upgrading reads "2.224 operasi file
 * dokumen" differently from "199 sesi".
 *
 * Each block appears only when its data does. A heading over an empty table
 * invites the reader to conclude the activity was zero.
 */
function coworkBlock(act) {
  const c = act?.cowork;
  const cats = act?.fileCategories || [];
  if (!c && !cats.length) return "";

  const rate = (label, m, suffix = "") => {
    if (!m) return "";
    const d = m.changePercent;
    // A null change means no comparison was available, which is not the same
    // claim as "unchanged" — so it shows nothing rather than 0%.
    const delta =
      d == null
        ? ""
        : `<div style="font-family:${T.fontLabel};font-size:10px;color:${d >= 0 ? SEV_TOKENS.low.text : SEV_TOKENS.high.text}">${d >= 0 ? "+" : ""}${Math.round(d)}%</div>`;
    return `<td style="padding:8px 10px;border:1px solid ${T.line};background:${T.surface}">
      <div style="font-family:${T.fontLabel};font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${T.muted}">${esc(label)}</div>
      <div style="font-family:${T.fontDisplay};font-size:16px;font-weight:600;color:${T.ink}">${esc(fmtNum(m.value))}${esc(suffix)}</div>
      ${delta}
    </td>`;
  };

  const rates = c
    ? `<div style="font-family:${T.fontLabel};font-size:11px;color:${T.muted};margin:14px 0 6px 0">COWORK${c.dataAsOf ? `, per ${esc(c.dataAsOf)}` : ""}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse"><tr>${
        rate("Sesi/hari", c.sessionsPerDay) +
        rate("Operasi file/hari", c.fileOperationsPerDay) +
        rate("Edit file/hari", c.fileEditsPerDay) +
        rate("Anggota pakai Cowork", c.usersWithSessionsPercent, "%")
      }</tr></table>`
    : "";

  // Top six only: the tail is a long list of single-digit categories that
  // pushes the tables below it off a phone screen.
  const top = cats.slice(0, 6);
  // Relative to the biggest category, not to 100%: with a long tail nothing
  // reaches a third, and every bar would be the same stub.
  const maxShare = Math.max(...top.map((x) => Number(x.share) || 0), 0.0001);
  const bars = cats.length
    ? `<div style="font-family:${T.fontLabel};font-size:11px;color:${T.muted};margin:14px 0 6px 0">JENIS FILE YANG DISENTUH COWORK${
        act.fileOperationTotal ? ` — ${esc(fmtNum(act.fileOperationTotal))} operasi` : ""
      }</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${T.surface};border:1px solid ${T.line};border-radius:${T.radius}">
  <tbody>${top
    .map(
      (x) =>
        `<tr>${td(`<span style="font-size:12px">${esc(x.category)}</span>`)}${td(
          // A bar drawn from a table cell, so it survives a mail client that
          // runs no JavaScript and blocks remote images.
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td width="${Math.max(
            2,
            Math.round(((Number(x.share) || 0) / maxShare) * 160)
          )}" style="background:${SEV_TOKENS.info.dot};height:8px;border-radius:2px;line-height:1px;font-size:1px">&nbsp;</td></tr></table>`
        )}${td(`${Math.round((Number(x.share) || 0) * 100)}%`, "right", `font-family:${T.fontDisplay}`)}${td(
          esc(fmtNum(x.count)),
          "right",
          `font-family:${T.fontDisplay};color:${T.ink2}`
        )}</tr>`
    )
    .join("")}</tbody>
</table>`
    : "";

  return rates + bars;
}

function sourceChip(source) {
  const proxied = source === "9router";
  const sev = proxied ? SEV_TOKENS.low : SEV_TOKENS.info;
  const label = proxied ? "Dakara Router" : "Desktop";
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
    `${s.measuredCount || 0} akun terukur lewat Dakara Router, ${s.unmeasuredCount || 0} hanya kuota.` +
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

  const head = `<tr>${th("Akun")}${th("Profil")}${th("Provider")}${th("Sumber")}${keys
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
          // A dash, not a blank, for an unclaimed account: a blank cell in an
          // email reads as missing data rather than "nobody claimed this".
          const small = (v) =>
            `<span style="font-family:${T.fontLabel};font-size:11px;color:${T.ink2}">${esc(v || "–")}</span>`;
          return `<tr>${td(name + failed)}${td(small(r.profile))}${td(small(r.provider))}${td(sourceChip(r.source))}${keys
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

  // Org-wide adoption. Rendered BEFORE the Claude Code block: it is the
  // widest number, and a reader who meets the narrower one first anchors on a
  // team half the real size.
  const act = report?.claudeWeb?.activity;
  const actBlock = act?.overview
    ? (() => {
        const o = act.overview;
        const tiles = [
          ["Kursi terpakai", `${o.utilization.value}%`],
          ["Aktif harian", fmtNum(o.dau.value)],
          ["Aktif mingguan", fmtNum(o.wau.value)],
          ["Aktif bulanan", `${fmtNum(o.mau.value)} / ${fmtNum(o.totalMembers)}`],
        ]
          .map(
            ([l, v]) =>
              `<td style="padding:8px 10px;border:1px solid ${T.line};background:${T.surface}">
                <div style="font-family:${T.fontLabel};font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${T.muted}">${esc(l)}</div>
                <div style="font-family:${T.fontDisplay};font-size:16px;font-weight:600;color:${T.ink}">${esc(v)}</div>
              </td>`
          )
          .join("");

        const rows3 = (act.members || [])
          .map(
            (m) =>
              `<tr>${td(`<span style="font-weight:600">${esc(m.email || m.name || "-")}</span>`)}${td(
                esc(fmtNum(m.chats)),
                "right"
              )}${td(esc(fmtNum(m.chatMessages)), "right")}${td(esc(fmtNum(m.coworkSessions)), "right")}${td(
                esc(fmtNum(m.codeSessions)),
                "right"
              )}${td(esc(fmtNum(m.daysActive)), "right")}</tr>`
          )
          .join("");

        return `<div style="font-family:${T.fontLabel};font-size:11px;color:${T.muted};margin:18px 0 6px 0">
  ADOPSI TIM — semua produk Claude, seluruh anggota${act.dataAsOf ? `, per ${esc(act.dataAsOf)}` : ""}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 8px 0"><tr>${tiles}</tr></table>
${chart(act.series, { label: "Pengguna aktif harian", fmt: (v) => `${fmtNum(v)} orang` })}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${T.surface};border:1px solid ${T.line};border-radius:${T.radius};margin-top:10px">
  <thead><tr>${th("Anggota")}${th("Chat", "right")}${th("Pesan", "right")}${th("Sesi Cowork", "right")}${th("Sesi Code", "right")}${th("Hari aktif", "right")}</tr></thead>
  <tbody>${rows3 || `<tr>${td(`<span style="color:${T.muted}">Belum ada data.</span>`)}</tr>`}</tbody>
</table>
${coworkBlock(act)}`;
      })()
    : report?.claudeWeb?.activityError
      ? banner("medium", "Data adopsi tim tidak terbaca", String(report.claudeWeb.activityError))
      : "";

  // Web and Desktop use, from claude.ai. Rendered as its own block ABOVE the
  // notes and below the quota table: it answers "how much is the team using
  // Claude" for the people the quota table cannot see at all.
  const web = report?.claudeWeb;
  const webBlock = web?.summary
    ? (() => {
        const s2 = web.summary;
        const tiles = [
          ["Est. biaya API", fmtUsd(s2.totalCostUsd)],
          ["Pengguna aktif", fmtNum(s2.activeUsers)],
          ["Sesi", fmtNum(s2.totalSessions)],
          ["Baris diterima", fmtNum(s2.linesAccepted)],
        ]
          .map(
            ([l, v]) =>
              `<td style="padding:8px 10px;border:1px solid ${T.line};background:${T.surface}">
                <div style="font-family:${T.fontLabel};font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${T.muted}">${esc(l)}</div>
                <div style="font-family:${T.fontDisplay};font-size:16px;font-weight:600;color:${T.ink}">${esc(v)}</div>
              </td>`
          )
          .join("");

        const rows2 = (web.users || [])
          .map(
            (u) =>
              `<tr>${td(`<span style="font-weight:600">${esc(u.displayName || u.email || "-")}</span>`)}${td(
                `<span style="font-family:${T.fontLabel};font-size:11px;color:${T.ink2}">${esc(u.status || "-")}</span>`
              )}${td(esc(fmtUsd(u.totalCostUsd)), "right", `font-family:${T.fontDisplay};font-weight:600`)}${td(
                esc(fmtUsd(u.avgCostPerDayUsd)),
                "right",
                `font-family:${T.fontDisplay}`
              )}${td(esc(fmtNum(u.sessions)), "right")}${td(esc(fmtNum(u.linesAccepted)), "right")}</tr>`
          )
          .join("");

        return `<div style="font-family:${T.fontLabel};font-size:11px;color:${T.muted};margin:18px 0 6px 0">
  PEMAKAIAN LEWAT WEB &amp; DESKTOP — dari analytics organisasi claude.ai${web.range ? `, ${esc(web.range.startDate)} s/d ${esc(web.range.endDate)}` : ""}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 8px 0"><tr>${tiles}</tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:${T.surface};border:1px solid ${T.line};border-radius:${T.radius}">
  <thead><tr>${th("Orang")}${th("Status")}${th("Est. biaya", "right")}${th("Rata-rata/hari", "right")}${th("Sesi", "right")}${th("Baris", "right")}</tr></thead>
  <tbody>${rows2 || `<tr>${td(`<span style="color:${T.muted}">Belum ada data.</span>`)}</tr>`}</tbody>
</table>
${chart(web.series, { label: "Biaya harian (estimasi setara API)", fmt: (v) => fmtUsd(v), valueKey: "costUsd" })}`;
      })()
    // A failed read is stated, never silent: a missing section reads as "the
    // team did nothing on web and desktop", which is the costliest misreading
    // this report can produce.
    : web && web.error
      ? banner("medium", "Data claude.ai tidak terbaca", String(web.error))
      : "";

  // The lead paragraph, directly under the header: a reader who stops after
  // two sentences should still leave with the finding, not just the tables.
  const lead = (() => {
    const lines = summaryNarrative(report);
    if (!lines.length) return "";
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 14px 0">
  <tr><td style="background:${T.surface};border:1px solid ${T.line};border-radius:${T.radius};padding:12px 14px;font-family:${T.fontBody};font-size:13px;line-height:1.65;color:${T.ink}">
    ${lines.map((l) => `<div style="padding:2px 0">${esc(l)}</div>`).join("")}
  </td></tr>
</table>`;
  })();

  // How to read it, and what it does not claim. After the tables, because it
  // is reference the reader returns to rather than the headline.
  const guide = (() => {
    const sections = readingGuide(report);
    const limits = limitations(report);
    if (!sections.length && !limits.length) return "";

    const blocks = sections
      .map(
        (g) => `<div style="margin:0 0 10px 0">
      <div style="font-family:${T.fontLabel};font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${T.muted};padding-bottom:3px">${esc(g.heading)}</div>
      ${g.lines.map((l) => `<div style="padding:1px 0 1px 10px;border-left:2px solid ${T.line}">${esc(l)}</div>`).join("")}
    </div>`
      )
      .join("");

    const limitBlock = limits.length
      ? `<div style="margin:12px 0 0 0">
      <div style="font-family:${T.fontLabel};font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:${SEV_TOKENS.medium.text};padding-bottom:3px">Yang laporan ini belum bisa jawab</div>
      ${limits.map((l) => `<div style="padding:1px 0 1px 10px;border-left:2px solid ${SEV_TOKENS.medium.line}">${esc(l)}</div>`).join("")}
    </div>`
      : "";

    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:18px 0 0 0">
  <tr><td style="background:${T.surface2};border:1px solid ${T.line};border-radius:${T.radius};padding:12px 14px;font-family:${T.fontBody};font-size:12px;line-height:1.6;color:${T.ink2}">
    <div style="font-family:${T.fontDisplay};font-size:13px;font-weight:600;color:${T.ink};padding-bottom:8px">Cara membaca laporan ini</div>
    ${blocks}${limitBlock}
  </td></tr>
</table>`;
  })();

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
${lead}
${summary}
${coverage}
${table}
${actBlock}
${webBlock}
${guide}
${notes}
  </td></tr>
</table>
</body></html>`;
}
