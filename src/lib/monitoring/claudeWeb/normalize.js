// Turns claude.ai's analytics payloads into the shapes the dashboard and the
// email render from.
//
// Pure: no I/O, so the decisions worth testing live here rather than inside a
// component (this repo's vitest has no JSX transform).
//
// These numbers describe WEB AND DESKTOP use — the people who never touch the
// gateway. They are the other half of the picture from the proxy rows.

// Money comes back as a decimal STRING ("1548.8103718999996"). Parsed late and
// never accumulated as a float beyond display, because the figure in the
// report is read by a manager deciding on a plan.
const num = (v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Org-level totals, with the keys the UI uses. */
export function normalizeOverview(payload) {
  const s = payload?.summary || {};
  return {
    activeUsers: num(s.active_users) ?? 0,
    totalSessions: num(s.total_sessions) ?? 0,
    totalCostUsd: num(s.total_cost_usd) ?? 0,
    linesAccepted: num(s.total_lines_accepted) ?? 0,
    commits: num(s.commits_created) ?? 0,
    pullRequests: num(s.pull_requests_created) ?? 0,
    // A rate, 0..1. Null when the API omits it: a fabricated 100% would read
    // as "the team accepts everything Claude proposes".
    toolAcceptRate: num(s.tool_accept_rate),
    period: payload?.period || null,
  };
}

/**
 * The daily series, merged into one row per date.
 *
 * The API returns three parallel series — activity, spend, lines_of_code —
 * each carrying only its own metric and null elsewhere. Charting them
 * separately would show three timelines of the same days; merging gives one
 * row a reader can scan across.
 */
export function normalizeSeries(payload) {
  const ts = payload?.time_series || {};
  const byDate = new Map();

  const take = (rows, key, field) => {
    for (const r of rows || []) {
      const date = r?.date;
      if (!date) continue;
      const row = byDate.get(date) || { date, users: null, sessions: null, costUsd: null, lines: null };
      const v = num(r[field]);
      if (v !== null) row[key] = v;
      // users_active is present on every series; take it wherever it appears.
      const u = num(r.users_active);
      if (u !== null && row.users === null) row.users = u;
      byDate.set(date, row);
    }
  };

  take(ts.activity, "sessions", "sessions_count");
  take(ts.spend, "costUsd", "total_cost_usd");
  take(ts.lines_of_code, "lines", "lines_of_code");
  take(ts.activity, "lines", "lines_of_code");

  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/**
 * Per-person rows, costliest first.
 *
 * Sorted by spend because the question this answers is "who is driving the
 * bill", and a list in API order makes the reader do that sort by eye.
 */
export function normalizeUsers(users = []) {
  return users
    .map((u) => ({
      email: u?.email || null,
      displayName: u?.display_name || null,
      status: u?.status || null,
      totalCostUsd: num(u?.total_cost) ?? 0,
      avgCostPerDayUsd: num(u?.avg_cost_per_day) ?? 0,
      sessions: num(u?.total_sessions) ?? 0,
      linesAccepted: num(u?.total_lines_accepted) ?? 0,
      avgLinesPerDay: num(u?.avg_lines_accepted_per_day) ?? 0,
      lastActive: u?.last_active || null,
      prs: num(u?.total_prs) ?? 0,
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

/**
 * A date range for the current month, in the report's timezone.
 *
 * Month-to-date rather than a rolling window: this figure is read next to a
 * monthly seat bill, and a 30-day window straddling two months would not line
 * up with it.
 *
 * @param {string} dateKey YYYY-MM-DD, the report's local date
 */
export function monthRangeFor(dateKey) {
  const key = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || "")) ? dateKey : null;
  if (!key) {
    const t = new Date().toISOString().slice(0, 10);
    return { startDate: `${t.slice(0, 7)}-01`, endDate: t };
  }
  return { startDate: `${key.slice(0, 7)}-01`, endDate: key };
}
