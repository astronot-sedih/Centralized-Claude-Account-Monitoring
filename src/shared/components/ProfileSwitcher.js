"use client";

import { useEffect } from "react";
import useProfileStore from "@/store/profileStore";

/**
 * Switches the active workspace.
 *
 * Changes what the UI shows — connections, combos, keys — and nothing else.
 * Routing is untouched: every active connection keeps serving requests
 * whichever profile is selected, so a stray click here cannot stop a
 * teammate's traffic or redirect it to someone else's account.
 */
export default function ProfileSwitcher() {
  const { profiles, activeProfileId, setActiveProfile, load, loaded } = useProfileStore();

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);

  // Nothing to switch between until someone creates a profile.
  if (!profiles.length) return null;

  return (
    <select
      value={activeProfileId}
      onChange={(e) => setActiveProfile(e.target.value)}
      aria-label="Workspace aktif"
      title="Workspace aktif — hanya mengubah tampilan, tidak mempengaruhi routing"
      className="rounded-lg border bg-transparent px-2 py-1 text-xs"
      style={{ borderColor: "var(--line-soft)" }}
    >
      <option value="">Semua workspace</option>
      {profiles.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}
