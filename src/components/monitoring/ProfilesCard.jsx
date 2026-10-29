"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SEV_CSS_VARS } from "@/lib/monitoring/tokens";
import { paginate } from "@/lib/monitoring/workspace";
import useProfileStore from "@/store/profileStore";

const PER_PAGE = 6;

/**
 * Workspaces — a profile owns a set of Claude connections.
 *
 * This is the first thing on the Providers page: pick a workspace, then the
 * provider list below is that workspace's. A connection is identified by a
 * uuid and whatever display name the account owner happened to set, which is
 * not how anyone asks "who used how much", so claiming one here is what
 * narrows the view and lets Usage filter by owner.
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
  const [page, setPage] = useState(1);
  // The sync plan, fetched before anything is written. Showing what WOULD
  // happen first matters because applying it creates rows in team data.
  const [plan, setPlan] = useState(null);
  const [editing, setEditing] = useState(null);
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

  // Preview the sync: GET is a dry run, POST applies it.
  const previewSync = () =>
    act(async () => {
      const res = await fetch("/api/monitoring/claude-web/sync-profiles", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setPlan(data);
    });

  const applySync = () =>
    act(async () => {
      const res = await fetch("/api/monitoring/claude-web/sync-profiles", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setPlan(null);
      const made = [
        data.created ? `${data.created} profil dibuat` : null,
        data.linked ? `${data.linked} ditautkan` : null,
        data.failed?.length ? `${data.failed.length} gagal` : null,
      ].filter(Boolean);
      setState({
        busy: false,
        msg: made.length ? made.join(" · ") : "Semua profil sudah sesuai.",
        tone: data.failed?.length ? "medium" : "low",
      });
    });

  const sev = SEV_CSS_VARS[state.tone] || SEV_CSS_VARS.info;
  const activeName = profiles.find((p) => p.id === activeProfileId)?.name || null;

  const owned = connections.filter((c) => assignments[c.id] === activeProfileId);
  const unclaimed = connections.filter((c) => !assignments[c.id]);
  const elsewhere = connections.filter(
    (c) => assignments[c.id] && assignments[c.id] !== activeProfileId,
  );
  const countOf = (id) => connections.filter((c) => assignments[c.id] === id).length;

  // "Semua workspace" is a card like any other, so the grid reads as one list
  // of choices instead of a toggle sitting beside a list.
  const cards = useMemo(
    () => [{ id: "", name: "Semua workspace", all: true }, ...profiles],
    [profiles],
  );
  const pageOf = paginate(cards, page, PER_PAGE);
  // Deleting the last workspace on a page must not strand the view there.
  useEffect(() => {
    if (pageOf.page !== page) setPage(pageOf.page);
  }, [pageOf.page, page]);

  // A connection claimed by another workspace is hidden entirely while that
  // workspace is not active — showing it would contradict the scope line.
  const visible = activeProfileId ? [...owned, ...unclaimed] : connections;

  const scopeLine = activeName
    ? `Workspace "${activeName}": ${owned.length} akun milik workspace ini` +
      (unclaimed.length ? ` + ${unclaimed.length} belum diklaim` : "") +
      (elsewhere.length ? ` · ${elsewhere.length} akun workspace lain disembunyikan` : "")
    : `Semua workspace: ${connections.length} akun Claude`;

  return (
    <section
      className="rounded-xl border px-4 py-4"
      style={{ borderColor: "var(--line-soft)" }}
      aria-label="Workspace"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Workspace</h2>
          <p className="text-[11px] opacity-60">
            Pilih workspace dulu — daftar provider di bawah mengikuti pilihan ini.
            Monitoring tetap global: laporan harian selalu memakai semua akun.
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
          <button
            type="button"
            onClick={previewSync}
            disabled={state.busy}
            title="Cocokkan workspace dengan anggota organisasi claude.ai"
            className="rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{ borderColor: "var(--sev-info-line)", color: "var(--sev-info-text)" }}
          >
            Sinkron dari Claude
          </button>
        </div>
      </div>

      {/* The plan, before anything is written. An apply that showed its
          result only afterwards would leave the operator undoing by hand. */}
      {plan ? (
        <div
          className="mt-3 rounded-lg border px-3 py-2.5 text-[11px]"
          style={{ borderColor: "var(--sev-info-line)", background: "var(--sev-info-soft)" }}
        >
          <div className="font-medium" style={{ color: "var(--sev-info-text)" }}>
            {plan.summary} · {plan.memberCount} anggota di organisasi
          </div>

          {plan.plan?.create?.length ? (
            <div className="mt-1.5">
              Akan dibuat: {plan.plan.create.map((c) => c.name).join(", ")}
            </div>
          ) : null}
          {plan.plan?.link?.length ? (
            <div className="mt-1">
              Akan ditautkan ke email:{" "}
              {plan.plan.link.map((l) => `${l.name} → ${l.email}`).join(", ")}
            </div>
          ) : null}
          {plan.plan?.unmatched?.length ? (
            <div className="mt-1 opacity-70">
              Tidak ada di organisasi (dibiarkan apa adanya):{" "}
              {plan.plan.unmatched.map((x) => x.name).join(", ")}
            </div>
          ) : null}

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={applySync}
              disabled={state.busy || (!plan.plan?.create?.length && !plan.plan?.link?.length)}
              className="rounded border px-2.5 py-1 font-medium disabled:opacity-50"
              style={{ borderColor: "var(--sev-info-line)" }}
            >
              Terapkan
            </button>
            <button type="button" onClick={() => setPlan(null)} className="opacity-60 hover:opacity-100">
              Batal
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pageOf.items.map((p) => {
          const on = p.id === activeProfileId;
          const count = p.all ? connections.length : countOf(p.id);
          return (
            <div
              key={p.id || "__all__"}
              className="relative rounded-lg border px-3 py-3 transition-colors"
              style={{
                borderColor: on ? "var(--sev-info-line)" : "var(--line-soft)",
                background: on ? "var(--sev-info-soft)" : "transparent",
              }}
            >
              <button
                type="button"
                onClick={() => setActiveProfile(p.id)}
                aria-pressed={on}
                className="block w-full text-left"
              >
                <span
                  className="block truncate text-sm font-medium"
                  style={{ color: on ? "var(--sev-info-text)" : undefined }}
                >
                  {p.name}
                </span>
                <span className="mt-0.5 block text-[11px] opacity-60">
                  {count} akun Claude
                  {p.all ? " (semua)" : ""}
                </span>
              </button>

              {p.all ? null : (
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setEditing(editing === p.id ? null : p.id)}
                    className="opacity-60 hover:opacity-100"
                    aria-expanded={editing === p.id}
                  >
                    {editing === p.id ? "Tutup" : "Kelola akun"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p)}
                    disabled={state.busy}
                    title="Hapus workspace (koneksinya tidak ikut terhapus, hanya lepas klaim)"
                    className="opacity-60 hover:opacity-100"
                  >
                    Hapus
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pageOf.pageCount > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setPage((n) => n - 1)}
            disabled={pageOf.page <= 1}
            className="rounded border px-2 py-1 disabled:opacity-40"
            style={{ borderColor: "var(--line-soft)" }}
          >
            Sebelumnya
          </button>
          <span className="opacity-60">
            Halaman {pageOf.page} / {pageOf.pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((n) => n + 1)}
            disabled={pageOf.page >= pageOf.pageCount}
            className="rounded border px-2 py-1 disabled:opacity-40"
            style={{ borderColor: "var(--line-soft)" }}
          >
            Berikutnya
          </button>
        </div>
      ) : null}

      <p className="mt-3 text-[11px]" style={{ color: "var(--sev-info-text)" }}>
        {scopeLine}
      </p>

      {/* Claiming is behind "Kelola akun" so the grid stays the first thing
          read; it opens in place rather than on another page because the
          answer to "which accounts are in here" is what you just clicked. */}
      {editing && visible.length ? (
        <div className="mt-3 space-y-1.5 rounded-lg border px-3 py-2" style={{ borderColor: "var(--line-soft)" }}>
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
                {!owner ? (
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
    </section>
  );
}
