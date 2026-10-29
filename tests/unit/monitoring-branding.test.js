import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "../../src/shared/constants/config.js";

describe("product branding", () => {
  it("is DakaraRouter", () => {
    expect(APP_CONFIG.name).toBe("DakaraRouter");
  });

  it("keeps the npm package and upstream URLs untouched", async () => {
    // The name on screen changes; the published package, the changelog URL and
    // the install command still point at the upstream project. Renaming those
    // would break updates and the donate/changelog fetches.
    const { UPDATER_CONFIG, GITHUB_CONFIG } = await import("../../src/shared/constants/config.js");
    expect(UPDATER_CONFIG.npmPackageName).toBe("9router");
    expect(GITHUB_CONFIG.changelogUrl).toContain("9router");
  });
});

describe("browser-surface branding", () => {
  it("carries no leftover brand anywhere user-facing", async () => {
    const fs = await import("node:fs");
    for (const f of ["../src/shared/constants/config.js", "../src/app/layout.js",
                     "../src/app/manifest.js", "../src/app/login/page.js",
                     "../src/app/(dashboard)/dashboard/usage/components/ProviderTopology.js"]) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, `${f} still mentions CCAM`).not.toMatch(/CCAM/);
      expect(src, `${f} still says Only For Claude`).not.toMatch(/Only For Claude/);
    }
  });

  it("renames the page title and the PWA manifest", async () => {
    const fs = await import("node:fs");
    const layout = fs.readFileSync("../src/app/layout.js", "utf8");
    const manifest = fs.readFileSync("../src/app/manifest.js", "utf8");
    expect(layout).toContain("DakaraRouter");
    expect(layout).not.toMatch(/title:\s*"9Router/);
    expect(manifest).toContain("DakaraRouter");
    expect(manifest).not.toMatch(/name:\s*'9Router -/);
  });
});

describe("no hardcoded brand on user-facing chrome", () => {
  it("the login page reads the brand from config rather than hardcoding it", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("../src/app/login/page.js", "utf8");
    expect(src).toContain("APP_CONFIG.name");
    expect(src).not.toMatch(/>9Router</);
  });

  it("leaves CLI-tool config identifiers alone", async () => {
    // These are written into the tools' own config files and matched back
    // (e.g. CopilotToolCard looks for entry.name === "9Router"). Renaming them
    // would orphan every already-installed config.
    const fs = await import("node:fs");
    const copilot = fs.readFileSync("../src/app/api/cli-tools/copilot-settings/route.js", "utf8");
    expect(copilot).toContain('"9Router"');
  });
});
