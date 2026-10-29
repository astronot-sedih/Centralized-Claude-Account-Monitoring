// The report as a plain-text alternative part.
//
// Some corporate clients render only this part, so the whole report has to
// survive here — same rows, same labels, same caveats as the HTML. Column
// labels are shared with renderHtml.js via WINDOW_LABELS in buildReport.js,
// so the two parts of one email cannot disagree.

const NA = "tak terukur";
const NO_WINDOW = "tidak ada";

const fmtNum = (n) =>
  n == null ? NA : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

const fmtUsd = (n) =>
  n == null ? NA : `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;

function fmtTime(iso, timeZone) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
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

function windowKeys(rows) {
  const seen = [];
  for (const r of rows) for (const w of r.windows) if (!seen.includes(w.key)) seen.push(w.key);
  const rank = (k) => (k === "session (5h)" ? 0 : k === "weekly (7d)" ? 1 : 2);
  return seen.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function labelOf(rows, key) {
  for (const r of rows) {
    const w = r.windows.find((x) => x.key === key);
    if (w) return w.label;
  }
  return key;
}

// Pads to a fixed width so the table aligns in a monospaced client. Overlong
// values are truncated rather than breaking the column.
function pad(value, width, right = false) {
  const s = String(value ?? "");
  const t = s.length > width ? s.slice(0, width - 1) + "…" : s;
  return right ? t.padStart(width) : t.padEnd(width);
}

/**
 * @param {object} report from buildReport()
 * @returns {string}
 */
export function renderReportText(report) {
  const rows = report?.rows || [];
  const keys = windowKeys(rows);
  const s = report?.summary || {};
  const tz = report?.timeZone || "Asia/Jakarta";
  const c = report?.coverage || {};

  // Window columns size to their widest label (per-model names like
  // "Mingguan opus 7h" overflow a fixed 12), with a floor for the values.
  const windowWidth = Math.max(13, ...keys.map((k) => labelOf(rows, k).length));
  const W = { account: 26, profile: 10, provider: 9, source: 8, window: windowWidth, units: 12, cost: 12, reset: 7 };

  const out = [];
  out.push("LAPORAN USAGE CLAUDE TIM");
  out.push(`Tanggal: ${report?.dateKey || "-"}   Akun: ${rows.length}`);
  out.push("");

  out.push(
    s.atRiskCount > 0
      ? `RINGKASAN: ${s.atRiskCount} akun di atas 90% kuota.`
      : "RINGKASAN: tidak ada akun mendekati limit."
  );
  out.push(
    `  ${s.measuredCount || 0} akun terukur lewat 9router, ${s.unmeasuredCount || 0} hanya kuota.`
  );
  if (s.limitDaysThisWeek) {
    out.push(`  Limit tercapai pada ${s.limitDaysThisWeek} hari dalam 7 hari terakhir.`);
  }
  if (s.failedReadCount) out.push(`  ${s.failedReadCount} akun gagal dibaca.`);

  out.push(
    `  Cakupan sampling: ${c.samplesTaken || 0}/${c.samplesExpected || 0} sampel` +
      (c.partial
        ? ` (${Math.round(c.percent || 0)}%) — belum penuh, angka tren kemungkinan lebih rendah dari kenyataan.`
        : ".")
  );
  out.push("");

  const header =
    pad("Akun", W.account) +
    "  " + pad("Profil", W.profile) +
    "  " + pad("Provider", W.provider) +
    "  " + pad("Sumber", W.source) +
    keys.map((k) => "  " + pad(labelOf(rows, k), W.window)).join("") +
    "  " + pad("Units", W.units, true) +
    "  " + pad("Est. USD", W.cost, true) +
    "  " + pad("Reset", W.reset);
  out.push(header);
  out.push("-".repeat(header.length));

  if (!rows.length) {
    out.push("(belum ada data snapshot)");
  } else {
    for (const r of rows) {
      out.push(
        pad(r.email || r.account, W.account) +
          "  " + pad(r.profile || "-", W.profile) +
          "  " + pad(r.provider || "-", W.provider) +
          "  " + pad(r.source === "9router" ? "9router" : "Desktop", W.source) +
          keys
            .map((k) => {
              const w = r.windows.find((x) => x.key === k);
              if (!w) return "  " + pad(r.ok ? NO_WINDOW : NA, W.window, true);
              return "  " + pad(`${Math.round(w.percent)}%`, W.window, true);
            })
            .join("") +
          "  " + pad(fmtNum(r.units), W.units, true) +
          "  " + pad(fmtUsd(r.costUsd), W.cost, true) +
          "  " + pad(fmtTime(r.resetAt, tz), W.reset)
      );
      if (!r.ok) {
        out.push(`${" ".repeat(2)}! gagal dibaca: ${r.errorMessage || "tidak diketahui"}`);
      }
    }
  }

  // Web and Desktop use. Stated even when the read failed: a missing section
  // reads as "the team did nothing there", the costliest misreading here.
  const web = report?.claudeWeb;
  if (web?.summary) {
    const s2 = web.summary;
    out.push("");
    out.push(
      "PEMAKAIAN LEWAT WEB & DESKTOP (analytics claude.ai)" +
        (web.range ? `  ${web.range.startDate} s/d ${web.range.endDate}` : "")
    );
    out.push(
      `  Est. biaya ${fmtUsd(s2.totalCostUsd)}   Pengguna aktif ${s2.activeUsers}` +
        `   Sesi ${fmtNum(s2.totalSessions)}   Baris ${fmtNum(s2.linesAccepted)}`
    );
    const W2 = { who: 34, cost: 12, avg: 12, sess: 7 };
    const h2 =
      pad("Orang", W2.who) +
      "  " + pad("Est. biaya", W2.cost, true) +
      "  " + pad("Rata2/hari", W2.avg, true) +
      "  " + pad("Sesi", W2.sess, true);
    out.push(h2);
    out.push("-".repeat(h2.length));
    for (const u of web.users || []) {
      out.push(
        pad(u.displayName || u.email || "-", W2.who) +
          "  " + pad(fmtUsd(u.totalCostUsd), W2.cost, true) +
          "  " + pad(fmtUsd(u.avgCostPerDayUsd), W2.avg, true) +
          "  " + pad(fmtNum(u.sessions), W2.sess, true)
      );
    }
  } else if (web?.error) {
    out.push("");
    out.push(`PEMAKAIAN LEWAT WEB & DESKTOP: tidak terbaca — ${web.error}`);
  }

  out.push("");
  out.push("CATATAN");
  for (const f of report?.footnotes || []) out.push(`- ${f}`);

  return out.join("\n");
}
