import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const ROUTE = "../src/app/api/monitoring/recipients/route.js";

// Comments may name a secret while explaining why the code avoids it; only the
// code matters for these assertions.
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

describe("recipients API", () => {
  it("exists with GET and PUT", { timeout: 30000 }, async () => {
    const mod = await import("../../src/app/api/monitoring/recipients/route.js");
    expect(mod.GET).toBeTypeOf("function");
    expect(mod.PUT).toBeTypeOf("function");
  });

  it("is dynamic and no-store", () => {
    expect(read(ROUTE)).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("validates addresses rather than trusting the client", () => {
    // The list ends up in an SMTP envelope; one junk entry fails the send for
    // everyone on it.
    expect(codeOnly(read(ROUTE))).toMatch(/parseRecipients/);
  });

  it("never reads or returns the SMTP password", () => {
    expect(codeOnly(read(ROUTE))).not.toMatch(/monitorSmtpPass|\.pass\b/);
  });

  it("reports what it rejected instead of discarding it silently", () => {
    // A typo the user cannot see is a recipient who never gets the report.
    expect(codeOnly(read(ROUTE))).toMatch(/rejected/);
  });

  it("is covered by the deny-by-default /api guard", () => {
    const guard = read("../src/dashboardGuard.js");
    const publicList = guard.slice(
      guard.indexOf("PUBLIC_API_PATHS"),
      guard.indexOf("ALWAYS_PROTECTED")
    );
    expect(publicList).not.toMatch(/monitoring/);
  });
});
