"use client";

import { useCallback, useEffect, useState } from "react";
import ReportTable from "@/components/monitoring/ReportTable";
import CoverageBanner from "@/components/monitoring/CoverageBanner";
import RecipientsCard from "@/components/monitoring/RecipientsCard";
import ClaudeWebCard from "@/components/monitoring/ClaudeWebCard";
import { SEV_CSS_VARS } from "@/lib/monitoring/tokens";
import { summaryTiles } from "@/lib/monitoring/view";

/**
 * Claude account monitoring — the same report object the daily email renders
 * from, so the screen and the email cannot disagree.
 *
 * Distinct from /dashboard/quota (live per-provider quota): this is Claude
 * only, reads the stored snapshot history, and adds weighted units, cost
 * equivalent and sampling coverage.
 */
export default function MonitoringPage() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/monitoring/report", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setReport(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const collectNow = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/monitoring/collect", { method: "POST" });
      if (!res.ok) throw new Error((await res.json())?.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !report) {
    return (
      <div className="rounded-lg border px-4 py-3 text-sm"
           style={{ background: SEV_CSS_VARS.critical.fill, borderColor: SEV_CSS_VARS.critical.line }}>
        <strong style={{ color: SEV_CSS_VARS.critical.text }}>Gagal memuat laporan</strong>
        <br />{error}
      </div>
    );
  }

  if (!report) return <p className="py-8 text-sm opacity-60">Memuat…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Usage Akun Claude Tim</h1>
          <p className="text-xs opacity-60">
            {report.dateKey} · {report.rows.length} akun
          </p>
        </div>
        <button
          type="button"
          onClick={collectNow}
          disabled={busy}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {busy ? "Mengambil…" : "Ambil sampel sekarang"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {summaryTiles(report).map((t) => {
          const sev = SEV_CSS_VARS[t.tone] || SEV_CSS_VARS.info;
          return (
            <div key={t.key} className="rounded-lg border px-3 py-2.5"
                 style={{ borderColor: "var(--line-soft, rgba(0,0,0,0.08))" }}>
              <div className="text-[10px] uppercase tracking-wider opacity-60">{t.label}</div>
              <div className="text-xl font-semibold tabular-nums" style={{ color: sev.text }}>
                {t.value}
              </div>
              <div className="text-[10px] opacity-60">{t.hint}</div>
            </div>
          );
        })}
      </div>

      {/* Web and Desktop use, straight from claude.ai. Placed above the quota
          table because it covers the teammates the quota table cannot see. */}
      <ClaudeWebCard />

      <CoverageBanner coverage={report.coverage} />

      <RecipientsCard />

      {error ? <p className="text-xs" style={{ color: SEV_CSS_VARS.critical.text }}>{error}</p> : null}

      <ReportTable rows={report.rows} />

      <div className="rounded border-l-2 px-3 py-2.5 text-[11px] leading-relaxed opacity-70"
           style={{ borderColor: "var(--line-soft, rgba(0,0,0,0.12))" }}>
        {report.footnotes?.map((f, i) => <div key={i} className="py-0.5">{f}</div>)}
      </div>
    </div>
  );
}
