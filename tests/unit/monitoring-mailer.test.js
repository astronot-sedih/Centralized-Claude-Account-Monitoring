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
