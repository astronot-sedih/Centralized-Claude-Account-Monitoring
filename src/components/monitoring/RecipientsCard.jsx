"use client";

import { useCallback, useEffect, useState } from "react";
import { SEV_CSS_VARS } from "@/lib/monitoring/tokens";

/**
 * Who the daily report is mailed to.
 *
 * Lives here rather than in .env because the list changes — people join, a
 * manager wants a copy — and editing a file on the host plus a restart is the
 * wrong shape for that. The SMTP host and password stay in env: those are
 * deployment secrets.
 */
export default function RecipientsCard() {
  const [value, setValue] = useState("");
  const [source, setSource] = useState("settings");
  const [state, setState] = useState({ busy: false, msg: null, tone: "low" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/monitoring/recipients", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setValue((data.recipients || []).join(", "));
      setSource(data.source || "settings");
    } catch (e) {
      setState({ busy: false, msg: e.message, tone: "critical" });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setState({ busy: true, msg: null, tone: "low" });
    try {
      const res = await fetch("/api/monitoring/recipients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setValue((data.recipients || []).join(", "));
      setSource("settings");
      // Say what was dropped: a typo the user cannot see is a recipient who
      // never gets the report.
      setState({
        busy: false,
        tone: data.rejected?.length ? "medium" : "low",
        msg: data.rejected?.length
          ? `Tersimpan ${data.recipients.length} alamat. Diabaikan (bukan email): ${data.rejected.join(", ")}`
          : `Tersimpan ${data.recipients.length} alamat.`,
      });
    } catch (e) {
      setState({ busy: false, msg: e.message, tone: "critical" });
    }
  };

  const sendTest = async () => {
    setState({ busy: true, msg: "Mengirim…", tone: "low" });
    try {
      const res = await fetch("/api/monitoring/send-test", { method: "POST" });
      const data = await res.json();
      setState({
        busy: false,
        tone: data.sent ? "low" : "critical",
        msg: data.sent ? "Terkirim." : `Gagal: ${data.reason || data.error || `HTTP ${res.status}`}`,
      });
    } catch (e) {
      setState({ busy: false, msg: e.message, tone: "critical" });
    }
  };

  const sev = SEV_CSS_VARS[state.tone] || SEV_CSS_VARS.info;

  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Penerima laporan harian</h2>
          <p className="text-[11px] opacity-60">
            Pisahkan dengan koma. Dikirim tiap pagi dan saat tombol uji ditekan.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={state.busy}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Simpan
          </button>
          <button
            type="button"
            onClick={sendTest}
            disabled={state.busy}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Kirim uji
          </button>
        </div>
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="admin@contoh.id, atasan@contoh.id"
        spellCheck={false}
        className="mt-2 w-full rounded border bg-transparent px-2 py-1.5 text-xs"
        style={{ borderColor: "var(--line-soft)" }}
      />

      {source === "env" ? (
        <p className="mt-1.5 text-[10px] opacity-60">
          Saat ini memakai MONITOR_MAIL_TO dari .env. Menyimpan di sini akan
          menggantikannya.
        </p>
      ) : null}

      {state.msg ? (
        <p className="mt-1.5 text-[11px]" style={{ color: sev.text }}>
          {state.msg}
        </p>
      ) : null}
    </div>
  );
}
