"use client";

import { useCallback, useEffect, useState } from "react";
import { SEV_CSS_VARS } from "@/lib/monitoring/tokens";
import { formatUsd } from "@/lib/monitoring/view";

/**
 * Team usage read straight from claude.ai.
 *
 * This is the WEB AND DESKTOP half of the picture: the teammates who chat in
 * the browser or in Claude Desktop never touch the gateway, so the proxy rows
 * elsewhere in this product cannot see them at all. These figures come from
 * Anthropic's own analytics for the organization.
 *
 * Read-only. Nothing here can change an account, and the admin session cookie
 * stays on the server — the API hands back figures, never credentials.
 */
export default function ClaudeWebCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/monitoring/claude-web", { cache: "no-store" });
      setData(await res.json());
    } catch (e) {
      setData({ ok: false, configured: true, error: e.message, users: [], series: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="py-6 text-sm opacity-60">Memuat data claude.ai…</p>;
  if (!data) return null;

  const { summary, users = [], series = [], range, error, configured, ok } = data;

  // Not configured is a setup state, not a failure — it gets instructions
  // rather than an error colour.
  if (!configured) {
    return (
      <Shell>
        <p className="text-[11px] opacity-70">
          Belum tersambung. Isi <code>CLAUDE_WEB_ORG_ID</code> dan{" "}
          <code>CLAUDE_WEB_SESSION_KEY</code> di <code>.env</code> dengan cookie sesi
          admin claude.ai, lalu restart server.
        </p>
      </Shell>
    );
  }

  const maxCost = Math.max(1, ...users.map((u) => u.totalCostUsd || 0));

  return (
    <Shell range={range} onRefresh={load}>
      {error ? (
        <p
          className="mb-3 rounded border px-2.5 py-2 text-[11px]"
          style={{
            background: SEV_CSS_VARS[ok ? "medium" : "critical"].fill,
            borderColor: SEV_CSS_VARS[ok ? "medium" : "critical"].line,
            color: SEV_CSS_VARS[ok ? "medium" : "critical"].text,
          }}
        >
          {ok ? "Sebagian data gagal dibaca: " : "Gagal membaca claude.ai: "}
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Est. biaya API" value={formatUsd(summary.totalCostUsd)} tone="info" />
          <Tile label="Pengguna aktif" value={summary.activeUsers} />
          <Tile label="Sesi" value={summary.totalSessions} />
          <Tile label="Baris diterima" value={nf(summary.linesAccepted)} />
          <Tile label="Commit" value={nf(summary.commits)} />
          <Tile label="Pull request" value={nf(summary.pullRequests)} />
        </div>
      ) : null}

      {users.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-black/10 dark:border-white/10">
                <Th>Orang</Th>
                <Th>Status</Th>
                <Th right>Est. biaya</Th>
                <Th right>Rata-rata/hari</Th>
                <Th right>Sesi</Th>
                <Th right>Baris</Th>
                <Th>Terakhir aktif</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email} className="border-b border-black/5 dark:border-white/5">
                  <Td>
                    <div className="font-semibold">{u.displayName || u.email}</div>
                    {u.displayName && u.email ? (
                      <div className="text-[10.5px] opacity-60">{u.email}</div>
                    ) : null}
                  </Td>
                  <Td>
                    <span
                      className="inline-block rounded border px-1.5 py-0.5 text-[10px]"
                      style={{
                        background: SEV_CSS_VARS[u.status === "active" ? "low" : "info"].fill,
                        borderColor: SEV_CSS_VARS[u.status === "active" ? "low" : "info"].line,
                        color: SEV_CSS_VARS[u.status === "active" ? "low" : "info"].text,
                      }}
                    >
                      {u.status === "active" ? "aktif" : "tidak aktif"}
                    </span>
                  </Td>
                  <Td right>
                    <div className="flex items-center justify-end gap-2">
                      {/* A bar beside the figure: the question is who drives
                          the bill, and relative size answers it faster. */}
                      <span
                        aria-hidden="true"
                        className="hidden h-1.5 rounded sm:block"
                        style={{
                          width: `${Math.max(2, ((u.totalCostUsd || 0) / maxCost) * 56)}px`,
                          background: "var(--sev-info)",
                        }}
                      />
                      <span className="font-semibold tabular-nums">{formatUsd(u.totalCostUsd)}</span>
                    </div>
                  </Td>
                  <Td right mono>{formatUsd(u.avgCostPerDayUsd)}</Td>
                  <Td right mono>{nf(u.sessions)}</Td>
                  <Td right mono>{nf(u.linesAccepted)}</Td>
                  <Td>
                    <span className="text-[11px] opacity-70">
                      {u.lastActive ? String(u.lastActive).slice(0, 10) : "–"}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {series.length ? (
        <div className="mt-4">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider opacity-60">
            Biaya harian
          </div>
          <Sparkline rows={series} />
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed opacity-60">
        Angka di atas berasal langsung dari analytics organisasi di claude.ai, jadi
        mencakup pemakaian lewat web dan Claude Desktop — pemakaian yang tidak
        melewati router ini dan karenanya tidak terlihat di tabel kuota di bawah.
        Biaya adalah estimasi setara harga API, bukan tagihan: paket Team ditagih
        per kursi.
      </p>
    </Shell>
  );
}

const nf = (n) => new Intl.NumberFormat("id-ID").format(Math.round(Number(n) || 0));

function Shell({ children, range, onRefresh }) {
  return (
    <section className="rounded-xl border px-4 py-4" style={{ borderColor: "var(--line-soft)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Pemakaian Claude Code (biaya per orang)</h2>
          <p className="text-[11px] opacity-60">
            Dari analytics organisasi claude.ai — mencakup akun yang tidak lewat router.
            {range ? ` ${range.startDate} s/d ${range.endDate}.` : ""}
          </p>
        </div>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: "var(--line-soft)" }}
          >
            Muat ulang
          </button>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Tile({ label, value, tone = "info" }) {
  const sev = SEV_CSS_VARS[tone] || SEV_CSS_VARS.info;
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--line-soft)" }}>
      <div className="text-[10px] uppercase tracking-wider opacity-60">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color: sev.text }}>
        {value}
      </div>
    </div>
  );
}

/** A bare bar chart. No library: one series of at most ~31 points. */
function Sparkline({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.costUsd || 0));
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 48 }}>
      {rows.map((r) => (
        <div
          key={r.date}
          title={`${r.date}: ${formatUsd(r.costUsd ?? 0)}`}
          className="flex-1 rounded-t"
          style={{
            height: `${Math.max(2, ((r.costUsd || 0) / max) * 48)}px`,
            background: r.costUsd ? "var(--sev-info)" : "var(--line-soft)",
          }}
        />
      ))}
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th
      className={`whitespace-nowrap px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider opacity-60 ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({ children, right, mono }) {
  return (
    <td
      className={`whitespace-nowrap px-2.5 py-2.5 align-middle ${right ? "text-right" : "text-left"} ${mono ? "tabular-nums" : ""}`}
    >
      {children}
    </td>
  );
}
