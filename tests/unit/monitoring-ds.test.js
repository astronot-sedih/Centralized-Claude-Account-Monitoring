import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

describe("Dakara design system wiring", () => {
  it("vendors the component sources with a client directive", () => {
    // Every component uses hooks; Next's App Router renders on the server by
    // default, so without the directive they throw at import time.
    for (const f of ["Button.jsx", "Card.jsx", "Badge.jsx", "Progress.jsx"]) {
      expect(read(`../src/vendor/dakara/${f}`)).toMatch(/^"use client"/);
    }
  });

  it("imports React explicitly, since upstream reads a UMD global", () => {
    // `const { useState } = React;` works in the UMD bundle but is a
    // ReferenceError under a bundler — verified by a 500 on first load.
    const progress = read("../src/vendor/dakara/Progress.jsx");
    expect(progress).toMatch(/import React from "react"/);
    expect(progress).toMatch(/=\s*React;/);
  });

  it("references no token the sheet does not define", () => {
    // A dangling var() resolves to nothing silently — --radius-brand-lg was
    // empty because --radius-card does not exist upstream.
    const globals = read("../src/app/globals.css");
    const tokens = read("../src/vendor/dakara/tokens.css") + read("../src/vendor/dakara/colors_and_type.css");
    const referenced = [...globals.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]);
    const dsRefs = referenced.filter((t) => !t.startsWith("--color-") && !t.startsWith("--font-ds-") && !t.startsWith("--shadow-"));
    // A token globals.css defines itself is resolvable too.
    const missing = [...new Set(dsRefs)]
      .filter((t) => !tokens.includes(`${t}:`))
      .filter((t) => !globals.includes(`${t}:`));
    expect(missing).toEqual([]);
  });

  it("loads the FULL token sheet, not a hand-picked subset", () => {
    // Porting only colours left .ds-btn at padding:0 because --pad-control-md
    // did not exist. The component CSS needs sizes, radii and spacing too.
    const tokens = read("../src/vendor/dakara/tokens.css");
    for (const t of ["--control-md", "--pad-control-md", "--radius-lg", "--sev-critical"]) {
      expect(tokens, `${t} must be present`).toContain(t);
    }
  });

  it("bridges Dakara's [data-theme] onto this repo's .dark/.light classes", () => {
    const tokens = read("../src/vendor/dakara/tokens.css");
    expect(tokens).toMatch(/:root, \[data-theme="dark"\], \.dark/);
    expect(tokens).toMatch(/\[data-theme="light"\], \.light/);
  });

  it("does not style every anchor as an accent link", () => {
    // Upstream's blanket `a { color: accent }` turned the whole sidebar azure.
    const ct = read("../src/vendor/dakara/colors_and_type.css");
    expect(ct).not.toMatch(/^a \{ color:var\(--accent-text\)/m);
    expect(ct).toMatch(/\.ds-link/);
  });

  it("keeps the DS stylesheets out of the Tailwind pipeline", () => {
    // @import'ing them inside globals.css routes them through Tailwind, which
    // fails to parse them; layout.js imports them as their own stylesheets.
    const layout = read("../src/app/layout.js");
    expect(layout).toMatch(/import "@\/vendor\/dakara\/tokens\.css"/);
    expect(read("../src/app/globals.css")).not.toMatch(/@import ".*vendor\/dakara/);
  });

  it("ships dark as the default theme", () => {
    expect(read("../src/shared/constants/config.js")).toMatch(/defaultTheme: "dark"/);
  });
});
