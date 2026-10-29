"use client";

import { useCallback, useEffect, useState } from "react";
import { SEV_CSS_VARS } from "@/lib/monitoring/tokens";

/**
 * Profiles — the people who own Claude connections.
 *
 * A connection is identified by a uuid and whatever display name the account
 * owner happened to set, which is not how anyone asks "who used how much".
 * Assigning a person here is what lets Usage filter by owner.
 */
export default function ProfilesCard() {
  const [profiles, setProfiles] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [connections, setConnections] = useState([]);
  const [name, setName] = useState("");
  const [state, setState] = useState({ busy: false, msg: null, tone: "low" });

  const load = useCallback(async () => {
    try {
      const [pRes, cRes] = await Promise.all([
        fetch("/api/profiles", { cache: "no-store" }),
        fetch("/api/providers?provider=claude", { cache: "no-store" }),
      ]);
      const pData = await pRes.json();
      if (!pRes.ok) throw new Error(pData?.error || `HTTP ${pRes.status}`);
      setProfiles(pData.profiles || []);
      setAssignments(pData.assignments || {});

      const cData = await cRes.json().catch(() => ({}));
      const list = (Array.isArray(cData) ? cData : cData?.connections || [])
        .filter((c) => c.provider === "claude");
      setConnections(list);
    } catch (e) {
      setState({ busy: false, msg: e.message, tone: "critical" });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    setState({ busy: true, msg: null, tone: "low" });
    try {
      await fn();
      await load();
      setState({ busy: false, msg: null, tone: "low" });
    } catch (e) {
      setState({ busy: false, msg: e.message, tone: "critical" });
    }
  };

  const create = () =>
    act(async () => {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setName("");
    });

  const remove = (p) =>
    act(async () => {
      const res = await fetch(`/api/profiles/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error || `HTTP ${res.status}`);
    });

  const assign = (connectionId, profileId) =>
    act(async () => {
      // Clearing still needs a profile id in the path, so send the one being
      // cleared (or any id) with assign:false. The route reads the flag.
      const pathId = profileId || assignments[connectionId] || profiles[0]?.id;
      if (!pathId) return;
      const res = await fetch(`/api/profiles/${pathId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, assign: Boolean(profileId) }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || `HTTP ${res.status}`);
    });

  const sev = SEV_CSS_VARS[state.tone] || SEV_CSS_VARS.info;

  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Profil pemilik akun</h2>
          <p className="text-[11px] opacity-60">
            Tandai tiap koneksi Claude milik siapa, supaya Usage bisa difilter per orang.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create(); }}
            placeholder="Nama orang"
            className="rounded border bg-transparent px-2 py-1.5 text-xs"
            style={{ borderColor: "var(--line-soft)" }}
          />
          <button
            type="button"
            onClick={create}
            disabled={state.busy || !name.trim()}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Buat profil
          </button>
        </div>
      </div>

      {profiles.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {profiles.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-2 rounded border px-2 py-1 text-xs"
              style={{ borderColor: "var(--line-soft)" }}
            >
              {p.name}
              <span className="opacity-50">{p.connectionCount} akun</span>
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={state.busy}
                title="Hapus profil (koneksinya tidak ikut terhapus, hanya lepas tanda)"
                className="opacity-50 hover:opacity-100"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[11px] opacity-60">
          Belum ada profil. Buat satu per anggota tim.
        </p>
      )}

      {connections.length ? (
        <div className="mt-3 space-y-1.5">
          {connections.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-[8rem] font-medium">
                {c.name || c.email || c.id.slice(0, 8)}
              </span>
              <select
                value={assignments[c.id] || ""}
                disabled={state.busy}
                onChange={(e) => assign(c.id, e.target.value || null)}
                className="rounded border bg-transparent px-2 py-1 text-xs disabled:opacity-50"
                style={{ borderColor: "var(--line-soft)" }}
                aria-label={`Profil untuk ${c.name || c.id}`}
              >
                <option value="">Belum ditandai</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}

      {state.msg ? (
        <p className="mt-2 text-[11px]" style={{ color: sev.text }}>{state.msg}</p>
      ) : null}
    </div>
  );
}
