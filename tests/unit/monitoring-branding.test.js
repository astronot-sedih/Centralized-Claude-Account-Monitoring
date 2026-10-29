import { describe, expect, it } from "vitest";
import { APP_CONFIG } from "../../src/shared/constants/config.js";

describe("product branding", () => {
  it("is Dakara Router", () => {
    expect(APP_CONFIG.name).toBe("Dakara Router");
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
    expect(layout).toContain("Dakara Router");
    expect(layout).not.toMatch(/title:\s*"9Router/);
    expect(manifest).toContain("Dakara Router");
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

describe("prose says Dakara Router; identifiers keep their value", () => {
  const CLI = "../src/app/(dashboard)/dashboard/cli-tools/components";
  const read = (p) => require("node:fs").readFileSync(p, "utf8");

  it("renames the product where a human reads it", () => {
    // Sentences shown in the UI, and comments written into generated config
    // files that a human opens.
    const prose = [
      [`${CLI}/ClaudeToolCard.js`, /if 9router is deployed/i],
      [`${CLI}/CodexToolCard.js`, /if 9router is deployed/i],
      [`${CLI}/AntigravityToolCard.js`, /reroute models through 9Router/i],
      [`${CLI}/GenericCliToolCard.js`, /managed by 9Router/i],
      [`${CLI}/HermesToolCard.js`, /through 9router's/i],
    ];
    for (const [file, stale] of prose) {
      expect(read(file), `${file} still shows the old name`).not.toMatch(stale);
    }
  });

  it("does NOT touch values that are written to config files and matched back", () => {
    // GrokBuild writes name = "9Router" into the tool's own config and the
    // backend matches on it; CopilotToolCard looks for entry.name === "9Router".
    // Renaming either orphans every config already installed.
    expect(read(`${CLI}/GrokBuildToolCard.js`)).toMatch(/name = "9Router"/);
    expect(read("../src/app/api/cli-tools/copilot-settings/route.js")).toMatch(/"9Router"/);
  });

  it("does NOT touch the default API key literal or storage keys", () => {
    // sk_9router is an actual key value; the storage key namespaces saved
    // presets — changing it silently discards what users have saved.
    expect(read(`${CLI}/ApiKeySelect.js`)).toMatch(/sk_9router/);
    expect(read(`${CLI}/cliEndpointPresets.js`)).toMatch(/"9router\.cliToolEndpointPresets"/);
  });
});

describe("generated config files: comment renamed, keys untouched", () => {
  const read = (p) => require("node:fs").readFileSync(p, "utf8");
  const codex = "../src/app/(dashboard)/dashboard/cli-tools/components/CodexToolCard.js";

  it("renames the header comment a user opens the file and reads", () => {
    expect(read(codex)).toMatch(/# Dakara Router configuration for Codex CLI/);
  });

  it("keeps the TOML provider key and name value, which cross-reference", () => {
    // model_provider = "9router" must match [model_providers.9router], and the
    // backend matches on name = "9Router". Renaming either breaks every config
    // already written to a user's machine.
    const s = read(codex);
    expect(s).toMatch(/model_provider = "9router"/);
    expect(s).toMatch(/\[model_providers\.9router\]/);
    expect(s).toMatch(/name = "9Router"/);
  });
});
