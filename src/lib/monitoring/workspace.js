// Workspace scoping — what each profile owns.
//
// Pure functions, no I/O: this repo's vitest has no JSX transform, so the
// decisions worth testing live here rather than inside components.

/**
 * Separator between a profile's slug and a combo's own name.
 *
 * Routing resolves a combo by NAME ALONE — src/sse/services/model.js:71 calls
 * getComboByName(parsed.model) with nothing but the string a client sent. Two
 * combos called "main" would make that lookup ambiguous and a request could
 * silently run on another person's accounts, which also puts the wrong name
 * on the usage figures. So the STORED name carries the profile and stays
 * globally unique; the UI shows the bare one.
 *
 * "/" is already how provider/model is written, so a different character
 * keeps the two namespaces visually distinct.
 */
export const PROFILE_SEP = ":";

/** Lowercased, separator-free slug for a profile. */
export function profileSlug(profile) {
  return String(profile?.name || "")
    .trim()
    .toLowerCase()
    .split(PROFILE_SEP)
    .join("-");
}

/**
 * The name a combo is STORED under.
 * @param {string} name what the user typed
 * @param {object|null} profile the owning profile, or null for a global combo
 */
export function qualifyComboName(name, profile) {
  const bare = String(name || "").trim();
  if (!profile || !bare) return bare;

  const slug = profileSlug(profile);
  if (!slug) return bare;

  // Idempotent: re-saving an already-qualified name must not stack prefixes.
  if (bare.toLowerCase().startsWith(`${slug}${PROFILE_SEP}`)) return bare;
  return `${slug}${PROFILE_SEP}${bare}`;
}

/**
 * The name shown back to the user.
 * Only the FIRST separator is the namespace boundary, so a combo genuinely
 * named "a:b" survives a round trip.
 */
export function displayComboName(storedName) {
  const s = String(storedName || "");
  const i = s.indexOf(PROFILE_SEP);
  return i === -1 ? s : s.slice(i + 1);
}

/**
 * Is this combo part of the given profile's workspace?
 *
 * A combo with no prefix belongs to EVERY profile: combos created before
 * profiles existed must not disappear from the UI the moment someone makes
 * their first profile.
 */
export function comboBelongsToProfile(combo, profile) {
  const name = String(combo?.name || "");
  const i = name.indexOf(PROFILE_SEP);
  if (i === -1) return true;

  if (!profile) return true;
  return name.slice(0, i).toLowerCase() === profileSlug(profile);
}

/**
 * An API key's profile is INHERITED from the connection it is pinned to,
 * never stored separately.
 *
 * A key carries pinnedConnectionId, which is what attributes usage to a
 * person. A second, independent profile field could disagree with it — a key
 * tagged "Dimas" pinned to Rafli's account — and then the report and the
 * workspace would name different people for the same traffic.
 *
 * @param {object} apiKey
 * @param {Record<string,string>} connectionProfiles connectionId -> profileId
 * @returns {string|null} profileId, or null when unpinned (shown everywhere)
 */
export function apiKeyProfileId(apiKey, connectionProfiles = {}) {
  const pin = apiKey?.pinnedConnectionId;
  if (!pin) return null;
  return connectionProfiles[pin] || null;
}

/**
 * Filters a list to one profile's workspace.
 *
 * Items with no owner stay visible in every profile — hiding them would make
 * pre-existing configuration look deleted.
 *
 * @param {Array} items
 * @param {Function} ownerOf item -> profileId|null
 * @param {string} profileId "" for no filter
 */
export function scopeToProfile(items = [], ownerOf, profileId = "") {
  if (!profileId) return items;
  return items.filter((item) => {
    const owner = ownerOf(item);
    return !owner || owner === profileId;
  });
}

/**
 * One page of workspace cards.
 *
 * Clamped rather than validated: deleting the last workspace on page 3 leaves
 * the UI asking for a page that no longer exists, and an empty grid there
 * reads as "my workspaces are gone".
 *
 * @param {Array} items
 * @param {number} page 1-based
 * @param {number} perPage
 */
export function paginate(items = [], page = 1, perPage = 6) {
  const size = Math.max(1, Math.floor(perPage) || 1);
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;
  return { items: items.slice(start, start + size), page: current, pageCount };
}
