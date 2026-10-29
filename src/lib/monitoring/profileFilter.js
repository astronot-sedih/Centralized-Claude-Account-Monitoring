// Filtering usage by profile — the person who owns the account.
//
// Pure functions, no I/O: this repo's vitest has no JSX transform, so the
// decisions worth testing live here rather than inside the page component.

/** The pseudo-profile for connections nobody has claimed yet. */
export const UNASSIGNED = "__none__";

// Maps a payload total to the per-account key it sums. Derived rather than
// hand-listed on each side: a total left out of the list keeps its unfiltered
// value, which showed "Cached Tokens 480,247,770" next to "Total Requests 0"
// — a wrong number that looks like a data bug rather than a filter bug.
const TOTAL_OF = {
  totalRequests: "requests",
  totalCost: "cost",
  totalPromptTokens: "promptTokens",
  totalCompletionTokens: "completionTokens",
  totalCachedTokens: "cachedTokens",
  totalTokens: "totalTokens",
  totalErrors: "errors",
};

/**
 * Narrows a usage-stats payload to one profile's connections.
 *
 * The totals are RECOMPUTED from the accounts that survive. Keeping the
 * original totals would show one person's rows beneath the whole team's
 * numbers — a wrong answer that looks right, which is worse than no filter.
 *
 * @param {object} stats payload from /api/usage/stats
 * @param {Record<string,string>} assignments connectionId -> profileId
 * @param {string|null} profileId "" or null for everything; UNASSIGNED for
 *   connections with no profile
 * @returns {object} stats, filtered
 */
export function filterStatsByProfile(stats, assignments = {}, profileId = "") {
  if (!profileId) return stats;
  if (!stats || typeof stats !== "object") return stats;
  if (!stats.byAccount || typeof stats.byAccount !== "object") return stats;

  // The key is "model (provider - accountName)" — usageRepo builds it that
  // way, so one connection appears under several keys and none of them is an
  // id. The connection is on the entry; falling back to the key keeps the
  // function working for callers that do key by id.
  const keep = Object.entries(stats.byAccount).filter(([key, entry]) => {
    const assigned = assignments[entry?.connectionId || key];
    return profileId === UNASSIGNED ? !assigned : assigned === profileId;
  });

  const byAccount = Object.fromEntries(keep);

  const sums = {};
  for (const [, entry] of keep) {
    for (const key of Object.values(TOTAL_OF)) {
      const v = entry?.[key];
      if (typeof v === "number" && Number.isFinite(v)) sums[key] = (sums[key] || 0) + v;
    }
  }

  // Recompute every total the payload actually carries. Totals it does not
  // carry are not invented.
  const totals = {};
  for (const [totalKey, entryKey] of Object.entries(TOTAL_OF)) {
    if (totalKey in stats) totals[totalKey] = sums[entryKey] || 0;
  }

  return { ...stats, byAccount, ...totals };
}

/**
 * Options for the filter control.
 *
 * "Belum ditandai" appears only when at least one connection actually has no
 * profile — an option that can only ever show an empty table is noise. That
 * cannot be inferred from the assignment map alone, so the caller passes the
 * connection ids it knows about.
 *
 * @param {Array<{id:string,name:string}>} profiles
 * @param {Record<string,string>} assignments connectionId -> profileId
 * @param {string[]} [connectionIds] every connection in play; when omitted,
 *   the bucket is hidden rather than guessed at
 */
export function profileOptions(profiles = [], assignments = {}, connectionIds) {
  const options = [{ value: "", label: "Semua profil" }];
  for (const p of profiles) options.push({ value: p.id, label: p.name });

  const ids = Array.isArray(connectionIds) ? connectionIds : Object.keys(assignments);
  const anyUnassigned = ids.some((id) => !assignments[id]);

  if (profiles.length && anyUnassigned) {
    options.push({ value: UNASSIGNED, label: "Belum ditandai" });
  }
  return options;
}
