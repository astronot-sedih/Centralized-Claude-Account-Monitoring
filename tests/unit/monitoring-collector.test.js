import { describe, expect, it, vi } from "vitest";
import { collectOnce, resolveSource } from "../../src/lib/monitoring/quotaCollector.js";

const conn = (id, extra = {}) => ({
  id, provider: "claude", isActive: 1, name: id, email: `${id}@t.io`,
  accessToken: "sk-ant-oat01-" + "x".repeat(60), ...extra,
});

describe("collectOnce", () => {
  it("writes one snapshot per account", async () => {
    const inserted = [];
    const r = await collectOnce({
      getProviderConnections: async () => [conn("a"), conn("b")],
      refreshAndUpdateCredentials: async (c) => ({ connection: c, refreshed: false }),
      getClaudeUsage: async () => ({ plan: "Claude Code", quotas: { "session (5h)": { used: 5 } } }),
      insertSnapshot: async (s) => { inserted.push(s); return inserted.length; },
      resolveSourceFor: async () => "desktop",
      delay: async () => {},
    });
    expect(r).toMatchObject({ attempted: 2, ok: 2, failed: 0 });
    expect(inserted.map((s) => s.connectionId)).toEqual(["a", "b"]);
    expect(inserted[0].ok).toBe(1);
  });

  it("keeps going when one account's refresh throws, and records it as a failed read", async () => {
    const inserted = [];
    const r = await collectOnce({
      getProviderConnections: async () => [conn("bad"), conn("good")],
      refreshAndUpdateCredentials: async (c) => {
        if (c.id === "bad") throw new Error("Refresh token invalid or reused.");
        return { connection: c, refreshed: false };
      },
      getClaudeUsage: async () => ({ quotas: { "session (5h)": { used: 1 } } }),
      insertSnapshot: async (s) => { inserted.push(s); return inserted.length; },
      resolveSourceFor: async () => "9router",
      delay: async () => {},
    });
    expect(r).toMatchObject({ attempted: 2, ok: 1, failed: 1 });
    const bad = inserted.find((s) => s.connectionId === "bad");
    expect(bad.ok).toBe(0);
    expect(bad.errorMessage).toContain("Refresh token invalid");
  });

  it("persists a 429 as a failed read rather than throwing", async () => {
    const inserted = [];
    const r = await collectOnce({
      getProviderConnections: async () => [conn("a")],
      refreshAndUpdateCredentials: async (c) => ({ connection: c, refreshed: false }),
      // The service soft-fails with {message} instead of quotas on 429.
      getClaudeUsage: async () => ({ message: "Claude connected. Unable to fetch usage: 429" }),
      insertSnapshot: async (s) => { inserted.push(s); return 1; },
      resolveSourceFor: async () => "desktop",
      delay: async () => {},
    });
    expect(r).toMatchObject({ attempted: 1, ok: 0, failed: 1 });
    expect(inserted[0].ok).toBe(0);
  });

  it("never lets a token reach the persisted error text", async () => {
    const tok = "sk-ant-oat01-" + "Z".repeat(70);
    const inserted = [];
    await collectOnce({
      getProviderConnections: async () => [conn("a", { accessToken: tok })],
      refreshAndUpdateCredentials: async () => { throw new Error(`bad token ${tok}`); },
      getClaudeUsage: async () => ({ quotas: {} }),
      insertSnapshot: async (s) => { inserted.push(s); return 1; },
      resolveSourceFor: async () => "desktop",
      delay: async () => {},
    });
    expect(inserted[0].errorMessage).not.toContain("sk-ant");
    expect(inserted[0].errorMessage).toContain("[redacted]");
  });

  it("polls sequentially with a delay, never in parallel", async () => {
    // 11 simultaneous calls on one endpoint is exactly what trips the 429.
    const order = [];
    const delay = vi.fn(async () => { order.push("delay"); });
    await collectOnce({
      getProviderConnections: async () => [conn("a"), conn("b"), conn("c")],
      refreshAndUpdateCredentials: async (c) => ({ connection: c, refreshed: false }),
      getClaudeUsage: async (tok, p, o) => {
        order.push("read");
        expect(o?.force).not.toBe(true);   // the cache and cooldown are protections
        return { quotas: { "session (5h)": { used: 1 } } };
      },
      insertSnapshot: async () => 1,
      resolveSourceFor: async () => "desktop",
      delay,
    });
    expect(order.filter((x) => x === "read")).toHaveLength(3);
    expect(delay).toHaveBeenCalled();
    expect(order.indexOf("delay")).toBeLessThan(order.lastIndexOf("read"));
  });

  it("includes monitor-only connections — that flag stops routing, not monitoring", async () => {
    const inserted = [];
    await collectOnce({
      getProviderConnections: async () => [
        conn("m", { providerSpecificData: { monitorOnly: true } }),
      ],
      refreshAndUpdateCredentials: async (c) => ({ connection: c, refreshed: false }),
      getClaudeUsage: async () => ({ quotas: { "session (5h)": { used: 3 } } }),
      insertSnapshot: async (s) => { inserted.push(s); return 1; },
      resolveSourceFor: async () => "desktop",
      delay: async () => {},
    });
    expect(inserted).toHaveLength(1);
  });

  it("asks only for claude connections", async () => {
    // Claude only — no other provider is collected (user instruction).
    let filter = null;
    await collectOnce({
      getProviderConnections: async (f) => { filter = f; return []; },
      refreshAndUpdateCredentials: async (c) => ({ connection: c }),
      getClaudeUsage: async () => ({ quotas: {} }),
      insertSnapshot: async () => 1,
      resolveSourceFor: async () => "desktop",
      delay: async () => {},
    });
    expect(filter).toMatchObject({ provider: "claude", isActive: true });
  });

  it("records a connection with no access token as a failed read, without calling the API", async () => {
    const inserted = [];
    let called = false;
    const r = await collectOnce({
      getProviderConnections: async () => [conn("empty", { accessToken: null })],
      refreshAndUpdateCredentials: async (c) => ({ connection: c, refreshed: false }),
      getClaudeUsage: async () => { called = true; return { quotas: {} }; },
      insertSnapshot: async (s) => { inserted.push(s); return 1; },
      resolveSourceFor: async () => "desktop",
      delay: async () => {},
    });
    expect(called).toBe(false);
    expect(r).toMatchObject({ attempted: 1, ok: 0, failed: 1 });
    expect(inserted[0].ok).toBe(0);
  });
});

describe("resolveSource", () => {
  it("reports 9router when the connection has proxy rows that day", async () => {
    expect(await resolveSource("c1", "2026-10-28", {
      countUsageRows: async () => 12, getConnection: async () => ({ id: "c1" }),
    })).toBe("9router");
  });

  it("reports desktop when it has none", async () => {
    expect(await resolveSource("c1", "2026-10-28", {
      countUsageRows: async () => 0, getConnection: async () => ({ id: "c1" }),
    })).toBe("desktop");
  });

  it("honours an explicit override, so a Claude Code user who did not work that day is not mislabelled", async () => {
    expect(await resolveSource("c1", "2026-10-28", {
      countUsageRows: async () => 0,
      getConnection: async () => ({
        id: "c1", providerSpecificData: { monitoring: { sourceLabel: "9router" } },
      }),
    })).toBe("9router");
  });
});
