"use client";

import { useCallback, useEffect, useState } from "react";
import { SEV_CSS_VARS } from "@/lib/monitoring/tokens";
import useProfileStore from "@/store/profileStore";

/**
 * Workspaces — a profile owns a set of Claude connections.
 *
 * A connection is identified by a uuid and whatever display name the account
 * owner happened to set, which is not how anyone asks "who used how much".
 * Claiming a connection here is what narrows the Providers view to one
 * person's accounts and lets Usage filter by owner.
 *
 * Claiming changes what the UI SHOWS, never what routes: an unclaimed
 * connection keeps serving requests, and so does a claimed one while another
 * workspace is selected. Scoping routing from here would mean a stray click
 * could stop a teammate's traffic.
 */
export default function ProfilesCard() {
  const {
    profiles,
    assignments,
    activeProfileId,
    setActiveProfile,
    load: loadProfiles,
  } = useProfileStore();
  const [connections, setConnections] = useState([]);
  const [name, setName] = useState("");
  const [state, setState] = useState({ busy: false, msg: null, tone: "low" });

  const load = useCallback(async () => {
    try {
      await loadProfiles();
      const cRes = await fetch("/api/providers?provider=claude", { cache: "no-store" });
      const cData = await cRes.json().catch(() => ({}));
      const list = (Array.isArray(cData) ? cData : cData?.connections || [])
        .filter((c) => c.provider === "claude");
      setConnections(list);
    } catch (e) {
      setState({ busy: false, msg: e.message, tone: "critical" });
    }
  }, [loadProfiles]);

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
      // Jump straight into the workspace just created, so creating one has a
      // visible effect without a second click.
      if (data?.profile?.id) setActiveProfile(data.profile.id);
    });

  const remove = (p) =>
    act(async () => {
      const res = await fetch(`/api/profiles/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error || `HTTP ${res.status}`);
      if (activeProfileId === p.id) setActiveProfile("");
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
  const activeName = profiles.find((p) => p.id === activeProfileId)?.name || null;

  const owned = connections.filter((c) => assignments[c.id] === activeProfileId);
  const unclaimed = connections.filter((c) => !assignments[c.id]);
  const elsewhere = connections.filter(
    (c) => assignments[c.id] && assignments[c.id] !== activeProfileId,
  );
  const countOf = (id) => connections.filter((c) => assignments[c.id] === id).length;

  // A connection claimed by another workspace is hidden entirely while that
  // workspace is not active — showing it would contradict the scope line.
  const visible = activeProfileId ? [...owned, ...unclaimed] : connections;

  const scopeLine = activeName
    ? `Menampilkan workspace "${activeName}": ${owned.length} akun milik workspace ini` +
      (unclaimed.length ? ` + ${unclaimed.length} belum diklaim` : "") +
      (elsewhere.length ? ` · ${elsewhere.length} akun workspace lain disembunyikan` : "")
    : `Menampilkan semua workspace: ${connections.length} akun Claude`;

  return (
    <div className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--line-soft)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Workspace</h2>
          <p className="text-[11px] opacity-60">
            Tiap workspace punya koneksi Claude sendiri. Monitoring tetap global —
            laporan harian selalu memakai semua akun.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) create(); }}
            placeholder="Nama workspace"
            className="rounded border bg-transparent px-2 py-1.5 text-xs"
            style={{ borderColor: "var(--line-soft)" }}
          />
          <button
            type="button"
            onClick={create}
            disabled={state.busy || !name.trim()}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Buat workspace
          </button>
        </div>
      </div>

      {profiles.length ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveProfile("")}
              aria-pressed={!activeProfileId}
              className="rounded border px-2 py-1 text-xs"
              style={{
                borderColor: activeProfileId ? "var(--line-soft)" : "var(--sev-info-line)",
                background: activeProfileId ? "transparent" : "var(--sev-info-soft)",
                color: activeProfileId ? undefined : "var(--sev-info-text)",
              }}
            >
              Semua workspace
            </button>
            {profiles.map((p) => {
              const on = p.id === activeProfileId;
              return (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-2 rounded border px-2 py-1 text-xs"
                  style={{
                    borderColor: on ? "var(--sev-info-line)" : "var(--line-soft)",
                    background: on ? "var(--sev-info-soft)" : "transparent",
                    color: on ? "var(--sev-info-text)" : undefined,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveProfile(p.id)}
                    aria-pressed={on}
                    className="font-medium"
                  >
                    {p.name}
                  </button>
                  <span className="opacity-60">{countOf(p.id)} akun</span>
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    disabled={state.busy}
                    title="Hapus workspace (koneksinya tidak ikut terhapus, hanya lepas klaim)"
                    className="opacity-50 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>

          <p className="mt-2 text-[11px]" style={{ color: "var(--sev-info-text)" }}>
            {scopeLine}
          </p>
        </>
      ) : (
        <p className="mt-3 text-[11px] opacity-60">
          Belum ada workspace. Buat satu per anggota tim.
        </p>
      )}

      {visible.length ? (
        <div className="mt-3 space-y-1.5">
          {visible.map((c) => {
            const owner = assignments[c.id];
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="min-w-[8rem] font-medium">
                  {c.name || c.email || c.id.slice(0, 8)}
                </span>
                <select
                  value={owner || ""}
                  disabled={state.busy}
                  onChange={(e) => assign(c.id, e.target.value || null)}
                  className="rounded border bg-transparent px-2 py-1 text-xs disabled:opacity-50"
                  style={{ borderColor: "var(--line-soft)" }}
                  aria-label={`Workspace untuk ${c.name || c.id}`}
                >
                  <option value="">Belum diklaim</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {activeProfileId && !owner ? (
                  <span className="opacity-50">terlihat di semua workspace</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {state.msg ? (
        <p className="mt-2 text-[11px]" style={{ color: sev.text }}>{state.msg}</p>
      ) : null}
    </div>
  );
}
