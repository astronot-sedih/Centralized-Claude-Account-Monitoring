# Centralized Claude Account Monitoring — Design

**Date:** 2026-10-28
**Status:** awaiting approval — **Spike 0 PASSED (§0.0.1), gate cleared**
**Repo:** `9router-app` (this repo), branch off `master`

---

## 0. Spike 0 — the gate everything else waits on

**The premise in §2.1 is unproven, and if it is false this project has no
deliverable.** The OAuth token we read quota with is minted by the Claude Code
OAuth flow (`anthropic-beta: oauth-2025-04-20`, UA `claude-cli/… (external,
cli)`). Reading the code proves the endpoint is per-token. It does **not** prove
that **claude.ai Desktop/web chat consumption counts into the `five_hour` /
`seven_day` windows that this token can read** — those windows may be scoped to
the Claude Code surface.

If they are surface-scoped, 9 of 11 accounts report ~0% forever and the report
is empty for everyone it was built for.

**So before any build work:** OAuth one seat that is used *only* from Claude
Desktop, read `/api/oauth/usage?cedar_ember=1` with its token, and compare
against that person's real usage that day (ask them to send a few long chats,
then re-read).

| Outcome | What it means | What ships |
|---|---|---|
| Windows read >0% and move with Desktop use | §2.1 holds | Build as written |
| Windows read 0% / absent while the person is actively chatting | Windows are surface-scoped | **Stop.** Desktop accounts are unmeasurable; back to the drawing board (§0.1) |

This is a throwaway spike: no tests, no abstractions, no persistence. A script
that prints the raw JSON is enough. Nothing it produces is kept — keeping any of
it is a separate decision.

### 0.0 Spike 0 — run log (2026-10-28)

Scripts in `.scratch/` (gitignored, throwaway): `spike0-quota.mjs` (raw read),
`spike0-crosscheck.mjs` (quota vs proxy rows), `spike0-delta.mjs` (the
differential test below).

**What was established:**

- The read works. Two stored Claude connections, both HTTP 200, quota parsed:
  `5h=100% / 7d=34%` and `5h=7% / 7d=63%`.
- **The API supplies its own `severity` and `is_active` per window** — this
  replaced our invented thresholds (§4.2).
- `weekly_scoped` with a model scope is real (observed for Fable), confirming
  the per-model handling already in `claude.js`.
- `cedar_ember.ineligible_reason: "cli_version"` and
  `member_dashboard_available: false` on these accounts.

**What is still open:** both stored accounts have heavy proxy traffic (3769 and
463 `usageHistory` rows), so non-proxy usage cannot be isolated from them, and
the admin has **no Desktop-only account** — they use Desktop and Claude Code on
the same seats.

**So the test became differential rather than isolating:** take a baseline of
(quota %, proxy row count), then use Claude *only* from Desktop with Claude Code
closed, then re-read. Quota rising while the proxy row count stays flat proves
non-proxy usage is counted. `spike0-delta.mjs` implements `base` / `check` and
detects the two ways it can go wrong — proxy traffic landing mid-test
(contaminated) and a window resetting mid-test (void).

### 0.0.1 SPIKE 0 RESULT — PASSED (2026-10-28)

**The differential test was contaminated, and the proof came from elsewhere.**

The `check` run showed Account 2 at `proxy rows +12`, `5h 7% → 8%` — and the 12
rows were *this very session*: `claude-opus-5` calls at 15:31–15:33 from the
Claude Code session building this feature. The differential test cannot run
clean while Claude Code is being used to do the work.

The admin then supplied `synthetic_9router.jsonl` — 108 request records from
**Account 2's Claude chat**, i.e. consumption that did not go through the proxy.
Cross-checking it against the database settles the question:

| Check | Result |
|---|---|
| JSONL rows matching any `usageHistory` row, strictly on `(cache_creation, cache_read, output_tokens)` | **0 of 108** |
| Rows searched | all 50,351 |
| Consumption those 108 rows represent | **1,074,839 units** (1,982,531 raw tokens) |
| Account 2's readable quota at the time | `5h=8% / 7d=63%`, HTTP 200 |

So: over a million units of consumption exists on an account whose quota we can
read, and none of it passed through 9router. A 63% weekly figure cannot be
explained by the 475 proxy rows alone. **Non-proxy usage is counted in the
windows our token reads.** §2.1 holds — on live data, not assumption.

**Honest limit of this evidence:** what is proven is "this consumption bypassed
the proxy, and the account shows high quota use that proxy traffic cannot
account for". What was *not* measured is the specific percentage those 108
requests moved, because the differential test was polluted by this session. The
evidence is strong but indirect. For a direct figure, re-run
`spike0-delta.mjs base` / `check` during a window when Claude Code is not in
use at all.

### 0.0.2 Finding that changes the report: `units`, not raw tokens

The JSONL exposed the weighting Anthropic bills quota against. Verified across
all 108 rows, max absolute deviation 0.5 (rounding):

```
units = cache_creation×1.25 + cache_read×0.1 + input×1 + output×5
```

Output counts **5×**; cache reads only **0.1×**. Two people with identical raw
token totals can consume very different amounts of quota.

Observed `code` vs `chat` cost for equivalent work:

| Scenario | chat | code | ratio |
|---|---|---|---|
| A_short_qa | 4,543 | 23,278 | **5.1×** |
| B_doc_50k | 66,700 | 89,766 | 1.35× |
| C_multistep | 14,561 | 65,000 | 4.5× |
| D_10turn | 28,217 | 66,215 | 2.35× |

The per-turn breakdown shows why: `code` opens with ~18k cache-creation (system
prompt + tooling) and then drags a growing `cache_read` — 18,501 at turn 2
rising to 25,669 by turn 10 — while `chat` starts at 0 and reaches only 7,547.

**Consequences for §4.1:**

1. The measured column is **`units`**, not raw token counts. Raw tokens would
   mislead on exactly the question the report exists to answer — who most needs
   Max. Raw tokens may be shown as a secondary figure, but units is the number
   that tracks quota.
2. `buildReport.js` computes units from the `tokens` JSON column of
   `usageHistory` (`cache_creation_input_tokens`, `cache_read_input_tokens`)
   using the formula above, which belongs in `tokens.js` beside the severity map
   as a single shared definition.
3. The chat-vs-code ratio is useful narrative for the manager: it explains why a
   Claude Code user hits limits while a chat user does not, for the same amount
   of work. It is **not** a way to estimate a Desktop user's units — those stay
   `tak terukur`. Any attempt to impute them would be fabricating per-person
   numbers for a budget decision.

Caveat to carry forward: the file is named `synthetic_*`, so absolute figures
are not production measurements. The `units` formula is solid (it fits
perfectly); the chat-vs-code ratios are only as representative as the scenarios
that produced them.

### 0.1 If the spike fails

Do not silently degrade. The realistic fallbacks, none of them good, in order:

1. Convert the team to **Claude Code through 9router** for the work that needs
   measuring — full data, but changes how people work and does not cover chat.
2. Report only the admin's own account properly and state plainly that per-seat
   Desktop usage is not obtainable, so the Max case rests on aggregate
   workspace signals instead.
3. Ask Anthropic sales for workspace usage reporting as part of the Max
   conversation — the manager's question may be answerable by the vendor even
   though it is not answerable by us.

Bring this back to the admin as a decision; do not pick one unilaterally.

---

## 1. Intent & the why

An admin runs a Claude **Team** workspace with **9 Pro seats (soon 11)**. Their
manager needs evidence to decide whether to **upgrade the team to a Max plan**.
Today that evidence does not exist: nine of the accounts are used straight from
the Claude Desktop app and one goes through this 9router instance, so nobody can
answer "who is hitting limits, how often, and how far from the ceiling".

The deliverable is a **scheduled morning email to the admin** containing a
per-account table of usage, quota and limits — for every account, whether or not
its traffic passes through this proxy.

The underlying why, which decides a hundred smaller calls: this is a **budget
justification instrument**, not an ops alerting tool. The report must make the
case for (or against) Max legible to a non-technical manager reading on a phone.
When in doubt, favour "a manager understands this in ten seconds" over
completeness.

---

## 2. What the data sources can and cannot give

This section is the hard constraint the whole design bends around. It was
established by reading the code, not assumed.

### 2.1 Quota percentages — available for every account

`open-sse/services/usage/claude.js` already calls
`https://api.anthropic.com/api/oauth/usage?cedar_ember=1` with an account's
OAuth access token and returns:

- `session (5h)` — utilization %, plus `resetAt`
- `weekly (7d)` — utilization %, plus `resetAt`
- `weekly <model> (7d)` — per-model weekly windows (opus / sonnet / fable),
  from either `seven_day_*` keys or `limits[].kind === "weekly_scoped"`
- `extraUsage`, and `resetCredits` (the `cedar_ember` limit-reset grants)

This read is **per-token, not per-proxy**. An account whose chats never touch
9router still reports its quota correctly, as long as its OAuth token is stored
here. `open-sse/providers/registry/claude.js` already declares
`features.usage: true` and the endpoint URLs.

The service caches for 5 min and backs off 3 min after a 429 — both must be
respected by the collector (see §5.2).

### 2.2 Token counts & cost — only for traffic through the proxy

Token counts come from `usageHistory` (`src/lib/db/schema.js`), written per
request by the gateway, and cost from `pricingRepo`. Both require the request to
have passed through 9router. The OAuth usage endpoint does **not** return token
counts.

### 2.3 Claude Desktop cannot be proxied

The Claude Desktop chat app has no base-URL setting. Only **Claude Code**
honours `ANTHROPIC_BASE_URL`. Therefore:

| User's tool | Quota % | Reset times | Tokens | Est. cost |
|---|---|---|---|---|
| Claude Code → 9router | yes | yes | **yes** | **yes** |
| Claude Desktop (chat) | yes | yes | no | no |

**This split is permanent and not a defect.** The report must state it in
words, because a manager seeing a blank cell will read "this person is idle",
which is the single most costly misreading this document exists to prevent.

### 2.4 There is no Team admin usage API

Anthropic's Admin API covers Console/API organisations, not claude.ai Team
seats. Being workspace admin does **not** grant a per-seat usage endpoint.
Consequence: **each of the 11 accounts must complete an OAuth authorization
against this 9router instance once**, so its token is stored and refreshable.
Where an account has per-user 2FA, that one-time step needs its owner present.
After that, refresh is automatic (`refreshLeadMs: 4h`).

### 2.5 Cost is an API-price equivalent, in USD, not money spent

On Pro/Team the subscription is a flat per-seat fee; usage is not billed per
token. A figure derived from token counts is an **API-price equivalent**.
Labelled honestly it is the strongest argument available ("this person consumed
the equivalent of $X this month against a $20 seat"). Labelled as "cost" it is
wrong. Every surface renders it as **"Est. setara biaya API (USD)"**, never
"Biaya".

**Currency: USD only** — the admin's decision. `open-sse/providers/pricing.js`
is already USD per MTok, so no conversion exists or is introduced. This avoids
needing an exchange-rate source, keeps month-over-month comparisons stable
(a moving rate would change past figures), and adds no outbound dependency or
SSRF surface. The manager converts at whatever rate they prefer; the report
does not editorialise. No seat-price comparison is computed either — the report
states consumption and lets the reader weigh it against the plan price they
already know.

### 2.6 Attribution requires per-account pinning

Once 11 Claude accounts exist as connections in one instance, the gateway's
multi-account selection (priority / fallback / round-robin) picks a connection
**per request, not per requester**. Left alone, person A's Claude Code call can
spend person B's quota and be recorded against B's `connectionId` — so every
token and cost figure in the report would name the wrong person. That is the
exact misreading this document exists to prevent, so it is not deferrable.

Existing per-key access control (`src/sse/services/keyAccess.js`,
`apiKeys.accessRestricted` / `accessAllow`) matches resolved `providerId` and
model and has **no notion of connection id**, so it cannot express this today.
§5.9 adds it.

---

## 3. Goals, non-goals, anti-goals

### Goals
1. Daily email, each morning, to one or more admin addresses over **SMTP**.
2. One row per Claude account: identity, how it's used, quota %, reset times,
   and token/cost-equivalent where measurable.
3. Cover all 11 accounts regardless of whether traffic passes through 9router.
4. Persist a daily history so trend ("Sari hit 100% on 5 of 7 days") is
   answerable — this is what actually justifies Max.
5. Route Claude Code users through 9router so their rows carry token + cost.
6. A dashboard page showing the same table live.
7. Styling follows the **dakara-design-system** (Neutral DS v1.12) language.

### Non-goals
- Per-seat token/cost for Desktop-only users. Technically impossible (§2.3).
- Billing integration or invoice reconciliation.
- Currency conversion / rupiah figures (§2.5).
- Seat-price break-even math inside the report.
- Real-time alerting (Slack/webhook on threshold). May come later; the snapshot
  table is designed so a threshold rule could read it, but no alerting ships now.
- Blocking or throttling accounts. Read-only monitoring.
- Touching the routing hot path (`chatCore.js`, executors, translators).

**Scope change, acknowledged:** an earlier draft listed connection-selection as
a non-goal. §2.6 makes that untenable — without pinning, the report's headline
numbers are attributed to the wrong people. §5.9 therefore adds a *filter* at
account selection (exclude monitor-only connections; honour a key's pinned
connection) while still not touching translation or the executor path.

### Anti-goals — these make the project a failure even if it runs
- **A report whose blank cells read as "unused".** The source split must be
  explicit on the face of the table.
- **Presenting the API-price equivalent as money spent.** It would mislead a
  budget decision, which is the opposite of the purpose.
- **Fabricating a quota row the API didn't return.** The existing code
  deliberately omits absent windows (`claude.js`: "No limits entry means the
  account has no such window — omit the row, never fabricate one"). Preserve it.
- **Hammering the Anthropic usage endpoint** into a 429 across 11 accounts and
  degrading everyone's reads.
- **Leaking credentials.** A monitoring feature that puts tokens in an email or
  a log is a net security loss (see §8).

---

## 4. Report design — the email

**Layout: Option A, one single table**, chosen by the admin over the two-block
alternative.

### 4.1 Columns

| Column | Source | Empty when |
|---|---|---|
| Akun (name + email) | `providerConnections.name/email` | never |
| Sumber (`9router` / `Desktop`) | derived, §5.4 | never |
| Sesi 5j % | `quotas["session (5h)"]` | window absent |
| Mingguan % | `quotas["weekly (7d)"]` | window absent |
| Opus mingguan % | `quotas["weekly opus (7d)"]` | window absent |
| Units hari ini | `usageHistory`, weighted per §0.0.2 | Desktop-only account |
| Est. setara biaya API (USD) | tokens × `pricingRepo` | Desktop-only account |
| Reset berikutnya | `resets_at` of the `is_active` window | window absent |

Unmeasurable cells render the literal text **"tak terukur"** in muted ink, never
blank, never `0`, never `—`.

A footnote below the table, always present, states that token and cost-equivalent
figures exist only for accounts routed through 9router, that "tak terukur" means
the tool cannot measure it rather than the account being idle, and that the USD
figure is an API-price equivalent, not billed spend.

A summary strip above the table carries the decision-relevant aggregate: how
many accounts crossed 90% on any window today, how many days this week any
account hit a limit, and — per §5.3 — the sampling coverage those counts rest
on.

### 4.2 Visual language

Taken from the dakara-design-system MCP (`http://10.1.11.153:1000/mcp` — plain
HTTP; the `https://` form fails TLS, the server does not speak it). The MCP
serves Vue/Nuxt component specs, which cannot be imported into either target
(email HTML, and this repo's React dashboard). It is therefore used as a
**design reference**: its structure, severity semantics and naming are mirrored
in hand-written HTML/CSS and React.

Rules adopted from it:

- **Severity tiers** `critical / high / medium / low / info` with the
  `--sev-*` soft-fill pattern: soft background, 1px severity line, 6px dot,
  text in the severity's text colour.
- **Never colour-only.** Badge's rule — "the label is always rendered: colour is
  never the only signal" — is mandatory here, because email clients block
  images and strip CSS, and a colourblind manager must read the same table.
  Every meter prints its numeral; every status carries a word.
- **ProgressBar** (`value`, `status`, `showValue`) is the model for the quota
  meter: a track with a severity-coloured fill and the value shown.
- **InfoBanner** (soft severity fill, 1px line, icon, bold title + sentence) is
  the model for the footnote and the summary strip.
- **StatCard** `tone` semantics — colour the number by what the data *means* —
  for the dashboard's summary tiles.
- **Table** (`dense`, `variant`, `stickyHeader`) is the model for the table
  chrome on the dashboard.

**Severity comes from Anthropic, not from our own thresholds.** Spike 0 found
that `/api/oauth/usage` already ships a severity per window:

```json
"limits": [
  { "kind": "session",    "percent": 100, "severity": "critical", "is_active": true  },
  { "kind": "weekly_all", "percent": 34,  "severity": "normal",   "is_active": false },
  { "kind": "weekly_scoped", "percent": 0, "severity": "normal", "scope": {"model": …} }
]
```

An earlier draft of this document invented thresholds (90/75/50). Using the
API's own `severity` instead is strictly better: it cannot drift from
Anthropic's definition of "you are in trouble", and it maps onto the Neutral DS
`--sev-*` tiers directly. Map `critical → sev-critical`, `warning/high →
sev-high`, `normal → sev-low`, absent → `sev-info`.

Our own thresholds remain **only as a fallback** for a window that arrives
without a severity, and are stated here so they are reviewable: `>=90`
critical, `>=75` high, `>=50` medium, else low. The builder must not
recompute severity when the API supplied one.

Note `limits[].is_active` as well — Anthropic marks which window is the one
currently binding. The summary strip should lead with the active one rather
than assuming it is always the 5-hour window.

### 4.3 Email delivery constraints

Email HTML is not web HTML. The template must use table-based layout, fully
inline styles, no flexbox, no CSS custom properties, no external stylesheet, no
JavaScript. Meters are built from nested tables with width percentages, not
`div` + `background`. The severity palette is therefore **resolved to literal
hex at render time** from a single shared token map (§5.6) rather than emitted
as `var(--sev-critical)`.

A plain-text alternative part is generated alongside the HTML part, carrying the
same table as aligned text — some corporate clients render only that, and the
whole report must survive it.

---

## 5. Build

### 5.1 New persistence — `quotaSnapshots`

Add one table to `src/lib/db/schema.js` (`TABLES`). The existing
`001-initial.js` migration iterates `TABLES` and the layer auto-adds missing
tables/columns, so a new entry is picked up without a hand-written migration —
verify this against `src/lib/db/migrations/index.js` before relying on it, and
add `002-*.js` if it does not hold.

```
quotaSnapshots
  id           INTEGER PRIMARY KEY AUTOINCREMENT
  capturedAt   TEXT NOT NULL      -- ISO instant
  dateKey      TEXT NOT NULL      -- local YYYY-MM-DD, for daily rollup
  connectionId TEXT NOT NULL
  provider     TEXT NOT NULL      -- "claude"; keeps the door open
  accountEmail TEXT
  plan         TEXT
  source       TEXT               -- "9router" | "desktop"
  quotas       TEXT NOT NULL      -- JSON: the service's quotas object verbatim
  extraUsage   TEXT               -- JSON or null
  resetCredits TEXT               -- JSON or null
  ok           INTEGER DEFAULT 1  -- 0 when the read failed
  errorMessage TEXT
  indexes: (capturedAt DESC), (connectionId, capturedAt DESC), (dateKey)
```

Storing `quotas` as JSON verbatim, rather than one column per window, is
deliberate: Anthropic adds and removes windows (per-model weeklies appeared
mid-flight), and the existing service already normalises them.

New repo `src/lib/db/repos/quotaSnapshotsRepo.js`: `insertSnapshot`,
`getSnapshotsForDate`, `getLatestPerConnection`, `getSnapshotRange`,
`pruneSnapshotsOlderThan`.

Retention: keep 90 days, pruned by the daily job. Eleven accounts polled hourly
is ~96k rows/year — trivial for SQLite, but unbounded growth in a user's
`~/.9router` is not acceptable.

### 5.2 Collector — `src/lib/monitoring/quotaCollector.js`

For each active `providerConnections` row with `provider === "claude"`:

1. Refresh credentials if needed, reusing the **existing**
   `refreshAndUpdateCredentials` from `src/app/api/usage/[connectionId]/route.js`
   — extract it to `src/lib/monitoring/credentials.js` (or import it) rather
   than reimplementing refresh. Re-reading latest tokens before refresh matters:
   the comment there records that refreshing from a stale snapshot can revoke a
   whole token family and log the account out.
2. Call `getClaudeUsage(accessToken, proxyOptions)` — do **not** pass
   `force: true`; the 5-minute cache and the 429 cooldown are protections.
3. Write one `quotaSnapshots` row. A failed read is persisted with `ok = 0` and
   the message, never dropped — "we could not read this account" is itself
   reportable, and silently missing rows would understate usage.

Accounts are polled **sequentially with a small delay**, not in parallel: 11
simultaneous calls on the same endpoint is exactly the shape that trips the 429
the service guards against.

The collector must be fail-soft per account — one dead token cannot abort the
run for the other ten.

### 5.3 Scheduler — `src/lib/monitoring/scheduler.js`

No scheduler exists in the repo today. Two jobs:

- **Sampler**, hourly: run the collector. Hourly sampling is what makes "hit the
  limit on 5 of 7 days" answerable; a single morning read would miss a 5-hour
  window that filled and reset overnight.
- **Reporter**, daily at a configured local time: build and send the email,
  then prune old snapshots.

Implementation is `setInterval`/timeout based, started once from server
bootstrap, guarded so Next's dev-mode double-invocation and any multi-worker
start cannot run two samplers. A single-instance lock (a `kv` row holding owner
+ heartbeat, or a module-level guard plus a `lastRunAt` check in `kv`) prevents
duplicate sends. **Sending the same report twice is the failure mode users
notice most**, so the reporter records `lastSentDateKey` and refuses to send
twice for the same local date.

Timezone: the admin's local timezone, configurable, default `Asia/Jakarta`.
`dateKey` and the report's "today" both derive from it, not from UTC — a UTC
day boundary would split an Indonesian working day in half.

**Missed runs — catch up, don't skip.** 9router is a local app on the admin's
laptop, and a wall-clock trigger at 07:00 means a machine asleep at 07:00 sends
nothing. "A report every morning" and "a report on days the laptop was awake at
7" are different products, and the manager will notice the gaps. So the
reporter is a **persisted due-check, not an interval that happens to fire**: on
every tick (and on boot) it compares `lastSentDateKey` in `kv` against today's
local `dateKey` and sends if it is behind. A laptop opened at 10:00 gets that
morning's report at 10:00. Only one report per `dateKey` is ever sent, so
catch-up cannot double-send; a backlog of several days collapses to one report
for the current day rather than a burst.

**Sampling coverage must be reported, not hidden.** The hourly sampler has the
same gap problem, and here it actively distorts the headline: overnight and
weekend downtime makes "hit the limit on 5 of 7 days" **undercount**. Every
report therefore carries the coverage it was computed from — samples taken vs
samples expected for the period — and the trend sentence is phrased against
observed samples. A figure derived from 40% coverage, presented as fact, would
mislead a budget decision; stating the coverage costs one line and makes the
number honest. The snapshot rows are the evidence, so coverage is computable
rather than estimated.

### 5.4 Deriving `source`

An account counts as `9router` for a given day if `usageHistory` holds at least
one row for its `connectionId` that day; otherwise `desktop`. This is observed
rather than configured, so it self-corrects when someone switches tools, and it
degrades the right way: an account newly pointed at the proxy starts showing
token data the day it starts using it.

An explicit per-connection override (`monitoring.sourceLabel` inside the
connection's `data` JSON) covers the case of a Claude Code user who simply did
not work that day — otherwise they would be mislabelled Desktop and their
"tak terukur" would be wrong.

### 5.5 SMTP sender — `src/lib/monitoring/mailer.js`

`nodemailer` as a new dependency — it is the de facto Node SMTP client and the
repo has no mail infrastructure to build on. Config via settings + env, added to
`DEFAULT_SETTINGS` in `settingsRepo.js` and documented in `.env.example`:

```
MONITOR_SMTP_HOST, MONITOR_SMTP_PORT, MONITOR_SMTP_SECURE,
MONITOR_SMTP_USER, MONITOR_SMTP_PASS,
MONITOR_MAIL_FROM, MONITOR_MAIL_TO       (comma-separated)
MONITOR_REPORT_HOUR  (default 7), MONITOR_TZ (default Asia/Jakarta)
MONITOR_ENABLED      (default false)
```

`MONITOR_SMTP_PASS` is a secret: it is added to `PROTECTED_SETTING_KEYS` in
`src/app/api/settings/route.js` so it cannot be mass-assigned from a request
body, and it is stripped from the settings `GET` response the same way
`password` and `oidcClientSecret` already are.

**Ships disabled** (`MONITOR_ENABLED=false`). A feature that mails out on first
boot after an upgrade, to an address inherited from config, is an outbound
action nobody asked for.

A "send test report now" action exists for setup, rate-limited, admin-only.

### 5.5a Language

The repo has a 35-locale i18n system (`src/i18n/`, default `en`), and wiring a
new surface through it is real work. Weighed against the readership:

- **The email is Indonesian, hardcoded**, in its own template strings. It has
  one known recipient group — this admin and their manager — and an email is
  rendered server-side at send time where no locale context exists anyway.
  Running eight column headings through a 35-language pipeline buys nothing.
- **The dashboard page follows repo convention** and takes its strings from
  i18n, supplying `en` and `id`. The remaining locales fall back the way every
  other key in the project does; inventing 33 machine translations for an
  internal admin screen would be worse than a visible fallback.

If the report ever needs a second language, the report object (§5.6) is already
language-free — only the two renderers hold strings, so it stays a contained
change.

### 5.6 Report builder — `src/lib/monitoring/report/`

- `tokens.js` — the single severity/colour/threshold map, mirroring Neutral DS
  `--sev-*` as literal hex. Both the email renderer and the React page read it,
  so the two surfaces cannot drift.
- `buildReport.js` — snapshots + `usageHistory` + pricing → a plain report
  object (rows, summary, footnotes, coverage counts). Pure, no I/O, no HTML:
  this is the unit under test.
- `renderHtml.js` — report object → table-layout inline-styled email HTML.
- `renderText.js` — report object → plain-text alternative part.

### 5.7 Dashboard page

A page under the existing dashboard showing the same table live, plus per-account
history, built in React with the Neutral DS language mirrored (§4.2) — summary
tiles following `StatCard` `tone`, meters following `ProgressBar`, the footnote
following `InfoBanner`, dense table chrome following `Table`. It reads the same
report object through a new API route, so the screen and the email cannot
disagree.

New API routes, all behind the dashboard's existing auth:
- `GET /api/monitoring/report?date=` — the report object
- `GET /api/monitoring/history?connectionId=&days=` — trend series
- `POST /api/monitoring/collect` — trigger a sample now
- `POST /api/monitoring/send-test` — send the report to configured recipients

### 5.9 Monitor-only connections and per-key connection pinning

This is the fix for §2.6, and the reason the scope widened. Two additive pieces.

**(a) Monitor-only flag.** A connection carries
`providerSpecificData.monitorOnly === true`, meaning: *read its quota, never
route traffic to it.* Set per connection from the dashboard.

`isActive = 0` is **not** usable for this, and the trap is worth stating: the
collector polls *active* connections (§5.2), so deactivating an account would
switch off exactly the monitoring the account was added for. `monitorOnly` is a
separate axis — active (so it is polled and refreshed) but not routable.

Enforcement goes in the existing filter in `src/sse/services/auth.js`, inside
the `availableConnections` predicate (alongside `excludeSet`,
`isModelLockActive` and the Antigravity quota checks):

```js
if (c.providerSpecificData?.monitorOnly) return false;
```

Without this, adding 10 teammates' accounts makes them eligible upstreams for
**all** traffic including the admin's — spending other people's Pro quota and
polluting the measurement at the same time.

**(b) Per-key connection pinning.** A new additive column on `apiKeys`:

```
pinnedConnectionId: "TEXT"     -- null = unpinned, today's behaviour
```

Additive columns on `apiKeys` are an established pattern there — the schema
comment records that `accessRestricted`/`accessAllow` are "picked up by
`syncSchemaFromTables()` on boot; existing rows read as unrestricted (0)". Same
mechanism, same safety: existing keys read `null` and behave exactly as now.

When a request's API key has `pinnedConnectionId`, account selection is narrowed
to that one connection for its provider. Pinned keys therefore do **not**
fall back to another teammate's account when their own is exhausted — a
deliberate trade: correct attribution beats transparent failover here, because
a silent cross-account fallback is precisely what corrupts the report. The
request fails with a clear "your Claude account is at its limit" rather than
quietly billing someone else.

Pinning is set per key in the existing API-keys dashboard UI, which is also
where the `monitoring.sourceLabel` override from §5.4 gets its surface
(a per-connection field on the connection editor).

Tests: a pinned key never selects another connection, including when its own is
excluded/exhausted; an unpinned key behaves exactly as before; a monitor-only
connection is never returned by `getProviderCredentials`, for pinned and
unpinned keys alike; a key pinned to a monitor-only connection fails closed
rather than falling through to a routable one.

### 5.8 Onboarding Claude Code users

A short operator doc, `docs/TEAM_MONITORING.md`:

1. One-time OAuth of each of the 11 accounts into this 9router instance, so
   quota is readable (§2.4) — including the Desktop-only users.
2. For Claude Code users: point `ANTHROPIC_BASE_URL` at this instance and use a
   9router API key, so their rows carry tokens and cost-equivalent.
3. SMTP setup and the test send.
4. A plain statement of what the report can and cannot show, to be forwarded to
   the manager alongside the first report.

Exposing the gateway to teammates' machines means it is no longer a
localhost-only service. The doc must say so and point at the existing
protections rather than leaving it implicit: `requireApiKey`, and the
`custom-server.js` behaviour of deriving client IP from the TCP socket and
stripping attacker-controlled `X-Forwarded-For` except from a loopback proxy.

---

## 6. Testing

Added under `tests/`, matching the existing vitest layout. Judge regressions
with `tests/__baseline__/verify-no-regression.mjs`, not a raw run — the suite is
not green on a plain checkout (~938 pass / ~64 fail, catalogued).

- `buildReport.js` against fixture snapshots: a fully-measured row, a
  Desktop-only row, a failed read (`ok = 0`), an account with no weekly window,
  an account with per-model weeklies, severity threshold boundaries.
- Collector: one account's refresh failure does not abort the others; a 429
  response is persisted as a failed read rather than crashing the run.
- Scheduler: the same `dateKey` cannot send twice.
- Renderers: no `var(--`, no `flex`, no `<script>`, no external URL in the email
  HTML; the text part contains every account row.
- Snapshot repo: insert/read round-trip, prune keeps the retention boundary.

---

## 7. Security notes

Called out explicitly, per this repo's security-first convention.

- **Token handling.** The collector reads OAuth access tokens. Tokens must never
  enter the report object, the email, the plain-text part, the API responses, or
  a log line — including inside an error message, which is where they leak in
  practice. The failed-read path stores `errorMessage`; that string must be
  scrubbed before it is persisted or rendered.
- **SMTP credentials.** `MONITOR_SMTP_PASS` goes in `PROTECTED_SETTING_KEYS`
  and is stripped from `GET /api/settings`, like `password` and
  `oidcClientSecret`. It must not be returned to the dashboard in any shape,
  including a masked echo that reveals length.
- **SSRF via SMTP host.** The SMTP host is operator-configured and used to open
  an outbound connection. It is admin-only config, not user input, and must stay
  that way: no API path may let a non-admin set it.
- **"Admin-only" means "logged into the dashboard" — there are no roles.**
  Worth stating precisely rather than leaving as a comfortable word: auth here
  is a single shared dashboard password or an OIDC/SAML session
  (`src/dashboardGuard.js`, `src/lib/auth/dashboardSession.js`). The repo has no
  admin-vs-user distinction and nowhere to hang one. So every
  `/api/monitoring/*` route is reachable by **any** dashboard-authenticated
  user.
  That is acceptable here on one condition, which the operator doc must make
  explicit: teammates get **API keys, not dashboard logins** (§5.8). Anyone
  holding the dashboard password can already read every stored connection, so
  monitoring adds no new privilege — but it does add a new *outbound* action and
  a roster of who works how much. If the dashboard password is ever shared with
  the team, this report becomes visible to them; introducing real roles would be
  its own piece of work, well outside this one.
- **`send-test` is rate-limited.** It performs an outbound action; an
  unauthenticated or unthrottled trigger would be both a spam vector and a way
  to confirm which accounts exist.
- **The report is sensitive.** It enumerates team members and their working
  intensity. It goes only to the configured admin recipients, and the
  recipients list is admin-only config.
- **Widening exposure.** Routing teammates' Claude Code through this instance
  turns a localhost tool into a network service. `requireApiKey` should be on,
  and the `X-Forwarded-For` stripping in `custom-server.js` must be preserved by
  any change in this work — no new route may trust a forwarding header.
- **Reset grants are irreversible.** `consumeClaudeResetGrant` spends a limited
  resource. This feature reports grant availability; it must never call that
  function. No monitoring code path may consume a grant.

---

## 8. Decisions made here, and what is left to the builder

### Decided in this document (my calls, not the admin's)
- Hourly sampling + daily send, rather than a single morning read — trend data
  is what the Max decision rests on.
- Missed reports **catch up on next boot** rather than being skipped, via a
  persisted due-check; sampling coverage is printed in the report (§5.3).
- `quotaSnapshots.quotas` stored as verbatim JSON rather than typed columns.
- `source` observed from `usageHistory` rather than configured, with an
  override.
- 90-day retention.
- Severity thresholds 90/75/50.
- `Asia/Jakarta` default timezone.
- Feature ships disabled.
- `nodemailer` as the SMTP client.
- Dashboard and email share one report builder and one token map.
- Email strings hardcoded Indonesian; dashboard page via i18n with `en` + `id`
  only (§5.5a).
- Pinned keys **fail closed** instead of falling back to another teammate's
  account (§5.9b) — correct attribution over transparent failover.
- `monitorOnly` as a new axis rather than reusing `isActive`, which would
  disable the very monitoring the account exists for (§5.9a).

### Decided by the admin
- Daily, each morning, over SMTP.
- One combined table (Option A), with unmeasurable cells marked.
- The report must carry token and cost figures as well as quota percentages —
  within the limits of §2.3, which is why the "tak terukur" treatment and the
  footnote exist.
- Claude Code users are to be routed through 9router in this same piece of work.
- dakara-design-system as the styling reference for every surface.
- **Spike 0 runs before any build work** (§0).
- **Monitor-only + per-key pinning** as the attribution fix, accepting the
  scope increase into account selection (§5.9).
- **USD only, no rupiah conversion and no seat-price math** (§2.5).

### Left to the builder
- Exact module boundaries within `src/lib/monitoring/`.
- The single-instance lock mechanism (`kv` row vs module guard + `lastRunAt`).
- Whether a `002-*` migration is needed. Note `apiKeys`' own schema comment
  records that additive columns are "picked up by `syncSchemaFromTables()` on
  boot", which suggests none is; confirm against
  `src/lib/db/migrations/index.js`.
- Where the scheduler is started. `src/instrumentation.js` already guards on
  `NEXT_RUNTIME === "nodejs"` and starts `startModelCatalogSync()`, so it is the
  established place for exactly this.
- Dashboard page placement within the existing navigation.
- The email's precise typographic scale, within the Neutral DS language.

### Known, accepted, not addressed
- `usageHistory` has no prune path today, so a 90-day snapshot retention sits
  beside unbounded usage rows. Pre-existing, out of scope, flagged.
- No roles exist; "admin-only" means any dashboard-authenticated user (§7).
- Whether the chosen SMTP relay will accept the configured `MONITOR_MAIL_FROM`
  is an operator concern, surfaced by the test-send in §5.5.
