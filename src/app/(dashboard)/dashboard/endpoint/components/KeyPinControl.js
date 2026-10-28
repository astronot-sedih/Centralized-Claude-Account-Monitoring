"use client";

import { useEffect, useState } from "react";

/**
 * Pins one API key to a single Claude connection.
 *
 * Why it exists: with several teammates' Claude accounts in one instance,
 * account selection picks per REQUEST, not per requester — person A's call
 * could spend person B's quota and be recorded against B, making every
 * per-person figure in the monitoring report name the wrong person.
 *
 * A pinned key does NOT fail over to another account: correct attribution
 * beats transparent failover here.
 */
export default function KeyPinControl({ apiKey, onChange }) {
  const [connections, setConnections] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/providers?provider=claude", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        const list = (Array.isArray(data) ? data : data?.connections || [])
          .filter((c) => c.provider === "claude");
        if (!cancelled) setConnections(list);
      } catch {
        if (!cancelled) setConnections([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!connections.length) return null;

  const pinned = apiKey?.pinnedConnectionId || "";

  const handle = async (value) => {
    setBusy(true);
    try {
      await onChange(value || null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="text-xs text-text-muted" htmlFor={`pin-${apiKey.id}`}>
        Claude account
      </label>
      <select
        id={`pin-${apiKey.id}`}
        value={pinned}
        disabled={busy}
        onChange={(e) => handle(e.target.value)}
        className="rounded border border-black/10 bg-transparent px-2 py-1 text-xs disabled:opacity-50 dark:border-white/10"
      >
        <option value="">Any (round-robin)</option>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name || c.email || c.id.slice(0, 8)}
          </option>
        ))}
      </select>
      {pinned ? (
        <span className="text-[10px] text-text-muted">
          Pinned — traffic uses only this account and will not fail over.
        </span>
      ) : null}
    </div>
  );
}
