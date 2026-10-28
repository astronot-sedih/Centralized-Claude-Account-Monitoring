// Quota snapshot history — one row per Claude account per read.
//
// The Claude quota API reports a point-in-time percentage with no past, so the
// trend the Max decision rests on ("hit the limit on 5 of 7 days") only exists
// if we record it ourselves.

import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

const JSON_COLUMNS = ["quotas", "extraUsage", "resetCredits"];

// A null stays a real SQL NULL rather than the string "null": a caller that
// stored no quotas must read back null, not an object.
const toJsonCol = (v) => (v == null ? null : stringifyJson(v));

function hydrate(row) {
  if (!row) return row;
  const out = { ...row };
  for (const col of JSON_COLUMNS) {
    out[col] = row[col] == null ? null : parseJson(row[col], null);
  }
  return out;
}

/**
 * @param {object} snap
 * @returns {Promise<number>} the new row id
 */
export async function insertSnapshot(snap) {
  const db = await getAdapter();
  const res = db.run(
    `INSERT INTO quotaSnapshots
       (capturedAt, dateKey, connectionId, provider, accountEmail, plan, source,
        quotas, extraUsage, resetCredits, ok, errorMessage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snap.capturedAt,
      snap.dateKey,
      snap.connectionId,
      snap.provider,
      snap.accountEmail ?? null,
      snap.plan ?? null,
      snap.source ?? null,
      toJsonCol(snap.quotas),
      toJsonCol(snap.extraUsage),
      toJsonCol(snap.resetCredits),
      snap.ok === 0 || snap.ok === false ? 0 : 1,
      snap.errorMessage ?? null,
    ]
  );
  return res?.lastInsertRowid ?? res?.lastID ?? null;
}

/**
 * Newest row per connection.
 * @returns {Promise<Array<object>>}
 */
export async function getLatestPerConnection() {
  const db = await getAdapter();
  // Correlated subquery rather than a window function: the adapter chain spans
  // bun:sqlite, better-sqlite3, node:sqlite and sql.js, and this form works on
  // every one of them.
  const rows = db.all(
    `SELECT * FROM quotaSnapshots q
      WHERE q.capturedAt = (
        SELECT MAX(q2.capturedAt) FROM quotaSnapshots q2
         WHERE q2.connectionId = q.connectionId
      )
      GROUP BY q.connectionId
      ORDER BY q.connectionId`
  );
  return rows.map(hydrate);
}

/**
 * @param {string} dateKey local YYYY-MM-DD
 * @returns {Promise<Array<object>>}
 */
export async function getSnapshotsForDate(dateKey) {
  const db = await getAdapter();
  const rows = db.all(
    `SELECT * FROM quotaSnapshots WHERE dateKey = ? ORDER BY capturedAt ASC`,
    [dateKey]
  );
  return rows.map(hydrate);
}

/**
 * Deletes rows strictly older than `dateKey` — the boundary day itself is
 * kept, so a 90-day retention really retains 90 days.
 * @returns {Promise<number>} rows deleted
 */
export async function pruneSnapshotsOlderThan(dateKey) {
  const db = await getAdapter();
  const res = db.run(`DELETE FROM quotaSnapshots WHERE dateKey < ?`, [dateKey]);
  return res?.changes ?? 0;
}

/**
 * Inclusive on both bounds.
 * @returns {Promise<Array<object>>}
 */
export async function getSnapshotRange(connectionId, fromDateKey, toDateKey) {
  const db = await getAdapter();
  const rows = db.all(
    `SELECT * FROM quotaSnapshots
      WHERE connectionId = ? AND dateKey >= ? AND dateKey <= ?
      ORDER BY capturedAt ASC`,
    [connectionId, fromDateKey, toDateKey]
  );
  return rows.map(hydrate);
}
