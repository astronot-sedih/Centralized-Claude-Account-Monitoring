import { describe, expect, it } from "vitest";
import fs from "node:fs";

const src = fs.readFileSync("../src/shared/components/Sidebar.js", "utf8");

// The nav items actually rendered: commented-out lines are hidden, and the
// System block (Media Providers + systemItems) is behind a flag, so its
// COMBINED_WEB_ITEM definition is unreachable even though it still exists.
const uncommented = src
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

const navBlock = uncommented.slice(
  uncommented.indexOf("const navItems = ["),
  uncommented.indexOf("const debugItems")
);

const liveHrefs = (navBlock.match(/href: "\/dashboard[^"]*"/g) ?? [])
  .map((m) => m.slice(7, -1));

const systemHidden = /const SHOW_SYSTEM_SECTION = false/.test(uncommented);

describe("sidebar is scoped to monitoring and reporting", () => {
  it("shows exactly the pages this product needs", () => {
    expect(new Set(liveHrefs)).toEqual(new Set([
      "/dashboard/monitoring",   // the report — the whole point
      "/dashboard/providers",    // connect accounts, flag monitor-only
      "/dashboard/usage",        // proxied token/cost detail
      "/dashboard/quota",        // live per-provider quota
      "/dashboard/endpoint",     // API keys + per-key account pinning
      "/dashboard/token-saver",  // RTK — moves the units the report counts
    ]));
  });

  it("includes the monitoring report, which was reachable only by URL", () => {
    expect(liveHrefs).toContain("/dashboard/monitoring");
  });

  it("keeps Endpoint & Key — pinning cannot be configured without it", () => {
    // Without a pin, a teammate's traffic lands on whichever account selection
    // picks, and every per-person figure in the report names the wrong person.
    expect(liveHrefs).toContain("/dashboard/endpoint");
  });

  it("keeps Token Saver visible — it moves the units the report counts", () => {
    // RTK compresses tool_result content before translation, so tuning it
    // changes the per-person figures the upgrade case rests on.
    expect(liveHrefs).toContain("/dashboard/token-saver");
  });

  it("hides the System block, which is routing and media tooling", () => {
    expect(systemHidden).toBe(true);
  });

  it("keeps Settings reachable — it was inside the block being hidden", () => {
    // Theme and password live there; hiding the System block would otherwise
    // have taken Settings with it.
    expect(uncommented).toMatch(/Settings — outside the System block/);
    expect(uncommented).toMatch(/href="\/dashboard\/profile"/);
  });

  it("hides the routing-tool pages rather than deleting them", () => {
    // Hidden, not removed: the routes still work, several share components
    // with pages we keep, and restoring one is a one-line change.
    for (const gone of ["combos", "cli-tools", "proxy-pools",
                        "skills", "console-log", "translator", "basic-chat"]) {
      expect(liveHrefs, `${gone} should not be in the nav`)
        .not.toContain(`/dashboard/${gone}`);
    }
  });
});
