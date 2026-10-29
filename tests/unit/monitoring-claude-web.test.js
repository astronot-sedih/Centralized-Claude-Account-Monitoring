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

// ── Organization activity (the /analytics/activity family) ──────────────────

import { fetchActivity } from "../../src/lib/monitoring/claudeWeb/activity.js";
import {
  normalizeActivityOverview,
  normalizeCoworkOverview,
  normalizeMembers,
  normalizeTimeseries,
  normalizeFileCategories,
} from "../../src/lib/monitoring/claudeWeb/normalize.js";

// Shapes copied from a real probe of this organization.
const ACTIVITY = {
  wau: { value: 9, change_percent: 12.5 },
  dau: { value: 8, change_percent: 0 },
  mau: { value: 9, change_percent: 0 },
  utilization: { value: 90, change_percent: null },
  pending_invites: { value: 0, change_percent: null },
  stickiness: 88.89,
  total_members: 10,
  target_date: "2026-10-28",
  data_as_of: "2026-10-27",
};

describe("normalizeActivityOverview", () => {
  it("flattens the value/change pairs", () => {
    const o = normalizeActivityOverview(ACTIVITY);
    expect(o.wau.value).toBe(9);
    expect(o.wau.changePercent).toBeCloseTo(12.5, 3);
    expect(o.totalMembers).toBe(10);
    expect(o.utilization.value).toBe(90);
  });

  it("keeps a missing change null rather than calling it unchanged", () => {
    // "no comparison available" and "flat" are different claims; 0 asserts
    // the second.
    const o = normalizeActivityOverview(ACTIVITY);
    expect(o.utilization.changePercent).toBe(null);
    expect(o.dau.changePercent).toBe(0);
  });

  it("returns null for an absent payload", () => {
    expect(normalizeActivityOverview(null)).toBe(null);
  });
});

describe("normalizeMembers", () => {
  const raw = [
    { email: "chat@x.io", message_count: 268, chat_count: 29, cowork_session_count: 41, code_session_count: 0, days_active: 25 },
    { email: "code@x.io", message_count: 0, chat_count: 0, cowork_session_count: 13, code_session_count: 33, days_active: 28 },
  ];

  it("ranks by total engagement, not by one product", () => {
    // Someone with 268 chat messages and no Claude Code sessions is a heavy
    // user; ranking by Claude Code alone would bury them.
    const rows = normalizeMembers(raw);
    expect(rows[0].email).toBe("chat@x.io");
    expect(rows[0].engagement).toBe(268 + 41 + 0);
  });

  it("includes members with no Claude Code activity at all", () => {
    // These are precisely the people the proxy and the Claude Code metrics
    // cannot see — leaving them out is what this whole section exists to fix.
    const rows = normalizeMembers(raw);
    expect(rows.find((r) => r.email === "chat@x.io").codeSessions).toBe(0);
    expect(rows).toHaveLength(2);
  });

  it("tolerates a row with nothing but an email", () => {
    const [r] = normalizeMembers([{ email: "a@x.io" }]);
    expect(r.chatMessages).toBe(0);
    expect(r.engagement).toBe(0);
  });
});

describe("normalizeTimeseries and file categories", () => {
  it("sorts points oldest first and drops undated ones", () => {
    const rows = normalizeTimeseries([
      { date: "2026-10-27", value: 8 },
      { value: 3 },
      { date: "2026-10-25", value: 3 },
    ]);
    expect(rows.map((r) => r.date)).toEqual(["2026-10-25", "2026-10-27"]);
  });

  it("sorts file categories largest first", () => {
    const rows = normalizeFileCategories([
      { category: "Code & scripts", file_operation_count: 2200, share: 0.326 },
      { category: "Documents & reports", file_operation_count: 2224, share: 0.3296 },
    ]);
    expect(rows[0].category).toBe("Documents & reports");
  });
});

describe("normalizeCoworkOverview", () => {
  it("flattens the rate pairs", () => {
    const c = normalizeCoworkOverview({
      sessions_per_day: { value: 6, change_percent: 0 },
      file_operations_per_day: { value: 56, change_percent: -6.67 },
      file_edits_per_day: { value: 0, change_percent: -100 },
      users_with_sessions_percent: { value: 50, change_percent: 25 },
    });
    expect(c.sessionsPerDay.value).toBe(6);
    expect(c.fileOperationsPerDay.changePercent).toBeCloseTo(-6.67, 2);
  });
});

describe("fetchActivity", () => {
  const opts = { orgId: "o", cookie: "sessionKey=x", startDate: "2026-10-01", configured: true };

  it("reports one dead-cookie message, not one per endpoint", async () => {
    // Five parallel calls against an expired session produce five identical
    // errors; repeating them in the banner is noise, not information.
    const r = await fetchActivity({ ...opts, fetchImpl: async () => ({ ok: false, status: 401 }) });
    expect(r.ok).toBe(false);
    expect(r.error.match(/kedaluwarsa/g)).toHaveLength(1);
  });

  it("keeps what loaded when only some endpoints fail", async () => {
    const r = await fetchActivity({
      ...opts,
      fetchImpl: async (url) =>
        url.includes("/activity/overview")
          ? { ok: true, json: async () => ACTIVITY }
          : { ok: false, status: 500 },
    });
    expect(r.ok).toBe(true);
    expect(r.overview).toBeTruthy();
    expect(r.members).toEqual([]);
  });

  it("does not call out when the credentials are absent", async () => {
    let called = false;
    const r = await fetchActivity({
      ...opts,
      configured: false,
      fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
    });
    expect(called).toBe(false);
    expect(r.error).toMatch(/belum diisi/);
  });

  it("never lets the cookie reach the error string", async () => {
    const r = await fetchActivity({
      ...opts,
      cookie: "sessionKey=sk-ant-sid01-" + "Q".repeat(80),
      fetchImpl: async () => { throw new Error("boom sk-ant-sid01-" + "Q".repeat(80)); },
    });
    expect(r.error).not.toMatch(/sk-ant-sid01-Q/);
    expect(r.error).toMatch(/redacted/);
  });
});

describe("fetchActivityUsers sort key", () => {
  it("uses the API's sort vocabulary, not the member field name", async () => {
    // "message_count" is the field on each member; the endpoint's sort key is
    // "messages" and it answers 400 to the other.
    const { fetchActivityUsers } = await import("../../src/lib/monitoring/claudeWeb/activity.js");
    let seen = "";
    await fetchActivityUsers({
      orgId: "o",
      cookie: "sessionKey=x",
      startDate: "2026-10-01",
      fetchImpl: async (url) => { seen = url; return { ok: true, json: async () => ({}) }; },
    });
    expect(seen).toContain("sort=messages");
    expect(seen).not.toContain("message_count");
  });
});

describe("adoption table identifies members by email", () => {
  it("renders the email, not the display name", async () => {
    // Display names are whatever each person set on their own account —
    // several are a first name or two letters, which does not identify anyone
    // in a report the whole team reads.
    const { renderReportText } = await import("../../src/lib/monitoring/report/renderText.js");
    const out = renderReportText({
      dateKey: "2026-10-29", rows: [], summary: {}, coverage: {},
      claudeWeb: {
        activity: {
          overview: {
            utilization: { value: 90 }, dau: { value: 8 }, wau: { value: 9 },
            mau: { value: 9 }, totalMembers: 10,
          },
          members: [{ name: "pc", email: "putri@dakaradaksadira.co.id", chats: 27, chatMessages: 261 }],
          dataAsOf: "2026-10-27",
        },
      },
    });
    expect(out).toMatch(/putri@dakaradaksadira\.co\.id/);
    expect(out).not.toMatch(/\bpc\b/);
  });
});

describe("charts in the report", () => {
  const withSeries = {
    dateKey: "2026-10-29", rows: [], summary: {}, coverage: {},
    claudeWeb: {
      range: { startDate: "2026-10-01", endDate: "2026-10-29" },
      summary: { totalCostUsd: 109, activeUsers: 3, totalSessions: 16, linesAccepted: 4352 },
      users: [{ email: "a@x.io", totalCostUsd: 99, avgCostPerDayUsd: 4, sessions: 12 }],
      series: [
        { date: "2026-10-27", costUsd: 50 },
        { date: "2026-10-28", costUsd: 0 },
        { date: "2026-10-29", costUsd: 109 },
      ],
      activity: {
        overview: { utilization: { value: 90 }, dau: { value: 8 }, wau: { value: 9 }, mau: { value: 9 }, totalMembers: 10 },
        members: [{ email: "a@x.io", chats: 1, chatMessages: 2, coworkSessions: 3, codeSessions: 4, daysActive: 5 }],
        series: [
          { date: "2026-10-27", value: 8 },
          { date: "2026-10-28", value: 3 },
        ],
      },
    },
  };

  it("draws both charts in the plain-text part", async () => {
    const { renderReportText } = await import("../../src/lib/monitoring/report/renderText.js");
    const out = renderReportText(withSeries);
    expect(out).toMatch(/Pengguna aktif harian/);
    expect(out).toMatch(/Biaya harian/);
    expect(out).toMatch(/#/);
  });

  it("reads the cost series by its own key, not a flat zero line", async () => {
    // The two series name their value differently (`value` vs `costUsd`). A
    // chart that knows only one draws an empty axis for the other, which
    // reads as "nobody spent anything" rather than as a bug.
    const { renderReportText } = await import("../../src/lib/monitoring/report/renderText.js");
    const out = renderReportText(withSeries);
    const block = out.slice(out.indexOf("Biaya harian"));
    expect(block).toMatch(/puncak \$109\.00/);
    expect(block).toMatch(/2026-10-29\s+#+\s+\$109\.00/);
  });

  it("prints a zero day as a row with no bar, not as a gap", async () => {
    // A missing row reads as missing data; an empty bar reads as a quiet day.
    const { renderReportText } = await import("../../src/lib/monitoring/report/renderText.js");
    const out = renderReportText(withSeries);
    expect(out).toMatch(/2026-10-28\s+\$0\.00/);
  });

  it("keeps the plain-text part free of HTML", async () => {
    const { renderReportText } = await import("../../src/lib/monitoring/report/renderText.js");
    expect(renderReportText(withSeries)).not.toMatch(/<[a-z/][^>]*>/i);
  });

  it("builds the HTML chart from table cells, not script or remote images", async () => {
    // Mail clients run no JavaScript and most block remote images, so either
    // would reach the reader as a blank rectangle.
    const { renderReportHtml } = await import("../../src/lib/monitoring/report/renderHtml.js");
    const html = renderReportHtml(withSeries);
    expect(html).toMatch(/Pengguna aktif harian/);
    expect(html).toMatch(/Biaya harian/);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img[^>]+src=["']https?:/i);
    expect(html).not.toMatch(/<canvas/i);
  });

  it("omits a chart entirely when its series is empty", async () => {
    // An axis with no bars invites the reader to conclude the value was zero.
    const { renderReportHtml } = await import("../../src/lib/monitoring/report/renderHtml.js");
    const html = renderReportHtml({
      ...withSeries,
      claudeWeb: { ...withSeries.claudeWeb, series: [] },
    });
    expect(html).not.toMatch(/Biaya harian/);
    expect(html).toMatch(/Pengguna aktif harian/);
  });
});
