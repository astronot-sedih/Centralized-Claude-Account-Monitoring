import { describe, expect, it } from "vitest";
import {
  claudeWebSettingsFromEnv,
  metricsQuery,
  fetchTeamAnalytics,
} from "../../src/lib/monitoring/claudeWeb/client.js";
import {
  normalizeOverview,
  normalizeSeries,
  normalizeUsers,
  monthRangeFor,
} from "../../src/lib/monitoring/claudeWeb/normalize.js";

// Shapes copied from a real probe of this organization's analytics endpoints.
const OVERVIEW = {
  period: { start_date: "2026-10-01", end_date: "2026-10-31", granularity: "daily" },
  summary: {
    total_lines_accepted: 90767,
    tool_accept_rate: 0.999290780141844,
    commits_created: 336,
    pull_requests_created: 55,
    active_users: 5,
    total_sessions: 199,
    total_cost_usd: "1548.8103718999996",
  },
  time_series: {
    activity: [
      { date: "2026-10-28", users_active: 2, sessions_count: 9, total_cost_usd: null, lines_of_code: 1200 },
      { date: "2026-10-29", users_active: 3, sessions_count: 16, total_cost_usd: null, lines_of_code: 4352 },
    ],
    spend: [
      { date: "2026-10-29", users_active: 3, sessions_count: null, total_cost_usd: "109.1274632", lines_of_code: null },
    ],
    lines_of_code: [
      { date: "2026-10-29", users_active: 3, sessions_count: null, total_cost_usd: null, lines_of_code: 4352 },
    ],
    pr_boost: [],
  },
};

describe("claudeWebSettingsFromEnv", () => {
  it("accepts a whole pasted Cookie header", () => {
    // DevTools hands you the header; asking for one cookie out of it is how
    // people end up pasting a truncated value.
    const s = claudeWebSettingsFromEnv({
      CLAUDE_WEB_ORG_ID: "org-1",
      CLAUDE_WEB_SESSION_KEY: "a=1; sessionKey=sk-ant-sid01-x; cf_clearance=y",
    });
    expect(s.cookie).toBe("a=1; sessionKey=sk-ant-sid01-x; cf_clearance=y");
    expect(s.configured).toBe(true);
  });

  it("wraps a bare session key into a cookie", () => {
    const s = claudeWebSettingsFromEnv({ CLAUDE_WEB_ORG_ID: "org-1", CLAUDE_WEB_SESSION_KEY: "abc" });
    expect(s.cookie).toBe("sessionKey=abc");
  });

  it("is unconfigured when either half is missing", () => {
    expect(claudeWebSettingsFromEnv({ CLAUDE_WEB_ORG_ID: "org-1" }).configured).toBe(false);
    expect(claudeWebSettingsFromEnv({ CLAUDE_WEB_SESSION_KEY: "abc" }).configured).toBe(false);
    expect(claudeWebSettingsFromEnv({}).configured).toBe(false);
  });
});

describe("fetchTeamAnalytics", () => {
  const opts = { orgId: "o", cookie: "sessionKey=x", startDate: "2026-10-01", endDate: "2026-10-31" };

  it("fails open on an expired session instead of throwing", async () => {
    // A dead cookie must cost this one section, never the whole daily report
    // that the rest of the team's numbers live in.
    const r = await fetchTeamAnalytics({
      ...opts,
      configured: true,
      fetchImpl: async () => ({ ok: false, status: 401 }),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/kedaluwarsa/);
    expect(r.overview).toBe(null);
    expect(r.users).toEqual([]);
  });

  it("never lets the cookie reach the error string", async () => {
    const r = await fetchTeamAnalytics({
      ...opts,
      cookie: "sessionKey=sk-ant-sid01-" + "A".repeat(80),
      configured: true,
      fetchImpl: async () => { throw new Error("connect failed for sk-ant-sid01-" + "A".repeat(80)); },
    });
    expect(r.error).not.toMatch(/sk-ant-sid01-A/);
    expect(r.error).toMatch(/redacted/);
  });

  it("reports partial success rather than discarding what did load", async () => {
    const r = await fetchTeamAnalytics({
      ...opts,
      configured: true,
      fetchImpl: async (url) =>
        url.includes("/overview")
          ? { ok: true, json: async () => OVERVIEW }
          : { ok: false, status: 500 },
    });
    expect(r.ok).toBe(true);
    expect(r.overview).toBeTruthy();
    expect(r.error).toMatch(/500/);
  });

  it("says so when the credentials are absent, without calling out", async () => {
    let called = false;
    const r = await fetchTeamAnalytics({
      ...opts,
      configured: false,
      fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
    });
    expect(called).toBe(false);
    expect(r.error).toMatch(/belum diisi/);
  });
});

describe("metricsQuery", () => {
  it("carries the team customer/subscription pair the endpoint requires", () => {
    const q = metricsQuery({ orgId: "o", startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(q).toContain("customer_type=claude_ai");
    expect(q).toContain("subscription_type=team");
    expect(q).toContain("granularity=daily");
  });
});

describe("normalizeOverview", () => {
  it("parses the decimal-string cost", () => {
    const o = normalizeOverview(OVERVIEW);
    expect(o.totalCostUsd).toBeCloseTo(1548.81037, 4);
    expect(o.activeUsers).toBe(5);
    expect(o.commits).toBe(336);
  });

  it("leaves an absent accept rate null rather than inventing 100%", () => {
    // A fabricated 1.0 would read as "the team accepts everything Claude
    // proposes" — a claim the data did not make.
    const o = normalizeOverview({ summary: { active_users: 1 } });
    expect(o.toolAcceptRate).toBe(null);
  });

  it("survives an empty payload", () => {
    expect(normalizeOverview(null).totalCostUsd).toBe(0);
  });
});

describe("normalizeSeries", () => {
  it("merges the three parallel series into one row per date", () => {
    // The API returns activity, spend and lines as separate series, each null
    // outside its own metric. Three timelines of the same days is not a chart.
    const rows = normalizeSeries(OVERVIEW);
    expect(rows.map((r) => r.date)).toEqual(["2026-10-28", "2026-10-29"]);
    const last = rows[1];
    expect(last.sessions).toBe(16);
    expect(last.costUsd).toBeCloseTo(109.12746, 4);
    expect(last.lines).toBe(4352);
    expect(last.users).toBe(3);
  });

  it("returns an empty list when there is no series", () => {
    expect(normalizeSeries({ time_series: {} })).toEqual([]);
  });
});

describe("normalizeUsers", () => {
  it("sorts costliest first — the question is who drives the bill", () => {
    const rows = normalizeUsers([
      { email: "b@x.io", total_cost: "10.5", avg_cost_per_day: "1.0" },
      { email: "a@x.io", total_cost: "99.0", avg_cost_per_day: "9.0" },
    ]);
    expect(rows.map((r) => r.email)).toEqual(["a@x.io", "b@x.io"]);
    expect(rows[0].totalCostUsd).toBeCloseTo(99, 5);
  });

  it("tolerates a row with nothing but an email", () => {
    const [r] = normalizeUsers([{ email: "a@x.io" }]);
    expect(r.totalCostUsd).toBe(0);
    expect(r.sessions).toBe(0);
  });
});

describe("monthRangeFor", () => {
  it("runs month-to-date, to line up with a monthly seat bill", () => {
    expect(monthRangeFor("2026-10-29")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-29" });
  });

  it("falls back to today for a malformed date", () => {
    const r = monthRangeFor("rubbish");
    expect(r.startDate).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
