import { describe, expect, it } from "vitest";
import { severityForWindow } from "../../src/lib/monitoring/tokens.js";

describe("API severity reaches the report", () => {
  it("createQuotaObject carries severity and isActive through", async () => {
    // Spike 0 observed Anthropic shipping its own severity per window, and
    // tokens.js prefers it over our thresholds — but the usage service was
    // dropping the field, so the preference was dead code and our 90/75/50
    // fallback silently decided every row.
    const fs = await import("node:fs");
    const src = fs.readFileSync("../open-sse/services/usage/claude.js", "utf8");
    const fn = src.slice(src.indexOf("const createQuotaObject"), src.indexOf("if (hasUtilization(data.five_hour))"));
    expect(fn).toMatch(/severity/);
  });

  it("a window carrying the API's severity uses it, not our thresholds", () => {
    // 10% would be "low" by our thresholds; the API saying warning wins.
    expect(severityForWindow({ used: 10, utilization: 10, severity: "warning" })).toBe("high");
  });
});
