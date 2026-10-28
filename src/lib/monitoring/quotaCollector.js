// Reads every Claude account's quota and writes one snapshot per account.
//
// Claude only: no other provider is collected (the quotaSnapshots.provider
// column exists so a later change could widen this, but nothing here does).
//
// Two properties this module exists to guarantee:
//   1. Fail-soft per account — one dead token cannot cost the other ten their
//      reading, and a failed read is PERSISTED (ok = 0) rather than dropped,
//      because "we could not read this account" is itself reportable.
//   2. Gentle on the usage endpoint — sequential with a delay, and never
//      force: true. The service caches 5 min and backs off 3 min after a 429;
//      11 parallel calls is precisely what trips it.

import { getProviderConnections, getProviderConnectionById } from "@/lib/localDb";
import { getClaudeUsage as realGetClaudeUsage } from "open-sse/services/usage/claude.js";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { insertSnapshot as realInsertSnapshot } from "@/lib/db/repos/quotaSnapshotsRepo.js";
import { refreshAndUpdateCredentials as realRefresh } from "./credentials.js";
import { getAdapter } from "@/lib/db/driver.js";
import { scrubSecrets } from "./scrub.js";

export const COLLECT_DELAY_MS = 1500;
export const PROVIDER = "claude";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Was this connection's traffic routed through 9router on this date?
 *
 * Observed rather than configured, so it self-corrects when someone switches
 * tools. The override covers the case the observation gets wrong: a Claude
 * Code user who simply did not work that day would otherwise be labelled
 * desktop, and their units would read "tak terukur" when they are measurable.
 *
 * @returns {Promise<"9router"|"desktop">}
 */
export async function resolveSource(connectionId, dateKey, deps = {}) {
  const getConnection = deps.getConnection || getProviderConnectionById;
  const countUsageRows = deps.countUsageRows || defaultCountUsageRows;

  const conn = await getConnection(connectionId);
  const override = conn?.providerSpecificData?.monitoring?.sourceLabel;
  if (override === "9router" || override === "desktop") return override;

  const n = await countUsageRows(connectionId, dateKey);
  return n > 0 ? "9router" : "desktop";
}

async function defaultCountUsageRows(connectionId, dateKey) {
  const db = await getAdapter();
  // usageHistory.timestamp is an ISO instant; dateKey is a local date. Matching
  // on the prefix is approximate at the day boundary, which is acceptable here:
  // this decides a label, not a number, and the override exists for the rest.
  const row = db.get(
    `SELECT COUNT(*) n FROM usageHistory WHERE connectionId = ? AND timestamp LIKE ?`,
    [connectionId, `${dateKey}%`]
  );
  return row?.n || 0;
}

/**
 * One collection pass over every active Claude connection.
 *
 * @param {object} deps injectable collaborators; production calls with none
 * @returns {Promise<{attempted: number, ok: number, failed: number}>}
 */
export async function collectOnce(deps = {}) {
  const {
    getProviderConnections: listConnections = getProviderConnections,
    refreshAndUpdateCredentials = realRefresh,
    getClaudeUsage = realGetClaudeUsage,
    insertSnapshot = realInsertSnapshot,
    resolveSourceFor,
    resolveProxy = resolveConnectionProxyConfig,
    delay = sleep,
    dateKey = new Date().toISOString().slice(0, 10),
    now = () => new Date().toISOString(),
  } = deps;

  const connections = await listConnections({ provider: PROVIDER, isActive: true });
  const result = { attempted: 0, ok: 0, failed: 0 };

  // ONE instant for the whole pass. Stamping per account made an 11-account
  // pass look like 11 samples, so sampling coverage reported 137% on a day
  // that was 12.5% covered — and suppressed the partial-day warning.
  const passCapturedAt = now();

  for (let i = 0; i < connections.length; i++) {
    if (i > 0) await delay(COLLECT_DELAY_MS);

    const conn = connections[i];
    result.attempted++;

    const base = {
      capturedAt: passCapturedAt,
      dateKey,
      connectionId: conn.id,
      provider: PROVIDER,
      accountEmail: conn.email || null,
      // Claude OAuth connections often carry no email; without the name the
      // report would show a raw UUID to whoever reads it.
      accountName: conn.name || null,
      source: null,
    };

    try {
      base.source = resolveSourceFor
        ? await resolveSourceFor(conn.id, dateKey)
        : await resolveSource(conn.id, dateKey);
    } catch {
      // A label we could not derive must not cost us the reading itself.
      base.source = null;
    }

    try {
      const { connection } = await refreshAndUpdateCredentials(conn, false, null);
      const token = connection?.accessToken;
      if (!token) throw new Error("No access token stored for this connection.");

      let proxyOptions = null;
      try {
        // providerSpecificData, not the connection: resolveConnectionProxyConfig
        // reads proxyPoolId / connectionProxyEnabled off the top level of its
        // argument. Passing the connection reported "no proxy" for a proxied
        // account — failing the read, and sending the token direct for a pool
        // whose whole point is strictProxy.
        proxyOptions = await resolveProxy(connection.providerSpecificData);
      } catch {
        proxyOptions = null;
      }

      // No force: the 5-minute cache and the 429 cooldown are protections.
      const usage = await getClaudeUsage(token, proxyOptions);

      // The service soft-fails with { message } rather than throwing, so the
      // presence of `quotas` is what distinguishes a reading from a failure.
      if (!usage?.quotas) {
        throw new Error(usage?.message || "Usage endpoint returned no quota data.");
      }

      await insertSnapshot({
        ...base,
        plan: usage.plan || null,
        quotas: usage.quotas,
        extraUsage: usage.extraUsage ?? null,
        resetCredits: usage.resetCredits ?? null,
        ok: 1,
        errorMessage: null,
      });
      result.ok++;
    } catch (error) {
      // Scrub before persisting: an error string is where a token actually
      // leaks, and this row is rendered into an email that leaves the machine.
      await insertSnapshot({
        ...base,
        plan: null,
        quotas: null,
        extraUsage: null,
        resetCredits: null,
        ok: 0,
        errorMessage: scrubSecrets(error?.message || String(error)),
      });
      result.failed++;
    }
  }

  return result;
}
