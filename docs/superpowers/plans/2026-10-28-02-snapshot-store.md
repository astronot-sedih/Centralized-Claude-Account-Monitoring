# Plan 02 — Quota Snapshot Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `quotaSnapshots` table and repo that persist one row per account per
quota read, so trend ("hit the limit on 5 of 7 days") becomes answerable.

**Architecture:** One new entry in the existing `TABLES` map, picked up by the
schema sync on boot, plus a repo following the established
`await getAdapter()` → `db.get/all/run(sql, params)` idiom. `quotas` is stored
as verbatim JSON because Anthropic adds and removes windows.

**Tech Stack:** SQLite via the repo's adapter chain, vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-centralized-claude-monitoring-design.md` (§5.1)

**Global Constraints:** see `2026-10-28-00-overview.md`.

## Review Focus

Covered here: retention pruning must keep the boundary day rather than
off-by-one it away (Task 2) — a silent extra day of deletion would quietly
shorten the trend window the Max case rests on.

---

### Task 1: Schema entry and repo writes

**Files:**
- Modify: `src/lib/db/schema.js` (add to `TABLES`, after `usageDaily`)
- Create: `src/lib/db/repos/quotaSnapshotsRepo.js`
- Test: `tests/unit/monitoring-snapshot-repo.test.js`

**Interfaces:**
- Consumes: `getAdapter` from `src/lib/db/driver.js`; `parseJson`/`stringifyJson`
  from `src/lib/db/helpers/jsonCol.js`.
- Produces:
  - `insertSnapshot(snap) -> Promise<number>` (the new row id). `snap` is
    `{ capturedAt, dateKey, connectionId, provider, accountEmail, plan, source,
    quotas, extraUsage, resetCredits, ok, errorMessage }`. The three JSON-ish
    fields accept objects and are stringified on write.
  - `getLatestPerConnection() -> Promise<Array<Snapshot>>` — newest row per
    `connectionId`, JSON columns parsed back to objects.
  - `getSnapshotsForDate(dateKey) -> Promise<Array<Snapshot>>`
  - `getSnapshotRange(connectionId, fromDateKey, toDateKey) -> Promise<Array<Snapshot>>`

Column definitions are fixed by the spec (§5.1): `id`, `capturedAt`, `dateKey`,
`connectionId`, `provider`, `accountEmail`, `plan`, `source`, `quotas`,
`extraUsage`, `resetCredits`, `ok`, `errorMessage`, with indexes on
`(capturedAt DESC)`, `(connectionId, capturedAt DESC)` and `(dateKey)`.

- [ ] **Step 1: Confirm the schema sync picks up a new table without a migration**

Read `src/lib/db/migrations/index.js` and the `syncSchemaFromTables` path
referenced by the `apiKeys` comment in `src/lib/db/schema.js` ("Additive
columns, picked up by `syncSchemaFromTables()` on boot").

Record the finding either way:
`node tools/monitoring-tracker/tracker.mjs decide "<migration needed or not>" "<what in the code says so>"`

If a versioned migration **is** required, add `src/lib/db/migrations/002-quota-snapshots.js`
following `001-initial.js` and register it; the rest of this task is unchanged.

- [ ] **Step 2: Write the failing test**

```js
import { describe, expect, it, beforeAll } from "vitest";
import {
  insertSnapshot, getLatestPerConnection, getSnapshotsForDate, getSnapshotRange,
} from "../../src/lib/db/repos/quotaSnapshotsRepo.js";

const CONN = "test-conn-0001";

describe("quotaSnapshotsRepo", () => {
  it("round-trips a snapshot with its JSON columns parsed back", async () => {
    const quotas = { "session (5h)": { used: 8, total: 100, remaining: 92 } };
    await insertSnapshot({
      capturedAt: "2026-10-28T15:00:00.000Z", dateKey: "2026-10-28",
      connectionId: CONN, provider: "claude", accountEmail: "a@b.c",
      plan: "Claude Code", source: "9router",
      quotas, extraUsage: null, resetCredits: null, ok: 1, errorMessage: null,
    });
    const rows = await getSnapshotsForDate("2026-10-28");
    const mine = rows.find((r) => r.connectionId === CONN);
    expect(mine.quotas).toEqual(quotas);     // object, not string
    expect(mine.ok).toBe(1);
  });

  it("persists a failed read rather than dropping it", async () => {
    // "we could not read this account" is itself reportable; a missing row
    // would understate usage.
    await insertSnapshot({
      capturedAt: "2026-10-28T16:00:00.000Z", dateKey: "2026-10-28",
      connectionId: CONN + "-fail", provider: "claude",
      quotas: null, ok: 0, errorMessage: "token expired",
    });
    const rows = await getSnapshotsForDate("2026-10-28");
    const failed = rows.find((r) => r.connectionId === CONN + "-fail");
    expect(failed.ok).toBe(0);
    expect(failed.errorMessage).toBe("token expired");
    expect(failed.quotas).toBe(null);
  });

  it("returns only the newest row per connection", async () => {
    await insertSnapshot({
      capturedAt: "2026-10-28T17:00:00.000Z", dateKey: "2026-10-28",
      connectionId: CONN, provider: "claude",
      quotas: { "session (5h)": { used: 42 } }, ok: 1,
    });
    const latest = await getLatestPerConnection();
    const mine = latest.filter((r) => r.connectionId === CONN);
    expect(mine).toHaveLength(1);
    expect(mine[0].quotas["session (5h)"].used).toBe(42);
  });

  it("filters a range by dateKey inclusively", async () => {
    const rows = await getSnapshotRange(CONN, "2026-10-28", "2026-10-28");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.connectionId === CONN)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-snapshot-repo.test.js`
Expected: FAIL — cannot resolve `quotaSnapshotsRepo.js`

- [ ] **Step 4: Add the `quotaSnapshots` entry to `TABLES` in `src/lib/db/schema.js`**

Follow the shape of the neighbouring entries: a `columns` object and an
`indexes` array of `CREATE INDEX IF NOT EXISTS` statements.

- [ ] **Step 5: Implement the four functions in `src/lib/db/repos/quotaSnapshotsRepo.js`**

Use `stringifyJson` on write and `parseJson` on read for `quotas`,
`extraUsage` and `resetCredits`; a null input stays null rather than becoming
the string `"null"`. For `getLatestPerConnection`, select the max `capturedAt`
per `connectionId` — a correlated subquery or a window function, whichever the
adapter chain supports across all four backends.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-snapshot-repo.test.js`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.js src/lib/db/repos/quotaSnapshotsRepo.js tests/unit/monitoring-snapshot-repo.test.js
git commit -m "feat(monitoring): persist quota snapshots"
```

---

### Task 2: Retention pruning

**Files:**
- Modify: `src/lib/db/repos/quotaSnapshotsRepo.js`
- Test: `tests/unit/monitoring-snapshot-prune.test.js`

**Interfaces:**
- Produces: `pruneSnapshotsOlderThan(dateKey) -> Promise<number>` — deletes rows
  with `dateKey < dateKey`, returns the count deleted. The boundary day itself
  is **kept**.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { insertSnapshot, pruneSnapshotsOlderThan, getSnapshotsForDate }
  from "../../src/lib/db/repos/quotaSnapshotsRepo.js";

describe("pruneSnapshotsOlderThan", () => {
  it("deletes older rows and keeps the boundary day", async () => {
    const C = "prune-test-conn";
    for (const d of ["2026-07-01", "2026-07-30", "2026-07-31", "2026-08-01"]) {
      await insertSnapshot({
        capturedAt: `${d}T00:00:00.000Z`, dateKey: d,
        connectionId: C, provider: "claude", quotas: {}, ok: 1,
      });
    }
    const deleted = await pruneSnapshotsOlderThan("2026-07-31");
    expect(deleted).toBe(2);                                   // 07-01 and 07-30
    expect((await getSnapshotsForDate("2026-07-31")).length).toBeGreaterThan(0);
    expect((await getSnapshotsForDate("2026-08-01")).length).toBeGreaterThan(0);
    expect(await getSnapshotsForDate("2026-07-30")).toEqual([]);
  });

  it("deletes nothing when every row is newer", async () => {
    expect(await pruneSnapshotsOlderThan("1999-01-01")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-snapshot-prune.test.js`
Expected: FAIL — `pruneSnapshotsOlderThan is not a function`

- [ ] **Step 3: Implement `pruneSnapshotsOlderThan(dateKey)` in `src/lib/db/repos/quotaSnapshotsRepo.js`**

`DELETE FROM quotaSnapshots WHERE dateKey < ?`. Return the adapter's reported
change count. Strict `<`, so the boundary day survives.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-snapshot-prune.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Verify no regression**

Run: `node tests/__baseline__/verify-no-regression.mjs`
Expected: no new failures versus the committed baseline.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/repos/quotaSnapshotsRepo.js tests/unit/monitoring-snapshot-prune.test.js
git commit -m "feat(monitoring): prune snapshots past the retention window"
```
