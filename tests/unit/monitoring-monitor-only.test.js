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
