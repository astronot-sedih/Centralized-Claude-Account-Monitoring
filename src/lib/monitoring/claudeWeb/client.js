// Reads team analytics straight from claude.ai, using an admin session cookie.
//
// WHY THIS EXISTS, and what it is for:
//
// Everything else in this product measures traffic that passes through the
// gateway. Most of the team does not use the gateway — they chat in the web
// app and in Claude Desktop — so for those people the proxy sees nothing and
// the report can only show percent-of-quota. This client is the only source
// that reports WEB AND DESKTOP use, per person, including cost.
//
// It is NOT a documented API. The Claude Enterprise Analytics API
// (api.anthropic.com/v1/organizations/analytics) requires an Enterprise plan
// and an Analytics API key; this organization is on Team ("analytics_
// subscription_plan": "claude_team"), so that door is shut. The endpoints
// below are the ones claude.ai's own analytics pages call. Anthropic can
// change them without notice, which is why every call here FAILS OPEN: a
// break costs this one section of the report, never the report itself.
//
// The cookie is a full admin session, so nothing here may ever return it, log
// it, or let it reach a persisted string. Errors are scrubbed before they are
// handed back.

import { scrubSecrets } from "../scrub.js";

const BASE = "https://claude.ai/api/claude_code/metrics_aggs";

// claude.ai sits behind Cloudflare, and cf_clearance is bound to the browser
// that earned it. A non-browser UA gets challenged, so we send the one the
// cookie was issued to.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/**
 * The credentials, from the environment.
 * @returns {{orgId: string, cookie: string, configured: boolean}}
 */
export function claudeWebSettingsFromEnv(env = process.env) {
  const orgId = String(env.CLAUDE_WEB_ORG_ID || "").trim();
  const raw = String(env.CLAUDE_WEB_SESSION_KEY || "").trim();
  // Accept either a bare sessionKey or a whole pasted Cookie header: the
  // header is what DevTools gives you, and asking for one cookie out of it is
  // how people end up pasting a truncated value.
  const cookie = raw && !raw.includes("=") ? `sessionKey=${raw}` : raw;
  return { orgId, cookie, configured: Boolean(orgId && cookie) };
}

/** Query string shared by both endpoints. */
export function metricsQuery({ orgId, startDate, endDate, granularity = "daily" }) {
  const p = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    granularity,
    organization_uuid: orgId,
    customer_type: "claude_ai",
    subscription_type: "team",
  });
  return p.toString();
}

/**
 * One call, with the failure folded into the result.
 *
 * Returns `{ ok, data, error }` rather than throwing: a dead cookie must
 * degrade this section, not take down the daily report that the rest of the
 * team's numbers live in.
 */
async function get(path, { orgId, cookie, startDate, endDate, granularity, fetchImpl = fetch }) {
  const url = `${BASE}/${path}?${metricsQuery({ orgId, startDate, endDate, granularity })}`;
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
      // 401/403 is the expiry case and the one an operator must be able to
      // act on, so it is named rather than reported as a generic failure.
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

/** Org-wide totals and the daily series. */
export function fetchOverview(opts) {
  return get("overview", opts);
}

/** Per-person cost and activity. */
export function fetchUsers(opts) {
  return get("users", opts);
}

/**
 * Both endpoints for one date range.
 *
 * Partial success is a real outcome and is reported as such: knowing the team
 * total while the per-person breakdown failed is still worth showing, and
 * pretending otherwise would hide a number the reader could have had.
 */
export async function fetchTeamAnalytics(opts) {
  const { configured } = opts;
  if (configured === false) {
    return {
      ok: false,
      configured: false,
      error: "CLAUDE_WEB_ORG_ID / CLAUDE_WEB_SESSION_KEY belum diisi",
      overview: null,
      users: [],
    };
  }

  const [overview, users] = await Promise.all([fetchOverview(opts), fetchUsers(opts)]);
  const errors = [overview.error, users.error].filter(Boolean);

  return {
    ok: overview.ok || users.ok,
    configured: true,
    error: errors.length ? errors.join(" · ") : null,
    overview: overview.data || null,
    users: users.data?.users || [],
    totalUsers: users.data?.total_users ?? null,
  };
}
