// Matching workspace profiles against the claude.ai organization's members.
//
// A profile is a person. The organization already knows who its people are,
// so typing them again by hand is both work and a chance to misspell someone
// into a second profile that then splits their usage in two.
//
// Pure: the plan is computed here and applied by the caller, so the decisions
// — especially which existing profile a member matches — are testable without
// a database.

/** Lowercased, trimmed; "" when absent. Emails are compared this way only. */
const key = (v) => String(v || "").trim().toLowerCase();

/**
 * The name to give a profile for this member.
 *
 * Prefers the member's own display name, falling back to the local part of
 * the email ("durahman@x.co.id" -> "durahman"). The raw email is a poor
 * profile name: it is long, and the Usage filter shows it next to provider
 * names where a 30-character string crowds everything else out.
 */
export function profileNameFor(member) {
  const full = String(member?.account?.full_name || member?.name || "").trim();
  if (full) return full;

  const mail = key(member?.account?.email_address || member?.email);
  const local = mail.split("@")[0];
  return local || mail || "";
}

/**
 * Works out what syncing would do, without doing it.
 *
 * Matching is by EMAIL, never by name. Two people called "Agy" would collapse
 * into one profile if names were the key, and their usage with them; an email
 * is the organization's own identifier for a person.
 *
 * Nothing is ever deleted or renamed. A profile made by hand, or one whose
 * member has left the organization, is reported as `unmatched` and left
 * exactly as it is — a sync that removed profiles would silently unassign
 * every connection they own.
 *
 * @param {Array} members from /api/organizations/{org}/members
 * @param {Array} profiles existing profiles
 * @returns {{create: Array, link: Array, matched: Array, unmatched: Array, skipped: Array}}
 */
export function planProfileSync(members = [], profiles = []) {
  const byEmail = new Map();
  const byName = new Map();
  for (const p of profiles) {
    if (p?.email) byEmail.set(key(p.email), p);
    if (p?.name) byName.set(key(p.name), p);
  }

  const create = [];
  const link = [];
  const matched = [];
  const skipped = [];
  const seenEmails = new Set();

  for (const m of members) {
    const email = key(m?.account?.email_address || m?.email);
    // A member with no email cannot be matched to anything, and inventing a
    // profile for them would create a row nothing can ever link to.
    if (!email) {
      skipped.push({ reason: "tanpa email", member: m });
      continue;
    }
    // The members list can repeat a person across roles; a duplicate would
    // otherwise produce two profiles for one email.
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);

    const name = profileNameFor(m);
    const existingByEmail = byEmail.get(email);
    if (existingByEmail) {
      matched.push({ email, profileId: existingByEmail.id, name: existingByEmail.name });
      continue;
    }

    // A hand-made profile whose NAME matches gets the email attached rather
    // than a second profile created beside it. That is the case that would
    // otherwise split one person's usage across two rows.
    const existingByName = byName.get(key(name));
    if (existingByName && !existingByName.email) {
      link.push({ email, profileId: existingByName.id, name: existingByName.name });
      continue;
    }

    create.push({ email, name, role: m?.role || null, seatTier: m?.seat_tier || null });
  }

  // Profiles the organization does not know about. Reported, never touched.
  const liveEmails = new Set(seenEmails);
  const unmatched = profiles.filter((p) => !p?.email || !liveEmails.has(key(p.email)));

  return { create, link, matched, unmatched, skipped };
}

/**
 * A one-line summary of a plan, for the UI.
 * @param {ReturnType<typeof planProfileSync>} plan
 */
export function describePlan(plan) {
  const bits = [];
  if (plan.create.length) bits.push(`${plan.create.length} profil baru`);
  if (plan.link.length) bits.push(`${plan.link.length} ditautkan ke email`);
  if (plan.matched.length) bits.push(`${plan.matched.length} sudah cocok`);
  if (plan.unmatched.length) bits.push(`${plan.unmatched.length} tidak ada di organisasi`);
  if (plan.skipped.length) bits.push(`${plan.skipped.length} dilewati`);
  return bits.length ? bits.join(" · ") : "Tidak ada perubahan";
}
