"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The active workspace.
 *
 * A profile scopes what the UI SHOWS — connections, combos, keys. It does not
 * scope routing: every active connection keeps serving requests whichever
 * profile is selected. Scoping routing from a UI control would mean a stray
 * click could stop a teammate's traffic or send it to someone else's account.
 *
 * Monitoring is deliberately exempt. The daily report is the case for the
 * whole team, so filtering it by workspace would quietly understate it.
 */
const useProfileStore = create(
  persist(
    (set) => ({
      // "" means every workspace.
      activeProfileId: "",
      profiles: [],
      assignments: {},
      loaded: false,

      setActiveProfile: (activeProfileId) => set({ activeProfileId: activeProfileId || "" }),

      load: async () => {
        try {
          const res = await fetch("/api/profiles", { cache: "no-store" });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
          set((s) => ({
            profiles: data.profiles || [],
            assignments: data.assignments || {},
            loaded: true,
            // A profile deleted elsewhere must not leave the UI filtered to
            // something that no longer exists — that looks like data loss.
            activeProfileId: (data.profiles || []).some((p) => p.id === s.activeProfileId)
              ? s.activeProfileId
              : "",
          }));
        } catch {
          set({ loaded: true });
        }
      },
    }),
    {
      name: "activeProfile",
      // Only the selection is worth persisting; the lists are refetched.
      partialize: (s) => ({ activeProfileId: s.activeProfileId }),
    }
  )
);

export default useProfileStore;
