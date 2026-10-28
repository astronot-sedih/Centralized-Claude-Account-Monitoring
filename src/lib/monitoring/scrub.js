// Strip anything credential-shaped out of text before it is persisted,
// rendered, logged or emailed.
//
// The monitoring collector handles OAuth access tokens, and the place they
// actually leak is inside an error message — "refresh failed for sk-ant-…".
// A snapshot row keeps that message, the report renders it, and the email
// carries it off the machine. So everything error-shaped goes through here.

// Order matters: specific shapes first, then the generic long-blob sweep.
// Without that, the generic rule would eat half of a JWT and leave the rest.
const PATTERNS = [
  // Credentials inside a URL: proxy errors from proxyFetch carry the configured
  // connectionProxyUrl verbatim, and those routinely contain user:pass@. That
  // string would be persisted in a snapshot row and mailed out.
  { re: /\/\/[^\s/@:]+:[^\s/@]+@/g, to: "//[redacted]@" },
  // Anthropic keys and OAuth tokens: sk-ant-api…, sk-ant-oat01-…
  /sk-ant-[A-Za-z0-9_-]+/g,
  // OpenAI-style, in case a mixed error string carries one
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  // JWTs — three base64url segments
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // Authorization: Bearer <blob> — keep the header name, drop the value
  /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  // Anything else long and opaque enough to be a credential. The length floor
  // is what keeps ordinary prose ("token expired", "rate limited") readable.
  /\b[A-Za-z0-9_-]{32,}\b/g,
];

/**
 * @param {unknown} text
 * @returns {string} the text with credential-shaped runs replaced by [redacted]
 */
export function scrubSecrets(text) {
  if (typeof text !== "string") return "";
  let out = text;
  for (const entry of PATTERNS) {
    if (entry instanceof RegExp === false) {
      out = out.replace(entry.re, entry.to);
      continue;
    }
    const re = entry;
    out = out.replace(re, (match) =>
      /^(Bearer|Basic)\s/i.test(match)
        ? `${match.split(/\s+/)[0]} [redacted]`
        : "[redacted]"
    );
  }
  return out;
}
