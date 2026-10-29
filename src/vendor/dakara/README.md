# Dakara DS (vendored)

Copied from `dakara-ds` — the design-system source — with the changes listed
below. **Do not hand-edit these files.** To take an upstream change, re-copy
and re-apply the changes; each is marked `VENDOR CHANGE` in the file.

## Why vendored rather than installed

dakara-ds ships no `package.json`, and its built bundle is UMD
(`window.DakaraDesignSystem_a2dcc3`), so Next cannot import it. The `.jsx`
sources have no external imports — only relative ones — so copying them is the
smallest thing that works.

## What was changed

**Components (`*.jsx`, `layer.js`, `tooltips.js`)**

1. `"use client"` at the top of each file — every component uses hooks, and
   Next's App Router renders on the server by default.
2. `import React from "react"` in the 21 files that do
   `const { useState } = React`. That works in the UMD bundle, where React is a
   global; under a bundler it is a ReferenceError.

**Stylesheets (`tokens.css`, `colors_and_type.css`, `components.css`,
`fonts/phosphor.css`)**

3. Each sheet's body is wrapped in `@layer ds`. Tailwind v4 emits its utilities
   inside `@layer utilities`, and **unlayered CSS beats every cascade layer**
   regardless of specificity — unlayered, the DS's bare `h1`/`p`/`code` rules
   overrode Tailwind `text-size` and `text-color` app-wide. The layer order is
   declared in `src/app/globals.css`.
4. `tokens.css`: `[data-theme="dark"]` / `[data-theme="light"]` are bridged to
   this repo's `.dark` / `.light` classes.
5. `colors_and_type.css`: the two upstream `@import`s are removed — the Google
   Fonts one (families load through `next/font` in `layout.js`) and
   `@import "tokens.css"` (imported ahead of it by `layout.js`).
6. `colors_and_type.css`: upstream styles **every** `<a>` as an accent link.
   Scoped to `.ds-link` / `.ds-prose` — the blanket rule turned the whole
   sidebar azure.

## Where things live

- **Tokens** are in `tokens.css` and `colors_and_type.css` here — *not* in
  `src/app/globals.css`, which only maps this repo's `--color-*` names onto
  them. Add or change a token here.
- **Component styles** are the `.ds-*` classes in `components.css`.
- **Icons**: `fonts/phosphor.css` holds the `.ph-*` glyph map that `Icon.jsx`
  depends on; without it DS icons render as empty boxes. The `@font-face`
  declarations are at the top of `tokens.css` and resolve `fonts/*.woff2`
  relative to it.

## Licence

Phosphor Icons 2.1.1 is MIT — see `fonts/Phosphor-LICENSE.txt`, which must
travel with the font files. dakara-ds itself carries no root licence file;
confirm terms with its owner before distributing outside this project.
