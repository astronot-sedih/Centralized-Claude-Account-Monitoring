"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * TextArea — multi-line text input.
 *
 * @prop {string}   label
 * @prop {boolean}  required
 * @prop {string}   value
 * @prop {function} onChange
 * @prop {string}   placeholder
 * @prop {number}   rows                 default 3
 * @prop {number}   maxLength
 * @prop {boolean}  showCount            shows "current / max" beside helper text
 * @prop {string}   helperText
 * @prop {string}   errorText
 * @prop {boolean}  disabled, readOnly
 * @prop {string}   name, id
 */
import { Icon } from './Icon.jsx';
const { useState } = React;

export function TextArea({
  label, required = false,
  value, defaultValue, onChange, placeholder,
  rows = 3,
  maxLength, showCount = false,
  helperText, errorText,
  disabled = false, readOnly = false,
  name, id,
  className = '',
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? '');
  const resolvedValue = isControlled ? value : internal;
  const handleChange = (e) => {
    if (!isControlled) setInternal(e.target.value);
    if (onChange) onChange(e);
  };
  const fieldId = id || (name ? 'ta-' + name : undefined);
  const inputClasses = [
    'ds-input',
    'ds-textarea',
    errorText ? 'ds-input--error' : '',
    disabled  ? 'ds-input--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  const len = (resolvedValue || '').length;

  return (
    <label className="ds-field" htmlFor={fieldId}>
      {label && (
        <span className="ds-field__label">
          {label}{required && <span className="ds-field__req">*</span>}
        </span>
      )}
      <span className={inputClasses}>
        <textarea
          id={fieldId}
          name={name}
          rows={rows}
          maxLength={maxLength}
          value={resolvedValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
        />
      </span>
      {(errorText || helperText || showCount) && (
        <span className={'ds-field__hint ' + (errorText ? 'ds-field__hint--error' : '')}>
          {errorText && <Icon name="warning-circle" size={12} />}
          <span>{errorText || helperText}</span>
          {showCount && maxLength && <span className="count">{len} / {maxLength}</span>}
        </span>
      )}
    </label>
  );
}
