import { describe, expect, it, vi } from "vitest";
import { sendReportMail, monitorSettingsFromEnv } from "../../src/lib/monitoring/mailer.js";

const report = {
  dateKey: "2026-10-28", rows: [], footnotes: ["a", "b", "c"],
  summary: { atRiskCount: 1, measuredCount: 1, unmeasuredCount: 9, limitDaysThisWeek: 2 },
  coverage: { samplesTaken: 20, samplesExpected: 24, percent: 83, partial: true },
};
const config = {
  enabled: true, host: "smtp.test", port: 587, secure: false,
  user: "u", pass: "p", from: "bot@t.io", to: ["admin@t.io"],
};

describe("sendReportMail", () => {
  it("sends both an HTML and a plain-text part", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "1" }));
    const r = await sendReportMail(report, config, { createTransport: () => ({ sendMail }) });
    expect(r.sent).toBe(true);
    const msg = sendMail.mock.calls[0][0];
    expect(msg.html).toBeTruthy();
    expect(msg.text).toBeTruthy();
    expect(msg.to).toEqual(["admin@t.io"]);
  });

  it("refuses to send while disabled", async () => {
    const sendMail = vi.fn();
    const r = await sendReportMail(report, { ...config, enabled: false },
      { createTransport: () => ({ sendMail }) });
    expect(r.sent).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("refuses to send with no recipient rather than throwing", async () => {
    const r = await sendReportMail(report, { ...config, to: [] },
      { createTransport: () => ({ sendMail: vi.fn() }) });
    expect(r).toMatchObject({ sent: false });
    expect(r.reason).toMatch(/recipient|penerima/i);
  });

  it("refuses to send with no host configured", async () => {
    const r = await sendReportMail(report, { ...config, host: "" },
      { createTransport: () => ({ sendMail: vi.fn() }) });
    expect(r.sent).toBe(false);
    expect(r.reason).toMatch(/host/i);
  });

  it("never puts the SMTP password in the returned reason", async () => {
    const r = await sendReportMail(report, { ...config, pass: "sup3rs3cret" }, {
      createTransport: () => ({ sendMail: async () => { throw new Error("535 auth failed for sup3rs3cret"); } }),
    });
    expect(r.sent).toBe(false);
    expect(JSON.stringify(r)).not.toContain("sup3rs3cret");
  });

  it("subjects the mail with the report date", async () => {
    const sendMail = vi.fn(async () => ({}));
    await sendReportMail(report, config, { createTransport: () => ({ sendMail }) });
    expect(sendMail.mock.calls[0][0].subject).toContain("2026-10-28");
  });
});

describe("monitorSettingsFromEnv", () => {
  it("ships disabled by default", () => {
    const c = monitorSettingsFromEnv({});
    expect(c.enabled).toBe(false);
  });

  it("defaults the report hour and timezone", () => {
    const c = monitorSettingsFromEnv({});
    expect(c.reportHour).toBe(7);
    expect(c.timeZone).toBe("Asia/Jakarta");
  });

  it("splits a comma-separated recipient list", () => {
    const c = monitorSettingsFromEnv({ MONITOR_MAIL_TO: "a@t.io, b@t.io ,c@t.io" });
    expect(c.to).toEqual(["a@t.io", "b@t.io", "c@t.io"]);
  });

  it("reads MONITOR_ENABLED as a strict 'true'", () => {
    expect(monitorSettingsFromEnv({ MONITOR_ENABLED: "true" }).enabled).toBe(true);
    expect(monitorSettingsFromEnv({ MONITOR_ENABLED: "1" }).enabled).toBe(false);
    expect(monitorSettingsFromEnv({ MONITOR_ENABLED: "yes" }).enabled).toBe(false);
  });
});

describe("settings protection", () => {
  it("lists the SMTP password as mass-assignment protected", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("../src/app/api/settings/route.js", "utf8");
    expect(src).toMatch(/PROTECTED_SETTING_KEYS[\s\S]{0,300}monitorSmtpPass/);
    // and stripped from the GET response, like password / oidcClientSecret
    expect(src).toMatch(/const\s*\{[^}]*monitorSmtpPass[^}]*\}\s*=\s*settings/);
  });
});

describe("sendReportMail — the failure reason has to be actionable", () => {
  it("unwraps AggregateError, which hides its causes behind an empty message", () => {
    // Node throws AggregateError when every connection attempt fails (IPv4 and
    // IPv6). Its own .message is often empty, so the reason reaching the
    // operator was the bare string "AggregateError" — true and useless.
    const agg = new AggregateError([
      Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:587"), { code: "ECONNREFUSED" }),
      Object.assign(new Error("connect ETIMEDOUT 2606:4700::1:587"), { code: "ETIMEDOUT" }),
    ]);
    return sendReportMail(report, config, {
      createTransport: () => ({ sendMail: async () => { throw agg; } }),
    }).then((r) => {
      expect(r.sent).toBe(false);
      expect(r.reason).not.toBe("AggregateError");
      expect(r.reason).toMatch(/ECONNREFUSED/);
      expect(r.reason).toMatch(/587/);
    });
  });

  it("names the host and port when the connection is refused", async () => {
    const r = await sendReportMail(report, config, {
      createTransport: () => ({
        sendMail: async () => {
          throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:587"), { code: "ECONNREFUSED" });
        },
      }),
    });
    expect(r.reason).toMatch(/smtp\.test/);   // config.host
    expect(r.reason).toMatch(/587/);
  });

  it("still redacts the password inside an unwrapped cause", async () => {
    const r = await sendReportMail(report, { ...config, pass: "sup3rs3cret" }, {
      createTransport: () => ({
        sendMail: async () => {
          throw new AggregateError([new Error("535 auth failed for sup3rs3cret")]);
        },
      }),
    });
    expect(JSON.stringify(r)).not.toContain("sup3rs3cret");
  });
});

describe("recipients can be set from the dashboard", () => {
  it("prefers the stored recipients over the env value", async () => {
    const { resolveMonitorConfig } = await import("../../src/lib/monitoring/mailer.js");
    const c = await resolveMonitorConfig(
      { MONITOR_MAIL_TO: "env@t.io" },
      async () => ({ monitorMailTo: "ui-a@t.io, ui-b@t.io" })
    );
    expect(c.to).toEqual(["ui-a@t.io", "ui-b@t.io"]);
  });

  it("falls back to env when nothing is stored", async () => {
    const { resolveMonitorConfig } = await import("../../src/lib/monitoring/mailer.js");
    const c = await resolveMonitorConfig(
      { MONITOR_MAIL_TO: "env@t.io" },
      async () => ({ monitorMailTo: "" })
    );
    expect(c.to).toEqual(["env@t.io"]);
  });

  it("survives a settings read that throws", async () => {
    // A monitoring config read must never take the scheduler down.
    const { resolveMonitorConfig } = await import("../../src/lib/monitoring/mailer.js");
    const c = await resolveMonitorConfig(
      { MONITOR_MAIL_TO: "env@t.io" },
      async () => { throw new Error("db locked"); }
    );
    expect(c.to).toEqual(["env@t.io"]);
  });

  it("ignores entries that are not email-shaped", async () => {
    // The list reaches an SMTP envelope; junk in it is a send failure for
    // everyone, not just the bad entry.
    const { resolveMonitorConfig } = await import("../../src/lib/monitoring/mailer.js");
    const c = await resolveMonitorConfig(
      {},
      async () => ({ monitorMailTo: "ok@t.io, not-an-email, , also@t.io" })
    );
    expect(c.to).toEqual(["ok@t.io", "also@t.io"]);
  });
});
