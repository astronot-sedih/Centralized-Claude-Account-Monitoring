"use client";

import { meterStyle, cellText } from "@/lib/monitoring/view";

/**
 * One quota window as a bar plus its numeral.
 *
 * Mirrors the design system's ProgressBar (6px track, pill radius, value shown)
 * and its binding rule: the label is always rendered — colour is never the only
 * signal, so this reads the same for a colourblind viewer or with CSS off.
 */
export default function QuotaMeter({ percent, severity = "info", label, hasWindow = true, ok = true }) {
  const style = meterStyle(percent, severity);
  const text = cellText(percent, { hasWindow, ok });
  const empty = style.width === null;

  return (
    <div className="flex items-center gap-2" title={label ? `${label}: ${text}` : text}>
      {empty ? null : (
        <span
          className="block h-1.5 w-14 shrink-0 overflow-hidden rounded-full"
          style={{ background: style.track }}
        >
          <span
            className="block h-full rounded-full"
            style={{ width: style.width, background: style.fill }}
          />
        </span>
      )}
      <span
        className={empty ? "text-xs italic opacity-60" : "text-xs font-semibold tabular-nums"}
        style={empty ? undefined : { color: style.text }}
      >
        {text}
      </span>
    </div>
  );
}
