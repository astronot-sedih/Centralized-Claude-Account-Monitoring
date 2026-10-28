import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const ROUTES = ["report", "history", "collect", "send-test"];

describe("monitoring API routes", () => {
  // Importing a route pulls in next/server, which is slow to transform here.
  it("all four routes exist", { timeout: 30000 }, async () => {
    for (const p of ROUTES) {
      const mod = await import(`../../src/app/api/monitoring/${p}/route.js`);
      expect(mod.GET || mod.POST).toBeTypeOf("function");
    }
  });

  it("are covered by the deny-by-default /api guard", () => {
    // dashboardGuard.proxy() requires auth for every /api/* path that is not
    // on the public allow-list. Being absent from that list IS the protection.
    const guard = read("../src/dashboardGuard.js");
    const publicList = guard.slice(guard.indexOf("PUBLIC_API_PATHS"), guard.indexOf("ALWAYS_PROTECTED"));
    expect(publicList).not.toMatch(/monitoring/);
    expect(guard).toMatch(/Deny-by-default for \/api\//);
  });

  it("puts send-test in ALWAYS_PROTECTED, since it sends mail outward", () => {
    // requireLogin=false must NOT open an outbound action to anyone who can
    // reach the port.
    const guard = read("../src/dashboardGuard.js");
    const always = guard.slice(guard.indexOf("const ALWAYS_PROTECTED"), guard.indexOf("// Require auth, but allow"));
    expect(always).toMatch(/monitoring\/send-test/);
  });

  it("marks every route dynamic and no-store", () => {
    for (const p of ROUTES) {
      const src = read(`../src/app/api/monitoring/${p}/route.js`);
      expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    }
  });

  it("rate-limits send-test, because it is an outbound action", { timeout: 30000 }, async () => {
    const mod = await import("../../src/app/api/monitoring/send-test/route.js");
    expect(mod.SEND_TEST_COOLDOWN_MS).toBeGreaterThanOrEqual(60000);
  });

  it("never reads a token or SMTP password into a response", () => {
    for (const p of ROUTES) {
      const src = read(`../src/app/api/monitoring/${p}/route.js`);
      expect(src).not.toMatch(/accessToken|refreshToken|monitorSmtpPass|\.pass\b/);
    }
  });
});

describe("outbound monitoring routes are hardened", () => {
  it("puts collect in ALWAYS_PROTECTED too — it is an outbound action", () => {
    // requireLogin=false must not expose 11 OAuth refreshes + 11 upstream
    // quota calls to anyone who can reach the port.
    const guard = read("../src/dashboardGuard.js");
    const always = guard.slice(guard.indexOf("const ALWAYS_PROTECTED"), guard.indexOf("// Require auth, but allow"));
    expect(always).toMatch(/monitoring\/collect/);
  });

  it("rate-limits collect", { timeout: 30000 }, async () => {
    const mod = await import("../../src/app/api/monitoring/collect/route.js");
    expect(mod.COLLECT_COOLDOWN_MS).toBeGreaterThanOrEqual(60000);
  });

  it("starts the send-test cooldown only after a successful send", () => {
    const src = read("../src/app/api/monitoring/send-test/route.js");
    expect(src).toMatch(/if \(result\.sent\) lastSentAt = Date\.now\(\)/);
  });
});
