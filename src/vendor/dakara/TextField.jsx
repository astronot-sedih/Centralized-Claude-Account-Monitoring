"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * TextField — single-line input with optional label, helper and decorations.
 *
 * @prop {string}   label                 label above the input
 * @prop {boolean}  required              shows a red asterisk after the label
 * @prop {string}   value
 * @prop {function} onChange              (event) => void
 * @prop {string}   placeholder
 * @prop {'text'|'email'|'password'|'number'|'search'|'url'} type   default 'text'
 * @prop {'sm'|'md'|'lg'} size            default 'md'
 * @prop {string}   leftIcon              Lucide icon name shown inside on the left
 * @prop {string}   rightIcon             Lucide icon name shown inside on the right
 * @prop {function} onRightIconClick      makes the right icon clickable (e.g. password toggle)
 * @prop {string}   rightIconLabel        accessible name + DS tooltip for the clickable right icon (required when clickable)
 * @prop {string}   prefix                text prefix shown as a pill (e.g. "https://")
 * @prop {string}   suffix                text suffix shown as a pill (e.g. "USD")
 * @prop {string}   helperText
 * @prop {'default'|'error'|'success'} state   override visual state; otherwise inferred from errorText
 * @prop {string}   errorText             when set, forces error state and replaces helperText
 * @prop {boolean}  disabled
 * @prop {boolean}  readOnly
 * @prop {string}   name, id, autoComplete
 */
import { Icon } from './Icon.jsx';
const { useState } = React;

export function TextField({
  label, required = false,
  value, defaultValue, onChange, placeholder,
  type = 'text',
  size = 'md',
  leftIcon, rightIcon, onRightIconClick, rightIconLabel,
  prefix, suffix,
  helperText, errorText, state,
  disabled = false, readOnly = false,
  name, id, autoComplete,
  className = '',
}) {
  // If neither value nor defaultValue is provided, behave as controlled with empty string.
  // If only defaultValue is provided, use it once and become uncontrolled.
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? '');
  const resolvedValue = isControlled ? value : internal;
  const handleChange = (e) => {
    if (!isControlled) setInternal(e.target.value);
    if (onChange) onChange(e);
  };
  const fieldId = id || (name ? 'tf-' + name : undefined);
  const resolvedState = errorText ? 'error' : state;

  const inputClasses = [
    'ds-input',
    'ds-input--' + size,
    resolvedState === 'error'   ? 'ds-input--error'   : '',
    resolvedState === 'success' ? 'ds-input--success' : '',
    disabled                    ? 'ds-input--disabled' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <label className="ds-field" htmlFor={fieldId}>
      {label && (
        <span className="ds-field__label">
          {label}{required && <span className="ds-field__req">*</span>}
        </span>
      )}
      <span className={inputClasses}>
        {leftIcon && <Icon name={leftIcon} size={16} />}
        {prefix && <span className="ds-input__prefix">{prefix}</span>}
        <input
          id={fieldId}
          name={name}
          type={type}
          value={resolvedValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          autoComplete={autoComplete}
        />
        {suffix && <span className="ds-input__suffix">{suffix}</span>}
        {rightIcon && (
          onRightIconClick
            ? <button type="button" onClick={onRightIconClick} aria-label={rightIconLabel} data-ds-tooltip={rightIconLabel} className="ds-iconbtn ds-iconbtn--xs ds-iconbtn--flat ds-iconbtn--square"><Icon name={rightIcon} size={16} /></button>
            : <Icon name={rightIcon} size={16} />
        )}
      </span>
      {(errorText || helperText) && (
        <span className={'ds-field__hint ' + (errorText ? 'ds-field__hint--error' : (resolvedState === 'success' ? 'ds-field__hint--success' : ''))}>
          {errorText && <Icon name="warning-circle" size={12} />}
          {resolvedState === 'success' && !errorText && <Icon name="check-circle" size={12} />}
          <span>{errorText || helperText}</span>
        </span>
      )}
    </label>
  );
}
