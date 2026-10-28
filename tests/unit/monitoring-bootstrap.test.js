import { describe, expect, it } from "vitest";
import fs from "node:fs";

const src = fs.readFileSync("../src/instrumentation.js", "utf8");

describe("monitoring bootstrap", () => {
  it("starts the scheduler from instrumentation, inside the nodejs guard", () => {
    expect(src).toMatch(/NEXT_RUNTIME === "nodejs"/);
    expect(src).toMatch(/monitoring\/scheduler/);
    // Must sit after the runtime guard, not at module top level: the edge
    // runtime has no timers and no DB.
    expect(src.indexOf("monitoring/scheduler"))
      .toBeGreaterThan(src.indexOf('NEXT_RUNTIME === "nodejs"'));
  });

  it("imports the scheduler dynamically, so the edge bundle never pulls it in", () => {
    // Dynamic import, however it is spelled (bare await, or inside Promise.all).
    expect(src).toMatch(/import\(\s*["'][^"']*monitoring\/scheduler[^"']*["']\s*\)/);
    expect(src).not.toMatch(/^import .*monitoring\/scheduler/m);
  });

  it("cannot throw out of register() and break server boot", () => {
    // A monitoring feature must never be able to stop the gateway starting.
    const block = src.slice(src.indexOf("monitoring/scheduler") - 600,
                            src.indexOf("monitoring/scheduler") + 600);
    expect(block).toMatch(/try\s*\{|catch\s*\(/);
  });
});
