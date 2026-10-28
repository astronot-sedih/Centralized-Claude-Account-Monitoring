// Resolves the provider connection an inference request is pinned to, from the
// API key it was sent with.
//
// Why this exists: with several teammates' Claude accounts in one instance,
// account selection would otherwise pick per REQUEST, not per requester —
// person A's call could spend person B's quota and be recorded against B.
// Every per-person number in the monitoring report would then name the wrong
// person.

import { getApiKeyByKey as realGetApiKeyByKey } from "@/lib/db/repos/apiKeysRepo.js";
import { extractClientApiKey } from "./keyAccess.js";

/**
 * @param {Request} request
 * @param {object} deps injectable for tests
 * @returns {Promise<string|null>} connection id, or null when unpinned
 */
export async function resolvePinnedConnectionId(request, deps = {}) {
  const getApiKeyByKey = deps.getApiKeyByKey || realGetApiKeyByKey;
  try {
    // Reuse the shared extractor rather than reading headers here: it reads
    // the key from all four places the middleware does (Bearer, x-api-key,
    // x-goog-api-key, ?key=), and a partial reader would let a pinned key sent
    // as x-goog-api-key look unpinned — silently restoring the cross-account
    // behaviour this module exists to prevent.
    const key = extractClientApiKey(request);
    if (!key) return null;
    const record = await getApiKeyByKey(key);
    return record?.pinnedConnectionId || null;
  } catch {
    // An unreadable key must not become an accidental pin to something.
    return null;
  }
}
