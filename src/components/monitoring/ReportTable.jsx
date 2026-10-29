"use client";

import QuotaMeter from "./QuotaMeter";
import { SEV_CSS_VARS } from "@/lib/monitoring/tokens";
import { sourceLabel, formatUnits, formatUsd } from "@/lib/monitoring/view";

// Union of the window keys any account actually has, so a window nobody has is
// simply absent rather than a column of empties.
function windowColumns(rows) {
  const seen = [];
  for (const r of rows) for (const w of r.windows) if (!seen.find((x) => x.key === w.key)) seen.push(w);
  const rank = (k) => (k === "session (5h)" ? 0 : k === "weekly (7d)" ? 1 : 2);
  return seen.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

function SourceChip({ source }) {
  const { label, severity } = sourceLabel(source);
  const sev = SEV_CSS_VARS[severity];
  return (
    <span
      className="inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px]"
      style={{ background: sev.fill, borderColor: sev.line, color: sev.text }}
    >
      {label}
    </span>
  );
}

export default function ReportTable({ rows = [] }) {
  const cols = windowColumns(rows);

  if (!rows.length) {
    return <p className="py-8 text-center text-sm opacity-60">Belum ada data snapshot.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-black/10 dark:border-white/10">
            <Th>Akun</Th>
            <Th>Profil</Th>
            <Th>Provider</Th>
            <Th>Sumber</Th>
            {cols.map((c) => <Th key={c.key}>{c.label}</Th>)}
            <Th right>Units</Th>
            <Th right>Est. biaya API</Th>
            <Th>Reset</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.connectionId} className="border-b border-black/5 dark:border-white/5">
              <Td>
                <div className="font-semibold">{r.account}</div>
                {r.email && r.email !== r.account ? (
                  <div className="text-[10.5px] opacity-60">{r.email}</div>
                ) : null}
                {!r.ok ? (
                  <div className="text-[10.5px]" style={{ color: SEV_CSS_VARS.critical.text }}>
                    Gagal dibaca: {r.errorMessage || "tidak diketahui"}
                  </div>
                ) : null}
              </Td>
              {/* An account nobody has claimed shows a dash, not a blank:
                  a blank cell reads as missing data rather than "unclaimed". */}
              <Td>
                {r.profile
                  ? <span className="text-[11px]">{r.profile}</span>
                  : <span className="text-[11px] opacity-40">–</span>}
              </Td>
              <Td><span className="text-[11px] opacity-70">{r.provider || "–"}</span></Td>
              <Td><SourceChip source={r.source} /></Td>
              {cols.map((c) => {
                const w = r.windows.find((x) => x.key === c.key);
                return (
                  <Td key={c.key}>
                    <QuotaMeter
                      percent={w ? w.percent : null}
                      severity={w ? w.severity : "info"}
                      label={c.label}
                      hasWindow={Boolean(w)}
                      ok={r.ok}
                    />
                  </Td>
                );
              })}
              <Td right mono>{formatUnits(r.units)}</Td>
              <Td right mono>{formatUsd(r.costUsd)}</Td>
              <Td><span className="text-[11px] opacity-70">{r.resetAt ? new Date(r.resetAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "–"}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th className={`whitespace-nowrap px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider opacity-60 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right, mono }) {
  return (
    <td className={`whitespace-nowrap px-2.5 py-2.5 align-middle ${right ? "text-right" : "text-left"} ${mono ? "font-semibold tabular-nums" : ""}`}>
      {children}
    </td>
  );
}
