# Dakara DS components (vendored)

Copied verbatim from `dakara-ds/components/` (the design-system source), with
one change: a `"use client"` directive at the top of each file, because every
component uses hooks and Next's App Router renders on the server by default.

**Why vendored rather than installed:** dakara-ds ships no `package.json` and
its built bundle is UMD (`window.DakaraDesignSystem_a2dcc3`), so it cannot be
imported by Next. The `.jsx` sources have no external imports — only relative
ones — so copying them is the smallest thing that works.

**Do not hand-edit these files.** To take an upstream change, re-copy from
`dakara-ds/components/` and re-apply the directive. Styling lives in
`components.css` (the `.ds-*` classes) and reads the tokens defined in
`src/app/globals.css`.
