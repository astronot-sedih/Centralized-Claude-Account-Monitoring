# Plan 01 — Units & Severity Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared, pure module that computes weighted `units` from a usage
record and maps a quota window to a severity tier, so the email and the
dashboard can never disagree.

**Architecture:** Pure functions, no I/O, no DB, no network. Everything later
plans need for arithmetic and colour semantics lives here. Severity prefers the
API's own `severity`/`is_active` fields and only falls back to our thresholds
when the API omits them.

**Tech Stack:** Plain ESM JavaScript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-centralized-claude-monitoring-design.md`
(§0.0.2 for the units formula and its evidence, §4.2 for severity)

**Global Constraints:** see `2026-10-28-00-overview.md`.

## Review Focus

Covered by this plan (see overview for the full list):
- A quota window the API omits entirely must read as absent, never `0%` →
  Task 2.
- A usage record missing the cache fields must not produce `NaN` → Task 1.

---

### Task 1: Units calculation

**Files:**
- Create: `src/lib/monitoring/tokens.js`
- Test: `tests/unit/monitoring-units.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `computeUnits(usage) -> number` where `usage` may carry
    `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens`,
    `output_tokens` **or** the camelCase variants
    `cacheCreationInputTokens`, `cacheReadInputTokens`, `promptTokens`,
    `completionTokens`. Missing fields count as 0.
  - `UNIT_WEIGHTS` — the frozen weight map, exported for tests and display.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { computeUnits, UNIT_WEIGHTS } from "../../src/lib/monitoring/tokens.js";

describe("computeUnits", () => {
  it("applies the weights Anthropic bills quota against", () => {
    // Spec §0.0.2, verified across 108 live records (max deviation 0.5).
    expect(UNIT_WEIGHTS).toEqual({ cacheCreation: 1.25, cacheRead: 0.1, input: 1, output: 5 });
  });

  it("matches observed records on the snake_case shape", () => {
    // First row of synthetic_9router.jsonl: 3061*1.25 + 0 + 0 + 135*5 = 4501.25
    expect(computeUnits({
      input_tokens: 0, cache_creation_input_tokens: 3061,
      cache_read_input_tokens: 0, output_tokens: 135,
    })).toBeCloseTo(4501.25, 2);
  });

  it("accepts the camelCase shape usageHistory rows use", () => {
    expect(computeUnits({
      promptTokens: 100, completionTokens: 10,
      cacheCreationInputTokens: 1000, cacheReadInputTokens: 2000,
    })).toBeCloseTo(1250 + 200 + 100 + 50, 2);
  });

  it("weights output far above cache reads", () => {
    // The whole reason raw token counts mislead: same token total, 50x the cost.
    expect(computeUnits({ output_tokens: 1000 }))
      .toBeGreaterThan(computeUnits({ cache_read_input_tokens: 1000 }) * 49);
  });

  it("treats missing and malformed fields as zero rather than NaN", () => {
    expect(computeUnits({})).toBe(0);
    expect(computeUnits(null)).toBe(0);
    expect(computeUnits(undefined)).toBe(0);
    expect(computeUnits({ output_tokens: "abc" })).toBe(0);
    expect(Number.isNaN(computeUnits({ cache_read_input_tokens: null }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-units.test.js`
Expected: FAIL — cannot resolve `src/lib/monitoring/tokens.js`

- [ ] **Step 3: Implement `computeUnits(usage) -> number` and `UNIT_WEIGHTS` in `src/lib/monitoring/tokens.js`**

Read each field through a helper that coerces to a finite number or 0, so a
string, `null` or a missing key can never produce `NaN`. Accept both key
spellings per field. Freeze `UNIT_WEIGHTS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-units.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring/tokens.js tests/unit/monitoring-units.test.js
git commit -m "feat(monitoring): add weighted units calculation"
```

---

### Task 2: Severity mapping

**Files:**
- Modify: `src/lib/monitoring/tokens.js`
- Test: `tests/unit/monitoring-severity.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 (same file, independent export).
- Produces:
  - `severityForWindow(window) -> "critical"|"high"|"medium"|"low"|"info"`
    where `window` is `{ utilization?, percent?, severity? }`. Returns `"info"`
    for a null/absent window.
  - `FALLBACK_THRESHOLDS` — `{ critical: 90, high: 75, medium: 50 }`, used only
    when the window carries no `severity`.
  - `SEV_TOKENS` — map from tier to `{ fill, line, text, dot }` literal hex,
    mirroring Neutral DS `--sev-*`. Literal hex because email HTML cannot use
    CSS custom properties (spec §4.3).
  - `pickActiveWindow(limits) -> object|null` — returns the entry with
    `is_active === true`, else the highest-percent entry, else null.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import {
  severityForWindow, pickActiveWindow, FALLBACK_THRESHOLDS, SEV_TOKENS,
} from "../../src/lib/monitoring/tokens.js";

describe("severityForWindow", () => {
  it("prefers the severity the API supplies over our thresholds", () => {
    // Observed in spike 0: Anthropic ships its own severity per window.
    expect(severityForWindow({ percent: 100, severity: "critical" })).toBe("critical");
    // 34% would be "low" by our thresholds; the API says normal — same tier, but
    // the point is we do not recompute when it told us.
    expect(severityForWindow({ percent: 34, severity: "normal" })).toBe("low");
    expect(severityForWindow({ percent: 10, severity: "warning" })).toBe("high");
  });

  it("falls back to our thresholds only when severity is absent", () => {
    expect(FALLBACK_THRESHOLDS).toEqual({ critical: 90, high: 75, medium: 50 });
    expect(severityForWindow({ utilization: 95 })).toBe("critical");
    expect(severityForWindow({ utilization: 90 })).toBe("critical");
    expect(severityForWindow({ utilization: 80 })).toBe("high");
    expect(severityForWindow({ utilization: 60 })).toBe("medium");
    expect(severityForWindow({ utilization: 10 })).toBe("low");
  });

  it("returns info for an absent window rather than implying zero use", () => {
    // seven_day_opus: null was observed live. A fabricated 0% reads as headroom.
    expect(severityForWindow(null)).toBe("info");
    expect(severityForWindow(undefined)).toBe("info");
    expect(severityForWindow({})).toBe("info");
  });

  it("ships a colour token set for every tier it can return", () => {
    for (const tier of ["critical", "high", "medium", "low", "info"]) {
      expect(SEV_TOKENS[tier]).toMatchObject({
        fill: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        line: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        text: expect.stringMatching(/^#[0-9a-f]{6}$/i),
        dot:  expect.stringMatching(/^#[0-9a-f]{6}$/i),
      });
    }
  });
});

describe("pickActiveWindow", () => {
  it("returns the window Anthropic marks active", () => {
    const limits = [
      { kind: "session", percent: 8, is_active: true },
      { kind: "weekly_all", percent: 63, is_active: false },
    ];
    expect(pickActiveWindow(limits).kind).toBe("session");
  });

  it("falls back to the highest percent when none is marked active", () => {
    expect(pickActiveWindow([
      { kind: "session", percent: 8 },
      { kind: "weekly_all", percent: 63 },
    ]).kind).toBe("weekly_all");
  });

  it("returns null for empty or missing input", () => {
    expect(pickActiveWindow([])).toBe(null);
    expect(pickActiveWindow(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-severity.test.js`
Expected: FAIL — `severityForWindow is not a function`

- [ ] **Step 3: Implement `severityForWindow`, `pickActiveWindow`, `FALLBACK_THRESHOLDS` and `SEV_TOKENS` in `src/lib/monitoring/tokens.js`**

API severity strings map: `critical → critical`, `warning`/`high` → `high`,
`medium` → `medium`, `normal`/`low` → `low`, anything unrecognised → fall
through to the thresholds. A window counts as present only when `utilization`
or `percent` is a finite number.

For `SEV_TOKENS`, pick Neutral-DS-shaped values: a soft fill, a 1px line, a
readable text colour and a dot per tier. Both the email and the React page read
this one map.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-severity.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Verify no regression**

Run: `node tests/__baseline__/verify-no-regression.mjs`
Expected: no new failures versus the committed baseline.

- [ ] **Step 6: Commit**

```bash
git add src/lib/monitoring/tokens.js tests/unit/monitoring-severity.test.js
git commit -m "feat(monitoring): map quota windows to severity tiers"
```
