// Profiles — the PEOPLE who own Claude connections.
//
// The monitoring report answers "who is using how much", but a connection is
// identified by a uuid and an OAuth display name that the account owner chose.
// A profile puts a person's name on one or more connections so usage can be
// grouped and filtered the way the question is actually asked.
//
// A connection points at its profile (providerConnections.data.profileId)
// rather than the profile holding a list of connections: assigning is then a
// single connection write, and a deleted profile cannot leave a stale list
// behind.

import { getAdapter } from "../driver.js";
import { getProviderConnections, updateProviderConnection } from "./connectionsRepo.js";

const nameKeyOf = (name) => String(name || "").trim().toLowerCase();

function rowToProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email || null,
    note: row.note || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** @returns {Promise<Array<object>>} profiles, A–Z */
export async function listProfiles() {
  const db = await getAdapter();
  return db.all(`SELECT * FROM profiles ORDER BY name COLLATE NOCASE ASC`).map(rowToProfile);
}

export async function getProfileById(id) {
  if (!id) return null;
  const db = await getAdapter();
  return rowToProfile(db.get(`SELECT * FROM profiles WHERE id = ?`, [id]));
}

/**
 * @param {{name: string, note?: string}} data
 * @returns {Promise<object>} the created profile
 */
export async function createProfile({ name, email, note } = {}) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Profile name is required.");

  const key = nameKeyOf(clean);
  const db = await getAdapter();
  if (db.get(`SELECT id FROM profiles WHERE nameKey = ?`, [key])) {
    throw new Error(`A profile named "${clean}" already exists.`);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const mail = String(email || "").trim().toLowerCase() || null;
  db.run(
    `INSERT INTO profiles (id, name, nameKey, email, note, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, clean, key, mail, note?.trim() || null, now, now]
  );
  return { id, name: clean, email: mail, note: note?.trim() || null, createdAt: now, updatedAt: now };
}

/** Renaming keeps the id, so every assigned connection follows along. */
export async function renameProfile(id, name, note) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Profile name is required.");

  const key = nameKeyOf(clean);
  const db = await getAdapter();
  const clash = db.get(`SELECT id FROM profiles WHERE nameKey = ? AND id != ?`, [key, id]);
  if (clash) throw new Error(`A profile named "${clean}" already exists.`);

  db.run(
    `UPDATE profiles SET name = ?, nameKey = ?, note = ?, updatedAt = ? WHERE id = ?`,
    [clean, key, note === undefined ? null : note?.trim() || null, new Date().toISOString(), id]
  );
  return getProfileById(id);
}

/**
 * Attaches a claude.ai member's email to an existing profile.
 *
 * Only the email changes — the id, name and every connection assignment stay
 * put, which is what makes linking a hand-made profile safe: the person's
 * history does not move.
 */
export async function setProfileEmail(id, email) {
  const mail = String(email || "").trim().toLowerCase() || null;
  const db = await getAdapter();
  const res = db.run(`UPDATE profiles SET email = ?, updatedAt = ? WHERE id = ?`, [
    mail,
    new Date().toISOString(),
    id,
  ]);
  if ((res?.changes ?? 0) === 0) throw new Error("Profile not found.");
  return getProfileById(id);
}

/**
 * Deletes the profile AND clears it from every connection.
 *
 * A connection left pointing at a missing profile would disappear from every
 * filter, including "no profile" — present in the data, invisible in the UI.
 */
export async function deleteProfile(id) {
  const connections = await getProviderConnections({});
  for (const c of connections) {
    if (c?.providerSpecificData?.profileId === id) {
      await assignConnectionProfile(c.id, null);
    }
  }
  const db = await getAdapter();
  // Assignments held in kv (for connections that do not exist yet) must go
  // too, or they would point at a profile that is gone.
  db.run(`DELETE FROM kv WHERE scope = 'profileAssign' AND value = ?`, [id]);
  const res = db.run(`DELETE FROM profiles WHERE id = ?`, [id]);
  return (res?.changes ?? 0) > 0;
}

/** @param {string|null} profileId null clears the assignment */
export async function assignConnectionProfile(connectionId, profileId) {
  const db = await getAdapter();
  const row = db.get(`SELECT data FROM providerConnections WHERE id = ?`, [connectionId]);

  // Tests and callers may reference a connection that does not exist yet;
  // keep the assignment in a side table so it is not silently lost.
  if (!row) {
    if (profileId) {
      db.run(
        `INSERT INTO kv(scope, key, value) VALUES('profileAssign', ?, ?)
         ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [connectionId, profileId]
      );
    } else {
      db.run(`DELETE FROM kv WHERE scope = 'profileAssign' AND key = ?`, [connectionId]);
    }
    return true;
  }

  let data = {};
  try { data = JSON.parse(row.data || "{}"); } catch { data = {}; }
  const psd = { ...(data.providerSpecificData || {}) };
  if (profileId) psd.profileId = profileId;
  else delete psd.profileId;

  await updateProviderConnection(connectionId, { providerSpecificData: psd });
  return true;
}

/**
 * @returns {Promise<Record<string, string>>} connectionId -> profileId, for
 * connections that have one
 */
export async function getConnectionProfileMap() {
  const map = {};
  const connections = await getProviderConnections({});
  for (const c of connections) {
    const pid = c?.providerSpecificData?.profileId;
    if (pid) map[c.id] = pid;
  }

  const db = await getAdapter();
  for (const r of db.all(`SELECT key, value FROM kv WHERE scope = 'profileAssign'`)) {
    if (!map[r.key]) map[r.key] = r.value;
  }
  return map;
}
