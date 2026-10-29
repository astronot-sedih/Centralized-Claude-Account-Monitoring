"use client";

/**
 * Checkbox — binary or tri-state selection.
 *
 * @prop {boolean}  checked
 * @prop {boolean}  indeterminate     mutually exclusive with checked=true visually
 * @prop {function} onChange          (nextChecked, event) => void
 * @prop {string}   label             optional clickable label to the right
 * @prop {boolean}  disabled
 * @prop {string}   name
 */
import { Icon } from './Icon.jsx';

export function Checkbox({
  checked = false, indeterminate = false,
  onChange, label, disabled = false, name,
  className = '',
}) {
  const classes = [
    'ds-checkbox',
    checked       ? 'ds-checkbox--checked'       : '',
    indeterminate ? 'ds-checkbox--indeterminate' : '',
    disabled      ? 'ds-checkbox--disabled'      : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <label className={classes}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        name={name}
        onChange={(e) => onChange && onChange(e.target.checked, e)}
      />
      <span className="ds-checkbox__box">
        {checked && !indeterminate && <Icon name="check" size={12} strokeWidth={3} />}
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
