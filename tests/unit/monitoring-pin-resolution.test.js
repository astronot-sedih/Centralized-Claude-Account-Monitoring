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

  it("returns null when the key lookup throws, rather than pinning to something wrong", async () => {
    expect(await resolvePinnedConnectionId(req({ "authorization": "Bearer k1" }), {
      getApiKeyByKey: async () => { throw new Error("db locked"); },
    })).toBe(null);
  });
});

describe("apiKeysRepo exposes the pin", () => {
  it("maps pinnedConnectionId out of the row, or the pin can never be read", async () => {
    // rowToKey() builds an explicit object and drops unknown columns, so the
    // schema column alone is not enough.
    const { getApiKeyByKey } = await import("../../src/lib/db/repos/apiKeysRepo.js");
    const { getAdapter } = await import("../../src/lib/db/driver.js");
    const db = await getAdapter();
    const key = "pin-read-test-" + Date.now();
    db.run(`INSERT INTO apiKeys (id, key, name, machineId, isActive, createdAt, pinnedConnectionId)
            VALUES (?, ?, 'pin test', 'm', 1, ?, ?)`,
           [key, key, new Date().toISOString(), "conn-xyz"]);
    try {
      expect((await getApiKeyByKey(key))?.pinnedConnectionId).toBe("conn-xyz");
    } finally {
      db.run(`DELETE FROM apiKeys WHERE key = ?`, [key]);
    }
  });
});
