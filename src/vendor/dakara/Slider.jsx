"use client";

/**
 * Slider — range input.
 *
 * @prop {number}   value
 * @prop {function} onChange       (nextValue) => void
 * @prop {number}   min            default 0
 * @prop {number}   max            default 100
 * @prop {number}   step           default 1
 * @prop {boolean}  showValue      shows the numeric value to the right
 * @prop {boolean}  disabled
 */
export function Slider({ value = 0, onChange, min = 0, max = 100, step = 1, showValue = false, disabled = false, className = '' }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const handle = (e) => onChange && onChange(Number(e.target.value));

  return (
    <span className={'ds-slider ' + (className || '')} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span className="ds-slider__track" style={{ flex: 1, position: 'relative' }}>
        <span className="ds-slider__fill" style={{ width: pct + '%' }} />
        <span className="ds-slider__thumb" style={{ left: pct + '%' }} />
        <input
          type="range"
          value={value} min={min} max={max} step={step}
          disabled={disabled}
          onChange={handle}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: disabled ? 'not-allowed' : 'pointer' }}
        />
      </span>
      {showValue && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-secondary)', minWidth: 32, textAlign: 'right' }}>{value}</span>}
    </span>
  );
}
