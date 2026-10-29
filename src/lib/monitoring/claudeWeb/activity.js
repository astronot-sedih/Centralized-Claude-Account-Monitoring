// Organization-wide activity from claude.ai — the /analytics/activity family.
//
// This is a WIDER lens than the Claude Code metrics in client.js. Those cover
// only the people who run Claude Code; these cover EVERY member, including
// the ones whose whole relationship with Claude is chatting in the browser or
// in Desktop. On this team that is the difference between 5 people and 9.
//
// Same rules as client.js: undocumented endpoints, admin session cookie,
// fail-open on every call, and nothing credential-shaped may escape.

import { scrubSecrets } from "../scrub.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const base = (orgId) => `https://claude.ai/api/organizations/${orgId}/analytics`;

/**
 * One call, failure folded into the result.
 * @returns {Promise<{ok: boolean, data: any, error: string|null}>}
 */
async function get(url, { cookie, fetchImpl = fetch }) {
  try {
    const res = await fetchImpl(url, {
      headers: {
        cookie,
        accept: "application/json",
        "user-agent": UA,
        referer: "https://claude.ai/analytics/overview",
      },
    });
    if (!res.ok) {
      const reason =
        res.status === 401 || res.status === 403
          ? "sesi claude.ai kedaluwarsa atau bukan admin — perbarui CLAUDE_WEB_SESSION_KEY"
          : `HTTP ${res.status}`;
      return { ok: false, data: null, error: reason };
    }
    return { ok: true, data: await res.json(), error: null };
  } catch (e) {
    return { ok: false, data: null, error: scrubSecrets(e?.message || String(e)) };
  }
}

/** Org adoption: DAU/WAU/MAU, seat utilization, stickiness. */
export function fetchActivityOverview({ orgId, ...rest }) {
  return get(`${base(orgId)}/activity/overview`, rest);
}

/** Cowork-specific rates. */
export function fetchCoworkOverview({ orgId, ...rest }) {
  return get(`${base(orgId)}/activity/cowork_overview`, rest);
}

/**
 * Per-member activity across every product.
 *
 * Sorted by messages rather than the UI's default (cowork sessions): the
 * report's question is who uses Claude at all, and the heaviest chat user can
 * have zero Cowork sessions.
 *
 * The sort key is the API's own vocabulary ("messages"), not the member
 * field name ("message_count"), which it rejects with a 400.
 */
export function fetchActivityUsers({ orgId, startDate, pageSize = 100, sort = "messages", ...rest }) {
  const p = new URLSearchParams({
    page: "1",
    page_size: String(pageSize),
    sort,
    order: "desc",
    start_date: startDate,
  });
  return get(`${base(orgId)}/activity/users?${p}`, rest);
}

/**
 * A daily series for one metric.
 * @param {"dau"|"wau"|"mau"} metric
 * @param {string|null} productFilter e.g. "cowork", "claude-design"
 */
export function fetchActivityTimeseries({ orgId, metric = "dau", days = 30, productFilter = null, ...rest }) {
  const p = new URLSearchParams({ metric, days: String(days) });
  if (productFilter) p.set("product_filter", productFilter);
  return get(`${base(orgId)}/activity/timeseries?${p}`, rest);
}

/** What kinds of file Cowork touched. */
export function fetchCoworkFileCategories({ orgId, startDate, ...rest }) {
  const p = new URLSearchParams({ start_date: startDate });
  return get(`${base(orgId)}/cowork/file-categories?${p}`, rest);
}

/**
 * Every activity endpoint for one range, in parallel.
 *
 * Partial success is reported rather than discarded: knowing the team is 90%
 * utilized is worth showing even when the per-member call failed.
 */
export async function fetchActivity(opts) {
  if (opts?.configured === false) {
    return {
      ok: false,
      configured: false,
      error: "CLAUDE_WEB_ORG_ID / CLAUDE_WEB_SESSION_KEY belum diisi",
      overview: null, cowork: null, members: [], series: [], fileCategories: [],
    };
  }

  const [overview, cowork, users, series, files] = await Promise.all([
    fetchActivityOverview(opts),
    fetchCoworkOverview(opts),
    fetchActivityUsers(opts),
    fetchActivityTimeseries({ ...opts, metric: "dau", days: 30 }),
    fetchCoworkFileCategories(opts),
  ]);

  const errors = [overview, cowork, users, series, files]
    .map((r) => r.error)
    .filter(Boolean);
  // One dead cookie produces the same message five times; say it once.
  const unique = [...new Set(errors)];

  return {
    ok: [overview, cowork, users, series, files].some((r) => r.ok),
    configured: true,
    error: unique.length ? unique.join(" · ") : null,
    overview: overview.data || null,
    cowork: cowork.data || null,
    members: users.data?.members || [],
    memberTotal: users.data?.total ?? null,
    medianSpendUsd: users.data?.median_spend_us_dollars ?? null,
    dataAsOf: overview.data?.data_as_of || users.data?.data_as_of || null,
    series: series.data?.data_points || [],
    fileCategories: files.data?.categories || [],
    fileOperationTotal: files.data?.total_file_operation_count ?? null,
  };
}
