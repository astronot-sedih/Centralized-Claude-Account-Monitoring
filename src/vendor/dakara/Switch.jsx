"use client";

/**
 * Switch — on/off toggle.
 *
 * @prop {boolean}  checked
 * @prop {function} onChange       (nextChecked, event) => void
 * @prop {string}   label
 * @prop {'sm'|'md'} size          default 'md'
 * @prop {boolean}  disabled
 * @prop {string}   name
 */
export function Switch({ checked = false, onChange, label, size = 'md', disabled = false, name, className = '' }) {
  const classes = [
    'ds-switch',
    'ds-switch--' + size,
    checked ? 'ds-switch--on' : '',
    disabled ? 'ds-switch--disabled' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <label className={classes}>
      <input
        type="checkbox" role="switch"
        checked={checked} disabled={disabled} name={name}
        onChange={(e) => onChange && onChange(e.target.checked, e)}
      />
      <span className="ds-switch__track">
        <span className="ds-switch__thumb" />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
