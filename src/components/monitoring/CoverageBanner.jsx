"use client";

import { SEV_CSS_VARS } from "@/lib/monitoring/tokens";

/**
 * Sampling-coverage notice.
 *
 * Mirrors the design system's InfoBanner: soft severity fill, 1px severity
 * line, a bold title in the severity's text colour and the sentence in ink.
 *
 * It exists because downtime makes the trend numbers UNDERcount: a figure from
 * 40% coverage, presented as fact, would mislead a budget decision.
 */
export default function CoverageBanner({ coverage }) {
  if (!coverage) return null;
  const { samplesTaken = 0, samplesExpected = 0, percent = 0, partial } = coverage;

  if (!partial) {
    return (
      <p className="text-xs opacity-60">
        Cakupan sampling: {samplesTaken}/{samplesExpected} sampel.
      </p>
    );
  }

  const sev = SEV_CSS_VARS.medium;
  return (
    <div
      className="rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed"
      style={{ background: sev.fill, borderColor: sev.line }}
    >
      <strong style={{ color: sev.text }}>Cakupan sampling belum penuh</strong>
      <br />
      Hanya {samplesTaken} dari {samplesExpected} sampel terambil ({Math.round(percent)}%).
      Angka tren di bawah kemungkinan lebih rendah dari kenyataan.
    </div>
  );
}
