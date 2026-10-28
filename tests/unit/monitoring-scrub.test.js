import { describe, expect, it } from "vitest";
import { scrubSecrets } from "../../src/lib/monitoring/scrub.js";

describe("scrubSecrets", () => {
  it("redacts Anthropic-shaped tokens anywhere in the string", () => {
    const tok = "sk-ant-oat01-" + "A".repeat(80);
    expect(scrubSecrets(`refresh failed for ${tok} at step 2`))
      .toBe("refresh failed for [redacted] at step 2");
    expect(scrubSecrets(tok)).not.toContain("sk-ant");
  });

  it("redacts bearer headers and long opaque blobs", () => {
    expect(scrubSecrets("Authorization: Bearer abc123def456ghi789jkl012mno345pqr"))
      .not.toMatch(/abc123def456/);
    expect(scrubSecrets("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP"))
      .toBe("[redacted]");
  });

  it("leaves ordinary error text intact", () => {
    expect(scrubSecrets("HTTP 429 rate limited, retry after 180s"))
      .toBe("HTTP 429 rate limited, retry after 180s");
    expect(scrubSecrets("token expired")).toBe("token expired");
  });

  it("returns empty string for non-string input", () => {
    expect(scrubSecrets(null)).toBe("");
    expect(scrubSecrets(undefined)).toBe("");
    expect(scrubSecrets({ a: 1 })).toBe("");
  });
});

describe("scrubSecrets — adversarial", () => {
  it("redacts the real token shapes this repo stores", () => {
    // Observed live: 108-char sk-ant-oat01 access tokens on claude connections.
    const real = "sk-ant-oat01-" + "x".repeat(95);
    expect(scrubSecrets(`Error: 401 for ${real}`)).not.toContain("x".repeat(10));
    // Refresh tokens share the prefix family.
    expect(scrubSecrets("sk-ant-ort01-abc123def456ghi789")).not.toContain("abc123");
  });

  it("redacts every occurrence, not just the first", () => {
    const t = "sk-ant-oat01-" + "A".repeat(40);
    const out = scrubSecrets(`${t} then ${t} again`);
    expect(out).not.toContain("AAAA");
    expect(out.match(/\[redacted\]/g)).toHaveLength(2);
  });

  it("keeps the header name but drops the bearer value", () => {
    const out = scrubSecrets("Authorization: Bearer " + "q".repeat(40));
    expect(out).toContain("Bearer");
    expect(out).not.toContain("qqqq");
  });

  it("survives a token embedded in JSON or a URL without leaking a fragment", () => {
    const t = "sk-ant-oat01-" + "Z".repeat(60);
    expect(scrubSecrets(JSON.stringify({ accessToken: t }))).not.toContain("ZZZZ");
    expect(scrubSecrets(`https://api.anthropic.com/v1?access_token=${t}`)).not.toContain("ZZZZ");
  });

  it("still reads as a usable error after scrubbing", () => {
    // Scrubbing must not make the message useless — the operator has to be able
    // to tell an expired token from a 429.
    expect(scrubSecrets("Refresh token invalid or reused. Please re-authorize the connection."))
      .toBe("Refresh token invalid or reused. Please re-authorize the connection.");
    expect(scrubSecrets("Claude connected. Unable to fetch usage: 429"))
      .toBe("Claude connected. Unable to fetch usage: 429");
  });
});

describe("scrubSecrets — proxy credentials", () => {
  it("redacts user:pass embedded in a proxy URL", () => {
    // proxyFetch puts the configured connectionProxyUrl into its error text,
    // and that URL routinely carries credentials. The collector persists that
    // string and the mailer sends it.
    const out = scrubSecrets("connect ECONNREFUSED http://bob:hunter2@proxy.local:8080");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("bob:");
    expect(out).toContain("proxy.local");   // still diagnosable
  });

  it("handles socks and https proxy URLs too", () => {
    expect(scrubSecrets("socks5://u:p@10.0.0.1:1080 failed")).not.toContain("u:p@");
    expect(scrubSecrets("[ProxyFetch] Proxy required but failed (strictProxy=true): https://admin:s3cr3t@gw:3128"))
      .not.toContain("s3cr3t");
  });

  it("leaves a credential-free URL intact", () => {
    expect(scrubSecrets("connect ETIMEDOUT http://proxy.local:8080"))
      .toBe("connect ETIMEDOUT http://proxy.local:8080");
  });
});
