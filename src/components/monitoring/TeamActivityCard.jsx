"use client";

import { useCallback, useEffect, useState } from "react";
import { SEV_CSS_VARS } from "@/lib/monitoring/tokens";

/**
 * Organization-wide adoption, from claude.ai.
 *
 * The WIDEST lens in this product. The quota table below sees connections the
 * router knows about; the Claude Code card sees people who run Claude Code;
 * this sees EVERY member, including the ones whose whole use of Claude is
 * chatting in the browser or in Desktop. On this team that is the difference
 * between 5 people and 9 — and a plan decision made on the narrower number
 * would understate the team by nearly half.
 *
 * Read-only. The admin session cookie stays on the server.
 */
export default function TeamActivityCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/monitoring/claude-web/activity", { cache: "no-store" });
      setData(await res.json());
    } catch (e) {
      setData({ ok: false, configured: true, error: e.message, members: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="py-6 text-sm opacity-60">Memuat adopsi tim…</p>;
  if (!data || data.configured === false) return null;

  const {
    overview, cowork, members = [], series = [], fileCategories = [],
    error, ok, dataAsOf, activityDate,
  } = data;

  return (
    <section className="rounded-xl border px-4 py-4" style={{ borderColor: "var(--line-soft)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Adopsi Tim (semua produk Claude)</h2>
          <p className="text-[11px] opacity-60">
            Dari analytics organisasi claude.ai — mencakup chat, Cowork, dan Claude Code
            untuk seluruh anggota, termasuk yang tidak lewat router.
            {/* The day these numbers describe. Anthropic refuses any date
                after yesterday UTC and often lags a further day, so showing
                the report's own date would date them a day or two early. */}
            {activityDate ? ` Angka per ${activityDate}` : ""}
            {dataAsOf && dataAsOf !== activityDate ? ` (data terbaru ${dataAsOf})` : ""}
            {activityDate ? "." : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--line-soft)" }}
        >
          Muat ulang
        </button>
      </div>

      {error ? (
        <p
          className="mt-3 rounded border px-2.5 py-2 text-[11px]"
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

      {overview ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile
            label="Kursi terpakai"
            value={`${overview.utilization.value}%`}
            hint={`${overview.mau.value} dari ${overview.totalMembers} anggota`}
            tone={overview.utilization.value >= 80 ? "low" : "medium"}
          />
          <Tile label="Aktif harian" value={overview.dau.value} change={overview.dau.changePercent} />
          <Tile label="Aktif mingguan" value={overview.wau.value} change={overview.wau.changePercent} />
          <Tile label="Aktif bulanan" value={overview.mau.value} change={overview.mau.changePercent} />
          <Tile
            label="Stickiness"
            value={overview.stickiness == null ? "–" : `${Math.round(overview.stickiness)}%`}
            hint="harian ÷ bulanan"
          />
          <Tile
            label="Undangan tertunda"
            value={overview.pendingInvites.value}
            tone={overview.pendingInvites.value > 0 ? "medium" : "info"}
          />
        </div>
      ) : null}

      {series.length ? (
        <div className="mt-4">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider opacity-60">
            Pengguna aktif harian (30 hari)
          </div>
          <Bars rows={series} suffix=" orang" />
        </div>
      ) : null}

      {members.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-black/10 dark:border-white/10">
                <Th>Anggota</Th>
                <Th right>Chat</Th>
                <Th right>Pesan</Th>
                <Th right>Sesi Cowork</Th>
                <Th right>Sesi Code</Th>
                <Th right>Hari aktif</Th>
                <Th>Terakhir aktif</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.email || m.name} className="border-b border-black/5 dark:border-white/5">
                  {/* Email only. Display names are whatever each person set
                      on their own account — several are a first name or two
                      letters, which does not identify anyone in a report the
                      whole team reads. The email does. */}
                  <Td>
                    <div className="font-semibold">{m.email || m.name || "–"}</div>
                  </Td>
                  <Td right mono>{nf(m.chats)}</Td>
                  <Td right mono>{nf(m.chatMessages)}</Td>
                  <Td right mono>{nf(m.coworkSessions)}</Td>
                  <Td right mono>{nf(m.codeSessions)}</Td>
                  <Td right mono>{nf(m.daysActive)}</Td>
                  <Td>
                    <span className="text-[11px] opacity-70">
                      {m.lastActive ? String(m.lastActive).slice(0, 10) : "–"}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {cowork || fileCategories.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {cowork ? (
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider opacity-60">Cowork</div>
              <div className="grid grid-cols-2 gap-2">
                <Mini label="Sesi/hari" value={cowork.sessionsPerDay.value} />
                <Mini label="Operasi file/hari" value={cowork.fileOperationsPerDay.value} />
                <Mini label="Edit file/hari" value={cowork.fileEditsPerDay.value} />
                <Mini label="Anggota pakai Cowork" value={`${cowork.usersWithSessionsPercent.value}%`} />
              </div>
            </div>
          ) : null}

          {fileCategories.length ? (
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wider opacity-60">
                Jenis file yang disentuh Cowork
              </div>
              <div className="space-y-1">
                {fileCategories.slice(0, 6).map((c) => (
                  <div key={c.category} className="flex items-center gap-2 text-[11px]">
                    <span className="w-44 shrink-0 truncate opacity-80">{c.category}</span>
                    <span
                      aria-hidden="true"
                      className="h-1.5 rounded"
                      style={{ width: `${Math.max(2, c.share * 160)}px`, background: "var(--sev-info)" }}
                    />
                    <span className="tabular-nums opacity-60">
                      {Math.round(c.share * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed opacity-60">
        Ini gambaran terluas: tabel kuota di bawah hanya melihat koneksi yang dikenal
        router, sedangkan angka di sini mencakup setiap anggota tim — termasuk yang
        hanya memakai Claude lewat web dan Desktop.
      </p>
    </section>
  );
}

const nf = (n) => new Intl.NumberFormat("id-ID").format(Math.round(Number(n) || 0));

function Tile({ label, value, hint, change, tone = "info" }) {
  const sev = SEV_CSS_VARS[tone] || SEV_CSS_VARS.info;
  return (
    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--line-soft)" }}>
      <div className="text-[10px] uppercase tracking-wider opacity-60">{label}</div>
      <div className="text-lg font-semibold tabular-nums" style={{ color: sev.text }}>
        {value}
      </div>
      {/* A null change means no comparison was available, which is not the
          same claim as "unchanged" — so it shows nothing rather than 0%. */}
      {change != null ? (
        <div
          className="text-[10px]"
          style={{ color: change >= 0 ? "var(--sev-low-text)" : "var(--sev-high-text)" }}
        >
          {change >= 0 ? "+" : ""}
          {Math.round(change)}% vs sebelumnya
        </div>
      ) : hint ? (
        <div className="text-[10px] opacity-60">{hint}</div>
      ) : null}
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rounded border px-2 py-1.5" style={{ borderColor: "var(--line-soft)" }}>
      <div className="text-[10px] opacity-60">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/** A bare bar chart. No library: one series of at most ~31 points. */
function Bars({ rows, suffix = "" }) {
  const max = Math.max(1, ...rows.map((r) => r.value || 0));
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 44 }}>
      {rows.map((r) => (
        <div
          key={r.date}
          title={`${r.date}: ${r.value}${suffix}`}
          className="flex-1 rounded-t"
          style={{
            height: `${Math.max(2, ((r.value || 0) / max) * 44)}px`,
            background: r.value ? "var(--sev-info)" : "var(--line-soft)",
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
