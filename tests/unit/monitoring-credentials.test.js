import { describe, expect, it } from "vitest";
import { refreshAndUpdateCredentials } from "../../src/lib/monitoring/credentials.js";

describe("refreshAndUpdateCredentials", () => {
  it("is importable from the shared module", () => {
    expect(typeof refreshAndUpdateCredentials).toBe("function");
  });

  it("is still re-exported from the usage route for existing callers", async () => {
    const mod = await import("../../src/app/api/usage/[connectionId]/route.js");
    expect(typeof mod.refreshAndUpdateCredentials).toBe("function");
  });

  it("is the same function object in both places, not a copy", async () => {
    // A second implementation would eventually drift from this one, and the
    // comment in the original records why that matters: refreshing from a stale
    // snapshot can revoke the whole token family and log the account out.
    const mod = await import("../../src/app/api/usage/[connectionId]/route.js");
    expect(mod.refreshAndUpdateCredentials).toBe(refreshAndUpdateCredentials);
  });
});
