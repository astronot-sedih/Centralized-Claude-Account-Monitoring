// SMTP delivery for the daily report.
//
// Ships DISABLED. A feature that mails out on first boot after an upgrade, to
// an address inherited from config, is an outbound action nobody asked for.

import { renderReportHtml } from "./report/renderHtml.js";
import { renderReportText } from "./report/renderText.js";
import { scrubSecrets } from "./scrub.js";
import { DEFAULT_TZ } from "./clock.js";

/**
 * Reads the MONITOR_* contract. Pass an env object in tests.
 * @returns {object} config for sendReportMail and the scheduler
 */
export function monitorSettingsFromEnv(env = process.env) {
  return {
    // Strict "true": an operator who writes 1 or yes gets the safe default
    // rather than an email they did not expect.
    enabled: env.MONITOR_ENABLED === "true",
    host: env.MONITOR_SMTP_HOST || "",
    port: Number(env.MONITOR_SMTP_PORT) || 587,
    secure: env.MONITOR_SMTP_SECURE === "true",
    user: env.MONITOR_SMTP_USER || "",
    pass: env.MONITOR_SMTP_PASS || "",
    from: env.MONITOR_MAIL_FROM || "",
    to: (env.MONITOR_MAIL_TO || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    reportHour: Number.isFinite(Number(env.MONITOR_REPORT_HOUR))
      ? Number(env.MONITOR_REPORT_HOUR)
      : 7,
    timeZone: env.MONITOR_TZ || DEFAULT_TZ,
  };
}

// An operator-chosen password is arbitrary text, so the pattern-based scrubber
// cannot be relied on to catch it. Replace it explicitly as well.
function safeReason(text, pass) {
  let out = scrubSecrets(text);
  if (pass && pass.length >= 3) out = out.split(pass).join("[redacted]");
  return out;
}

/**
 * @param {object} report from buildReport()
 * @param {object} config from monitorSettingsFromEnv() or settings
 * @param {object} deps injectable transport, so tests never open a socket
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendReportMail(report, config = {}, deps = {}) {
  const { enabled, host, port, secure, user, pass, from, to } = config;

  if (!enabled) return { sent: false, reason: "monitoring disabled" };
  if (!host) return { sent: false, reason: "no SMTP host configured" };
  if (!Array.isArray(to) || to.length === 0) {
    return { sent: false, reason: "no recipient configured" };
  }

  try {
    const createTransport =
      deps.createTransport ||
      (await import("nodemailer")).default.createTransport;

    const transport = createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass } } : {}),
    });

    const risk = report?.summary?.atRiskCount || 0;
    await transport.sendMail({
      from: from || user,
      to,
      subject: `Usage Claude Tim — ${report?.dateKey || ""}${risk ? ` (${risk} akun >90%)` : ""}`,
      // Both parts: some corporate clients render only the text one.
      text: renderReportText(report),
      html: renderReportHtml(report),
    });

    return { sent: true };
  } catch (error) {
    return { sent: false, reason: safeReason(error?.message || String(error), pass) };
  }
}
