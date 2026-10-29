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

describe("theme-dependent chrome follows the theme", () => {
  it("defines the sidebar tint for both themes", () => {
    // It was hardcoded white/dark-grey and keyed on .dark, so the sidebar
    // stayed dark in the light theme after the flip to dark-first.
    const g = read("../src/app/globals.css");
    expect(g).toMatch(/\.light \.bg-vibrancy/);
    expect(g).not.toMatch(/\.dark \.bg-vibrancy/);
  });

  it("re-declares the --color-* aliases under .light", () => {
    // They are declared on :root, where var(--bg) has already resolved to the
    // dark value; without re-declaring, the light theme keeps dark surfaces.
    const g = read("../src/app/globals.css");
    const light = g.slice(g.indexOf(".light {"), g.indexOf(".dark  {"));
    for (const t of ["--color-bg:", "--color-surface:", "--color-text-main:"]) {
      expect(light, `${t} must be re-declared under .light`).toContain(t);
    }
  });

  it("defines --color-text-primary, which ~36 utilities use", () => {
    expect(read("../src/app/globals.css")).toMatch(/--color-text-primary:/);
  });

  it("draws selects itself so they theme on Windows", () => {
    // color-scheme alone leaves the native control white on Windows.
    const g = read("../src/app/globals.css");
    const sel = g.slice(g.indexOf("select {"), g.indexOf("select {") + 500);
    expect(sel).toMatch(/appearance: none/);
  });
});

describe("no hardcoded light-only colours on dark chrome", () => {
  it("has no !important white/black overrides on buttons", () => {
    // "Add OpenAI Compatible" forced !bg-white !text-black to carry the
    // OpenAI brand. On Dakara's near-black canvas that is a glaring white
    // slab that fights the design system, and !important means no token can
    // correct it.
    const src = read("../src/app/(dashboard)/dashboard/providers/page.js");
    expect(src).not.toMatch(/!bg-white/);
    expect(src).not.toMatch(/!text-black/);
  });
});

describe("Dakara sheets sit below Tailwind's utilities", () => {
  it("wraps each vendored sheet in @layer ds", () => {
    // UNLAYERED css beats every cascade layer regardless of specificity, and
    // Tailwind v4 emits its utilities inside @layer utilities. Unlayered, the
    // DS's bare h1/p/code rules overrode text-size and text-color app-wide:
    // measured on /login, text-3xl rendered 22px and text-amber-400 rendered
    // grey — a security warning that lost its warning colour.
    for (const f of ["tokens.css", "colors_and_type.css", "components.css"]) {
      expect(read(`../src/vendor/dakara/${f}`), `${f} must be layered`)
        .toMatch(/@layer ds \{/);
    }
  });

  it("declares the layer order with ds below utilities", () => {
    const g = read("../src/app/globals.css");
    const order = g.match(/@layer ([a-z, ]+);/);
    expect(order, "layer order must be declared").not.toBeNull();
    const names = order[1].split(",").map((s) => s.trim());
    expect(names.indexOf("ds")).toBeLessThan(names.indexOf("utilities"));
  });

  it("clears the DS prose cap, which is wrong for dashboard UI", () => {
    // p { max-width: 760px } wrapped paragraphs early inside cards and tables.
    // No Tailwind utility contests max-width, so it needs clearing explicitly.
    expect(read("../src/app/globals.css")).toMatch(/p \{ max-width: none; \}/);
  });
});

describe("no retired brand colour survives", () => {
  it("has no coral/orange literals left in globals.css", () => {
    // #E56A4A / rgb(229,106,74) was the pre-Dakara brand. ::selection and the
    // scrollbars still used it, clashing with azure — and ::selection was the
    // visible one: both it and the DS rule were unlayered, so source order
    // decided and the orange won.
    const g = read("../src/app/globals.css");
    expect(g).not.toMatch(/229,\s*106,\s*74/);
    expect(g).not.toMatch(/#E56A4A/i);
    expect(g).not.toMatch(/#D97757/i);
  });

  it("does not ship a stale palette that claims to drive the theme", () => {
    // constants/colors.js exported the old coral values under --color-* names
    // with zero importers. Applying it would have silently undone the
    // migration, and its name invites exactly that.
    const fs = require("node:fs");
    const path = "../src/shared/constants/colors.js";
    if (!fs.existsSync(path)) return;              // deleted outright is fine
    expect(fs.readFileSync(path, "utf8")).not.toMatch(/#D97757|#E56A4A/i);
  });
});
