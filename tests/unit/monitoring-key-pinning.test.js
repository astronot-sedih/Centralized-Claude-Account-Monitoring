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
        { pinnedConnectionId: "bob", pinnedProvider: "claude" });
      expect(cred.connectionId).toBe("bob");
    }
  });

  it("fails closed when the pinned connection is excluded, rather than spending another account", async () => {
    // A silent cross-account fallback is precisely what corrupts attribution:
    // the request would be billed to someone who did not make it.
    conns.push(conn("alice"), conn("bob"));
    const cred = await getProviderCredentials("claude", new Set(["bob"]), null,
      { pinnedConnectionId: "bob", pinnedProvider: "claude" });
    expect(cred).toBe(null);
  });

  it("fails closed when the pinned connection does not exist", async () => {
    conns.push(conn("alice"));
    // Deleted connection: provider unknown, so the pin still applies and
    // selection fails closed rather than using someone else's account.
    expect(await getProviderCredentials("claude", null, null,
      { pinnedConnectionId: "ghost", pinnedProvider: null })).toBe(null);
  });

  it("fails closed when pinned to a monitor-only connection", async () => {
    // Pinning must not be a way around the monitor-only guard.
    conns.push(conn("team", { providerSpecificData: { monitorOnly: true } }), conn("alice"));
    expect(await getProviderCredentials("claude", null, null,
      { pinnedConnectionId: "team", pinnedProvider: "claude" })).toBe(null);
  });

  it("leaves unpinned selection untouched", async () => {
    conns.push(conn("alice"), conn("bob"));
    const cred = await getProviderCredentials("claude");
    expect(["alice", "bob"]).toContain(cred.connectionId);
  });
});

describe("a pin is scoped to its own provider", () => {
  beforeEach(() => { conns.length = 0; });

  it("does not break the key for other providers", async () => {
    // A key pinned to a Claude connection must still reach codex, gemini and
    // the other 40+ providers. Filtering a codex connection list against a
    // Claude connection id matches nothing and returns null — the key would be
    // dead everywhere except Claude, with a misleading "no credentials" error.
    conns.push({ id: "codex-1", provider: "codex", authType: "oauth", isActive: 1,
                 name: "codex-1", accessToken: "tok", priority: 1 });
    const cred = await getProviderCredentials("codex", null, null,
      { pinnedConnectionId: "claude-abc", pinnedProvider: "claude" });
    expect(cred).not.toBe(null);
    expect(cred.connectionId).toBe("codex-1");
  });

  it("still fails closed when the pin names a connection of THIS provider", async () => {
    // Scoping must not become an escape hatch: within the pinned provider the
    // pin is still hard, or attribution breaks.
    conns.push(conn("alice"), conn("bob"));
    expect(await getProviderCredentials("claude", new Set(["bob"]), null,
      { pinnedConnectionId: "bob", pinnedProvider: "claude" })).toBe(null);
  });
});
