# Plan 04 — Attribution: Monitor-Only & Key Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make per-person numbers name the right person: teammates' accounts are
readable but never routable, and a Claude Code user's traffic can only ever
land on their own connection.

**Architecture:** Two additive changes inside the account-selection filter that
already exists in `src/sse/services/auth.js` — no new selection path, nothing in
`chatCore.js`, no executor or translator touched. A pinned key narrows selection
to one connection and **fails closed** instead of falling back.

**Tech Stack:** Plain ESM JavaScript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-centralized-claude-monitoring-design.md` (§2.6, §5.9)

**Global Constraints:** see `2026-10-28-00-overview.md`.

> **Why this plan is a correctness prerequisite, not a nicety:** without it the
> gateway picks a connection per *request*, not per *requester*. Person A's call
> spends person B's quota and is recorded against B. Every token and cost figure
> in the report would name the wrong person — the exact misreading the whole
> project exists to prevent.

## Review Focus

Covered here:
- A key pinned to an exhausted connection must fail closed, never spend someone
  else's quota → Task 2.
- A key pinned to a monitor-only connection must fail closed rather than fall
  through to a routable one → Task 3.
- Existing unpinned keys and unflagged connections must behave exactly as today
  → Tasks 1, 2.

---

### Task 1: Monitor-only connections are never routed to

**Files:**
- Modify: `src/sse/services/auth.js` (the `availableConnections` filter,
  around `src/sse/services/auth.js:87`)
- Test: `tests/unit/monitoring-monitor-only.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new export. Behaviour: a connection with
  `providerSpecificData.monitorOnly === true` is excluded from
  `getProviderCredentials` selection.

**Why not `isActive = 0`:** the collector polls *active* connections, so
deactivating an account would switch off exactly the monitoring it was added
for. `monitorOnly` is a separate axis: active (polled, refreshed) but not
routable.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it, vi, beforeEach } from "vitest";

// The filter under test reads connections through the repo; stub that one
// module so the test exercises selection, not the database.
const conns = [];
vi.mock("@/lib/localDb", async (orig) => ({
  ...(await orig()),
  getProviderConnections: async () => conns,
}));

const { getProviderCredentials } = await import("../../src/sse/services/auth.js");

const conn = (id, extra = {}) => ({
  id, provider: "claude", authType: "oauth", isActive: 1,
  name: id, accessToken: "tok-" + id, priority: 1, ...extra,
});

describe("monitor-only connections", () => {
  beforeEach(() => { conns.length = 0; });

  it("are never selected for routing", async () => {
    conns.push(conn("team-a", { providerSpecificData: { monitorOnly: true } }));
    conns.push(conn("mine"));
    const cred = await getProviderCredentials("claude");
    expect(cred.connectionId).toBe("mine");
  });

  it("leave no routable account when every connection is monitor-only", async () => {
    // Spending a teammate's Pro quota is worse than a clear failure.
    conns.push(conn("team-a", { providerSpecificData: { monitorOnly: true } }));
    conns.push(conn("team-b", { providerSpecificData: { monitorOnly: true } }));
    expect(await getProviderCredentials("claude")).toBe(null);
  });

  it("do not change behaviour for connections without the flag", async () => {
    conns.push(conn("a"));
    conns.push(conn("b"));
    const cred = await getProviderCredentials("claude");
    expect(["a", "b"]).toContain(cred.connectionId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-monitor-only.test.js`
Expected: FAIL — `team-a` is still selectable

- [ ] **Step 3: Add the monitor-only check to the `availableConnections` filter in `src/sse/services/auth.js`**

One predicate line alongside the existing `excludeSet` / `isModelLockActive` /
Antigravity checks:

```js
if (c.providerSpecificData?.monitorOnly) return false;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-monitor-only.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Verify no regression — this touches live routing**

Run: `node tests/__baseline__/verify-no-regression.mjs`
Expected: no new failures versus the committed baseline. Account-selection
tests (`unit/account-fallback-4xx.test.js` and neighbours) must stay green.

- [ ] **Step 6: Commit**

```bash
git add src/sse/services/auth.js tests/unit/monitoring-monitor-only.test.js
git commit -m "feat(monitoring): exclude monitor-only connections from routing"
```

---

### Task 2: `pinnedConnectionId` column and selection narrowing

**Files:**
- Modify: `src/lib/db/schema.js` (`apiKeys.columns`, add `pinnedConnectionId: "TEXT"`)
- Modify: `src/sse/services/auth.js` (honour `options.pinnedConnectionId`)
- Test: `tests/unit/monitoring-key-pinning.test.js`

**Interfaces:**
- Consumes: `getProviderCredentials(provider, excludeConnectionIds, model, options)`
  — the existing signature; `options` already carries `preferredConnectionId`.
- Produces: `options.pinnedConnectionId` — a **hard** narrowing, unlike
  `preferredConnectionId` which is a preference. When set, only that connection
  may be returned; if it is unavailable the function returns `null`.

Additive columns on `apiKeys` are an established pattern there — the schema's
own comment records that `accessRestricted`/`accessAllow` are "picked up by
`syncSchemaFromTables()` on boot; existing rows read as unrestricted (0)".
Existing keys read `null` and behave exactly as now.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it, vi, beforeEach } from "vitest";

const conns = [];
vi.mock("@/lib/localDb", async (orig) => ({
  ...(await orig()),
  getProviderConnections: async () => conns,
}));
const { getProviderCredentials } = await import("../../src/sse/services/auth.js");

const conn = (id, extra = {}) => ({
  id, provider: "claude", authType: "oauth", isActive: 1,
  name: id, accessToken: "tok-" + id, priority: 1, ...extra,
});

describe("per-key connection pinning", () => {
  beforeEach(() => { conns.length = 0; });

  it("selects only the pinned connection", async () => {
    conns.push(conn("alice"), conn("bob"));
    for (let i = 0; i < 5; i++) {
      const cred = await getProviderCredentials("claude", null, null,
        { pinnedConnectionId: "bob" });
      expect(cred.connectionId).toBe("bob");
    }
  });

  it("fails closed when the pinned connection is excluded, rather than spending another account", async () => {
    // A silent cross-account fallback is precisely what corrupts attribution:
    // the request would be billed to someone who did not make it.
    conns.push(conn("alice"), conn("bob"));
    const cred = await getProviderCredentials("claude", new Set(["bob"]), null,
      { pinnedConnectionId: "bob" });
    expect(cred).toBe(null);
  });

  it("fails closed when the pinned connection does not exist", async () => {
    conns.push(conn("alice"));
    expect(await getProviderCredentials("claude", null, null,
      { pinnedConnectionId: "ghost" })).toBe(null);
  });

  it("leaves unpinned selection untouched", async () => {
    conns.push(conn("alice"), conn("bob"));
    const cred = await getProviderCredentials("claude");
    expect(["alice", "bob"]).toContain(cred.connectionId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-key-pinning.test.js`
Expected: FAIL — pinning is ignored, `alice` can be selected

- [ ] **Step 3: Add `pinnedConnectionId: "TEXT"` to `apiKeys.columns` in `src/lib/db/schema.js`**

- [ ] **Step 4: Honour `options.pinnedConnectionId` in `src/sse/services/auth.js`**

Read it next to `preferredConnectionId`, and when present filter
`availableConnections` down to that id. It composes with the existing checks
rather than bypassing them: a pinned connection that is excluded, model-locked
or monitor-only yields no candidate, and the function returns `null` as it
already does for "no credentials".

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-key-pinning.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Verify no regression**

Run: `node tests/__baseline__/verify-no-regression.mjs`
Expected: no new failures versus the committed baseline.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.js src/sse/services/auth.js tests/unit/monitoring-key-pinning.test.js
git commit -m "feat(monitoring): pin an API key to one provider connection"
```

---

### Task 3: Wire the pin from the request's API key

**Files:**
- Modify: `src/sse/handlers/chat.js:280` (pass the pin into
  `getProviderCredentials`)
- Create: `src/sse/services/keyPinning.js`
- Test: `tests/unit/monitoring-pin-resolution.test.js`

**Interfaces:**
- Consumes: `getApiKeyByKey` from `@/lib/db/repos/apiKeysRepo.js`;
  `extractClientApiKey` from `src/sse/services/keyAccess.js` — reuse it rather
  than re-reading headers, because it reads the key from all four places the
  middleware does (`Bearer`, `x-api-key`, `x-goog-api-key`, `?key=`) and a
  partial reader would let a pinned key sent as `x-goog-api-key` look unpinned.
- Produces: `resolvePinnedConnectionId(request, deps = {}) -> Promise<string|null>`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { resolvePinnedConnectionId } from "../../src/sse/services/keyPinning.js";

const req = (headers) => ({
  url: "http://localhost:20128/v1/messages",
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
});

describe("resolvePinnedConnectionId", () => {
  it("returns the pin recorded on the request's key", async () => {
    expect(await resolvePinnedConnectionId(req({ "authorization": "Bearer k1" }), {
      getApiKeyByKey: async (k) => (k === "k1" ? { key: "k1", pinnedConnectionId: "alice" } : null),
    })).toBe("alice");
  });

  it("reads the key from x-goog-api-key too, so a pinned key cannot look unpinned", async () => {
    expect(await resolvePinnedConnectionId(req({ "x-goog-api-key": "k1" }), {
      getApiKeyByKey: async () => ({ key: "k1", pinnedConnectionId: "alice" }),
    })).toBe("alice");
  });

  it("returns null for an unpinned key, preserving today's behaviour", async () => {
    expect(await resolvePinnedConnectionId(req({ "authorization": "Bearer k2" }), {
      getApiKeyByKey: async () => ({ key: "k2", pinnedConnectionId: null }),
    })).toBe(null);
  });

  it("returns null when there is no key at all", async () => {
    expect(await resolvePinnedConnectionId(req({}), {
      getApiKeyByKey: async () => null,
    })).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-pin-resolution.test.js`
Expected: FAIL — cannot resolve `keyPinning.js`

- [ ] **Step 3: Implement `resolvePinnedConnectionId(request, deps)` in `src/sse/services/keyPinning.js`**

Extract the key with `extractClientApiKey`, look it up, return
`pinnedConnectionId || null`. Any lookup failure returns `null` — an unreadable
key must not become an accidental pin to something.

- [ ] **Step 4: Pass the pin through in `src/sse/handlers/chat.js`**

At the existing `getProviderCredentials(provider, excludeConnectionIds, model, { requestedModel: … })`
call (`src/sse/handlers/chat.js:280`), add `pinnedConnectionId` to the options
object, resolved once per request rather than per retry.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-pin-resolution.test.js`
Expected: PASS (4 tests)

- [ ] **Step 6: Verify the routing path is intact**

Run: `node tests/__baseline__/verify-no-regression.mjs`
Expected: no new failures. This task edits the request path, so treat any new
failure in `unit/account-fallback-*.test.js` or the chat handler tests as a
blocker, not noise.

- [ ] **Step 7: Commit**

```bash
git add src/sse/services/keyPinning.js src/sse/handlers/chat.js tests/unit/monitoring-pin-resolution.test.js
git commit -m "feat(monitoring): route a pinned key to its own connection"
```
