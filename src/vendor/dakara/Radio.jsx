"use client";

/**
 * Radio — a single option in a radio group.
 *
 * @prop {boolean}  checked
 * @prop {function} onChange     (value, event) => void
 * @prop {string}   label
 * @prop {string}   value, name
 * @prop {boolean}  disabled
 */
export function Radio({ checked = false, onChange, label, value, name, disabled = false, className = '' }) {
  const classes = [
    'ds-radio',
    checked ? 'ds-radio--checked' : '',
    disabled ? 'ds-radio--disabled' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <label className={classes}>
      <input
        type="radio" checked={checked}
        value={value} name={name} disabled={disabled}
        onChange={(e) => onChange && onChange(value, e)}
      />
      <span className="ds-radio__dot" />
      {label && <span>{label}</span>}
    </label>
  );
}

/**
 * RadioGroup — controlled group of Radios.
 *
 * @prop {string}   value                       currently selected value
 * @prop {function} onChange                    (nextValue, event) => void
 * @prop {Array<{value:string,label:string,disabled?:boolean}>} options
 * @prop {string}   name                        shared input name
 * @prop {'vertical'|'horizontal'} direction    default 'vertical'
 */
export function RadioGroup({ value, onChange, options = [], name, direction = 'vertical', className = '' }) {
  const classes = [
    'ds-radio-group',
    direction === 'horizontal' ? 'ds-radio-group--horizontal' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <div className={classes} role="radiogroup">
      {options.map(opt => (
        <Radio
          key={opt.value}
          checked={value === opt.value}
          onChange={onChange}
          value={opt.value}
          label={opt.label}
          name={name}
          disabled={opt.disabled}
        />
      ))}
    </div>
  );
}
