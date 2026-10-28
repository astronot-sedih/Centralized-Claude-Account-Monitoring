// Resolves the provider connection an inference request is pinned to, from the
// API key it was sent with.
//
// Why this exists: with several teammates' Claude accounts in one instance,
// account selection would otherwise pick per REQUEST, not per requester —
// person A's call could spend person B's quota and be recorded against B.
// Every per-person number in the monitoring report would then name the wrong
// person.

import { getApiKeyByKey as realGetApiKeyByKey } from "@/lib/db/repos/apiKeysRepo.js";
import { getProviderConnectionById as realGetConnectionById } from "@/lib/localDb";
import { extractClientApiKey } from "./keyAccess.js";

/**
 * @param {Request} request
 * @param {object} deps injectable for tests
 * @returns {Promise<string|null>} connection id, or null when unpinned
 */
export async function resolvePinnedConnectionId(request, deps = {}) {
  return (await resolvePin(request, deps)).connectionId;
}

/**
 * The pin plus the provider it belongs to.
 *
 * The provider matters: a pin names ONE connection, so applying it to a
 * request for a different provider would filter that provider's list against
 * a foreign id, match nothing, and leave the key dead everywhere except the
 * pinned provider. Resolving the provider here — rather than inferring it in
 * account selection — keeps "pin names another provider" (ignore it)
 * distinguishable from "pin names nothing at all" (fail closed).
 *
 * @returns {Promise<{connectionId: string|null, provider: string|null}>}
 */
export async function resolvePin(request, deps = {}) {
  const getApiKeyByKey = deps.getApiKeyByKey || realGetApiKeyByKey;
  const getConnectionById = deps.getProviderConnectionById || realGetConnectionById;
  const none = { connectionId: null, provider: null };
  try {
    // Reuse the shared extractor rather than reading headers here: it reads
    // the key from all four places the middleware does (Bearer, x-api-key,
    // x-goog-api-key, ?key=), and a partial reader would let a pinned key sent
    // as x-goog-api-key look unpinned — silently restoring the cross-account
    // behaviour this module exists to prevent.
    const key = extractClientApiKey(request);
    if (!key) return none;
    const record = await getApiKeyByKey(key);
    const connectionId = record?.pinnedConnectionId || null;
    if (!connectionId) return none;

    // A pin whose connection no longer exists stays a pin with no provider, so
    // selection still fails closed rather than silently using someone else's
    // account.
    const conn = await getConnectionById(connectionId).catch(() => null);
    return { connectionId, provider: conn?.provider || null };
  } catch {
    // An unreadable key must not become an accidental pin to something.
    return none;
  }
}
