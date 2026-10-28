# Plan 05 — Report Builder & Renderers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn snapshots plus usage rows into one plain report object, and render
it as email-safe HTML and as plain text — the single source both the email and
the dashboard read, so they cannot disagree.

**Architecture:** `buildReport.js` is pure: snapshots and usage in, report
object out, no I/O and no HTML. Two renderers consume it. Email HTML is
table-layout with inline styles and literal hex — no flexbox, no CSS custom
properties, no script, no external URL.

**Tech Stack:** Plain ESM JavaScript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-centralized-claude-monitoring-design.md` (§4.1, §4.2, §4.3, §5.5a, §5.6)

**Global Constraints:** see `2026-10-28-00-overview.md`.

## Review Focus

Covered here:
- An omitted quota window must render as absent, never `0%` → Task 1.
- A Desktop-only row must read `"tak terukur"`, never blank or `0` → Task 1.
- A report day with partial sampling must state its coverage → Task 2.
- Email HTML must survive a client that strips CSS and blocks images → Task 3.

---

### Task 1: Report rows

**Files:**
- Create: `src/lib/monitoring/report/buildReport.js`
- Test: `tests/unit/monitoring-report-rows.test.js`

**Interfaces:**
- Consumes: `computeUnits`, `severityForWindow`, `pickActiveWindow` from
  `src/lib/monitoring/tokens.js` (Plan 01).
- Produces: `buildReportRows(input) -> Array<Row>` where `input` is
  `{ snapshots, usageByConnection, pricing }` and each `Row` is
  `{ connectionId, account, email, source, windows, units, costUsd, resetAt,
  measurable, ok, errorMessage }`.
  - `windows` is an array of `{ key, label, percent, severity, resetAt }`,
    **containing only windows the API returned**.
  - `units` and `costUsd` are `null` — not `0` — when `source === "desktop"`.
  - `measurable` is `false` for a desktop row, which is what the renderers key
    `"tak terukur"` off.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { buildReportRows } from "../../src/lib/monitoring/report/buildReport.js";

const snap = (id, over = {}) => ({
  connectionId: id, accountEmail: `${id}@t.io`, plan: "Claude Code",
  source: "9router", ok: 1, capturedAt: "2026-10-28T15:00:00.000Z",
  quotas: {
    "session (5h)": { used: 94, resetAt: "2026-10-28T16:00:00Z" },
    "weekly (7d)":  { used: 71, resetAt: "2026-11-03T14:00:00Z" },
  },
  ...over,
});

describe("buildReportRows", () => {
  it("fills units and cost for a proxied account", () => {
    const [row] = buildReportRows({
      snapshots: [snap("alice")],
      usageByConnection: {
        alice: [{ promptTokens: 1000, completionTokens: 100,
                  cacheCreationInputTokens: 2000, cacheReadInputTokens: 5000,
                  model: "claude-opus-5" }],
      },
      pricing: { claude: { "claude-opus-5": { input: 15, output: 75 } } },
    });
    expect(row.measurable).toBe(true);
    expect(row.units).toBeCloseTo(2000 * 1.25 + 5000 * 0.1 + 1000 + 100 * 5, 2);
    expect(row.costUsd).toBeGreaterThan(0);
  });

  it("marks a desktop row unmeasurable with null, not zero", () => {
    // A 0 would read as "this person did no work"; that misreading is the
    // single most costly failure this report can have.
    const [row] = buildReportRows({
      snapshots: [snap("sari", { source: "desktop" })],
      usageByConnection: {}, pricing: {},
    });
    expect(row.measurable).toBe(false);
    expect(row.units).toBe(null);
    expect(row.costUsd).toBe(null);
  });

  it("omits a window the API did not return rather than reporting 0%", () => {
    // seven_day_opus: null was observed live.
    const [row] = buildReportRows({
      snapshots: [snap("bob", { quotas: { "session (5h)": { used: 8 } } })],
      usageByConnection: {}, pricing: {},
    });
    expect(row.windows.map((w) => w.key)).toEqual(["session (5h)"]);
    expect(row.windows.find((w) => w.key === "weekly (7d)")).toBeUndefined();
  });

  it("carries the API's severity through per window", () => {
    const [row] = buildReportRows({
      snapshots: [snap("carl", {
        quotas: { "session (5h)": { used: 100, severity: "critical" } },
      })],
      usageByConnection: {}, pricing: {},
    });
    expect(row.windows[0].severity).toBe("critical");
  });

  it("surfaces a failed read as unknown rather than as zero use", () => {
    const [row] = buildReportRows({
      snapshots: [snap("dead", { ok: 0, quotas: null, errorMessage: "token expired" })],
      usageByConnection: {}, pricing: {},
    });
    expect(row.ok).toBe(false);
    expect(row.windows).toEqual([]);
    expect(row.errorMessage).toBe("token expired");
  });

  it("uses the newest snapshot per connection", () => {
    const [row] = buildReportRows({
      snapshots: [
        snap("alice", { capturedAt: "2026-10-28T09:00:00.000Z", quotas: { "session (5h)": { used: 10 } } }),
        snap("alice", { capturedAt: "2026-10-28T15:00:00.000Z", quotas: { "session (5h)": { used: 90 } } }),
      ],
      usageByConnection: {}, pricing: {},
    });
    expect(row.windows[0].percent).toBe(90);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-report-rows.test.js`
Expected: FAIL — cannot resolve `buildReport.js`

- [ ] **Step 3: Implement `buildReportRows(input) -> Array<Row>` in `src/lib/monitoring/report/buildReport.js`**

Group snapshots by `connectionId` and keep the newest by `capturedAt`. Build
`windows` by iterating the snapshot's `quotas` keys — never a fixed list, so an
absent window is simply absent. Cost is summed per row from each usage record's
model pricing; a model with no pricing entry contributes 0 to cost but still
contributes units.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-report-rows.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring/report/buildReport.js tests/unit/monitoring-report-rows.test.js
git commit -m "feat(monitoring): build per-account report rows"
```

---

### Task 2: Summary and sampling coverage

**Files:**
- Modify: `src/lib/monitoring/report/buildReport.js`
- Test: `tests/unit/monitoring-report-summary.test.js`

**Interfaces:**
- Produces: `buildReport(input) -> Report` where `Report` is
  `{ dateKey, generatedAt, rows, summary, coverage, footnotes }`.
  - `summary`: `{ atRiskCount, limitDaysThisWeek, measuredCount, unmeasuredCount }`
  - `coverage`: `{ samplesTaken, samplesExpected, percent, partial }`
  - `footnotes`: the fixed Indonesian strings required by spec §4.1.
  `input` gains `{ dateKey, samplesExpected, weekSnapshots }`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { buildReport } from "../../src/lib/monitoring/report/buildReport.js";

const base = {
  dateKey: "2026-10-28", samplesExpected: 24, weekSnapshots: [],
  usageByConnection: {}, pricing: {},
};
const snap = (id, used, over = {}) => ({
  connectionId: id, source: "desktop", ok: 1,
  capturedAt: "2026-10-28T15:00:00.000Z",
  quotas: { "session (5h)": { used } }, ...over,
});

describe("buildReport summary", () => {
  it("counts accounts at or past 90% on any window", () => {
    const r = buildReport({ ...base, snapshots: [snap("a", 94), snap("b", 12)] });
    expect(r.summary.atRiskCount).toBe(1);
  });

  it("splits measured from unmeasured accounts", () => {
    const r = buildReport({ ...base, snapshots: [
      snap("a", 10, { source: "9router" }), snap("b", 10), snap("c", 10),
    ]});
    expect(r.summary).toMatchObject({ measuredCount: 1, unmeasuredCount: 2 });
  });

  it("reports sampling coverage and flags a partial day", () => {
    // A trend computed from 40% coverage, presented as fact, would mislead
    // a budget decision. Downtime makes limit-days UNDERcount.
    const samples = Array.from({ length: 9 }, (_, i) => ({
      connectionId: "a", capturedAt: `2026-10-28T${String(i).padStart(2, "0")}:00:00.000Z`,
      ok: 1, source: "desktop", quotas: { "session (5h)": { used: 5 } },
    }));
    const r = buildReport({ ...base, snapshots: samples });
    expect(r.coverage).toMatchObject({ samplesTaken: 9, samplesExpected: 24, partial: true });
    expect(r.coverage.percent).toBeCloseTo(37.5, 1);
  });

  it("does not flag a full day as partial", () => {
    const samples = Array.from({ length: 24 }, (_, i) => ({
      connectionId: "a", capturedAt: `2026-10-28T${String(i).padStart(2, "0")}:00:00.000Z`,
      ok: 1, source: "desktop", quotas: { "session (5h)": { used: 5 } },
    }));
    const r = buildReport({ ...base, snapshots: samples });
    expect(r.coverage.partial).toBe(false);
  });

  it("counts days this week on which any account hit a limit", () => {
    const r = buildReport({ ...base, snapshots: [snap("a", 10)], weekSnapshots: [
      { dateKey: "2026-10-26", quotas: { "session (5h)": { used: 100 } }, ok: 1 },
      { dateKey: "2026-10-27", quotas: { "session (5h)": { used: 100 } }, ok: 1 },
      { dateKey: "2026-10-27", quotas: { "weekly (7d)": { used: 100 } }, ok: 1 },
      { dateKey: "2026-10-28", quotas: { "session (5h)": { used: 40 } }, ok: 1 },
    ]});
    expect(r.summary.limitDaysThisWeek).toBe(2);   // distinct days, not rows
  });

  it("always carries the three footnotes the spec fixes", () => {
    const r = buildReport({ ...base, snapshots: [snap("a", 10)] });
    const all = r.footnotes.join(" ");
    expect(all).toContain("9router");          // token/cost only for proxied accounts
    expect(all).toContain("tak terukur");      // what it means
    expect(all).toContain("API");              // cost is an API-price equivalent
    expect(r.footnotes.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-report-summary.test.js`
Expected: FAIL — `buildReport is not a function`

- [ ] **Step 3: Implement `buildReport(input) -> Report` in `src/lib/monitoring/report/buildReport.js`**

Reuse `buildReportRows` for `rows`. `samplesTaken` counts distinct
`capturedAt` values among the day's snapshots. `limitDaysThisWeek` counts
**distinct `dateKey` values** where any window reached 100 — not rows, or a
busy day would count several times. Footnote strings are Indonesian and fixed
here (spec §5.5a: the email is hardcoded Indonesian).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-report-summary.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring/report/buildReport.js tests/unit/monitoring-report-summary.test.js
git commit -m "feat(monitoring): summarise report with sampling coverage"
```

---

### Task 3: Email HTML renderer

**Files:**
- Create: `src/lib/monitoring/report/renderHtml.js`
- Test: `tests/unit/monitoring-render-html.test.js`

**Interfaces:**
- Consumes: `Report` (Task 2); `SEV_TOKENS` from `src/lib/monitoring/tokens.js`.
- Produces: `renderReportHtml(report) -> string` — a complete email document.

Constraints from spec §4.3, all testable: table-based layout, fully inline
styles, no flexbox, no CSS custom properties, no external stylesheet, no
JavaScript, meters built from nested tables with width percentages.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { renderReportHtml } from "../../src/lib/monitoring/report/renderHtml.js";
import { buildReport } from "../../src/lib/monitoring/report/buildReport.js";

const report = buildReport({
  dateKey: "2026-10-28", samplesExpected: 24, weekSnapshots: [],
  usageByConnection: { alice: [{ promptTokens: 10, completionTokens: 2 }] },
  pricing: {},
  snapshots: [
    { connectionId: "alice", accountEmail: "alice@t.io", source: "9router", ok: 1,
      capturedAt: "2026-10-28T15:00:00.000Z",
      quotas: { "session (5h)": { used: 94, severity: "critical" } } },
    { connectionId: "sari", accountEmail: "sari@t.io", source: "desktop", ok: 1,
      capturedAt: "2026-10-28T15:00:00.000Z",
      quotas: { "session (5h)": { used: 97 } } },
  ],
});

describe("renderReportHtml", () => {
  const html = renderReportHtml(report);

  it("survives an email client that strips CSS and blocks images", () => {
    // Neutral DS rule, mandatory here: colour is never the only signal.
    expect(html).toContain("94");
    expect(html).toContain("97");
    expect(html).not.toContain("<img");
  });

  it("uses no CSS feature email clients drop", () => {
    expect(html).not.toContain("var(--");
    expect(html).not.toMatch(/display\s*:\s*flex/);
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/https?:\/\//);   // no external fetch of any kind
  });

  it("prints 'tak terukur' for an unmeasurable cell, not a blank or a zero", () => {
    expect(html).toContain("tak terukur");
  });

  it("includes every account row and the footnotes", () => {
    expect(html).toContain("alice@t.io");
    expect(html).toContain("sari@t.io");
    for (const f of report.footnotes) expect(html).toContain(f.slice(0, 24));
  });

  it("states sampling coverage so a partial day cannot read as complete", () => {
    expect(html).toMatch(/cakupan|coverage/i);
  });

  it("escapes account text rather than interpolating it raw", () => {
    const evil = renderReportHtml(buildReport({
      dateKey: "2026-10-28", samplesExpected: 1, weekSnapshots: [],
      usageByConnection: {}, pricing: {},
      snapshots: [{ connectionId: "x", accountEmail: "<script>alert(1)</script>",
                    source: "desktop", ok: 1, capturedAt: "2026-10-28T15:00:00.000Z",
                    quotas: {} }],
    }));
    expect(evil).not.toContain("<script>alert(1)</script>");
    expect(evil).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-render-html.test.js`
Expected: FAIL — cannot resolve `renderHtml.js`

- [ ] **Step 3: Consult the design-system MCP before writing any markup**

Required, not optional (see Global Constraints). Against
`http://10.1.11.153:1000/mcp`:

```
search_components      { "query": "progress bar meter" }
search_components      { "query": "alert banner notice" }
get_component_specs    { "component_name": "ProgressBar" }
get_component_specs    { "component_name": "InfoBanner" }
get_component_specs    { "component_name": "Badge" }
get_component_specs    { "component_name": "Table" }
```

Mirror what those specs actually say rather than this plan's paraphrase of
them. Two rules from `Badge` and `InfoBanner` are binding here: **the label is
always rendered — colour is never the only signal**, and the severity pattern
is soft fill + 1px severity line + dot + text in the severity's text colour.
Record it:
`node tools/monitoring-tracker/tracker.mjs note 05-report-builder/3 "mirrored: <components>"`

- [ ] **Step 4: Implement `renderReportHtml(report) -> string` in `src/lib/monitoring/report/renderHtml.js`**

One table for the summary strip, one for the rows, one for the footnotes. Each
meter is a two-cell nested table mirroring `ProgressBar`: a filled cell at
`width: N%` carrying the severity's `fill`, and the numeral beside it in text
ink. The footnote block mirrors `InfoBanner`. Resolve `SEV_TOKENS` to literal
hex at render time — email HTML cannot use CSS custom properties. Escape every
interpolated string through a local `esc()`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-render-html.test.js`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/monitoring/report/renderHtml.js tests/unit/monitoring-render-html.test.js
git commit -m "feat(monitoring): render the report as email-safe HTML"
```

---

### Task 4: Plain-text renderer

**Files:**
- Create: `src/lib/monitoring/report/renderText.js`
- Test: `tests/unit/monitoring-render-text.test.js`

**Interfaces:**
- Consumes: `Report` (Task 2).
- Produces: `renderReportText(report) -> string`

Some corporate clients render only the text part, and the whole report must
survive that (spec §4.3).

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { renderReportText } from "../../src/lib/monitoring/report/renderText.js";
import { buildReport } from "../../src/lib/monitoring/report/buildReport.js";

const report = buildReport({
  dateKey: "2026-10-28", samplesExpected: 24, weekSnapshots: [],
  usageByConnection: {}, pricing: {},
  snapshots: [
    { connectionId: "alice", accountEmail: "alice@t.io", source: "9router", ok: 1,
      capturedAt: "2026-10-28T15:00:00.000Z", quotas: { "session (5h)": { used: 94 } } },
    { connectionId: "sari", accountEmail: "sari@t.io", source: "desktop", ok: 1,
      capturedAt: "2026-10-28T15:00:00.000Z", quotas: { "session (5h)": { used: 97 } } },
  ],
});

describe("renderReportText", () => {
  const text = renderReportText(report);

  it("contains every account row", () => {
    expect(text).toContain("alice@t.io");
    expect(text).toContain("sari@t.io");
  });

  it("carries the percentages and the unmeasurable marker", () => {
    expect(text).toContain("94");
    expect(text).toContain("tak terukur");
  });

  it("carries the footnotes and the coverage line", () => {
    expect(text).toContain("9router");
    expect(text).toMatch(/cakupan|coverage/i);
  });

  it("emits no HTML tags at all", () => {
    expect(text).not.toMatch(/<[a-z/][^>]*>/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tests && npx vitest run unit/monitoring-render-text.test.js`
Expected: FAIL — cannot resolve `renderText.js`

- [ ] **Step 3: Implement `renderReportText(report) -> string` in `src/lib/monitoring/report/renderText.js`**

Fixed-width columns padded to align, the summary above and footnotes below.
No tags, no box-drawing that depends on a font. Column order and labels match
the HTML renderer from Task 3 exactly — the two parts of one email must not
disagree, so this task reuses that task's decisions rather than re-consulting
the MCP.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tests && npx vitest run unit/monitoring-render-text.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Verify no regression**

Run: `node tests/__baseline__/verify-no-regression.mjs`
Expected: no new failures versus the committed baseline.

- [ ] **Step 6: Commit**

```bash
git add src/lib/monitoring/report/renderText.js tests/unit/monitoring-render-text.test.js
git commit -m "feat(monitoring): render the report as plain text"
```
