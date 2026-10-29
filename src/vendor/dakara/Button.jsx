"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Button — primary action element.
 *
 * @prop {'primary'|'secondary'|'ghost'|'outline'|'danger'|'success'} variant  default 'primary'
 * @prop {'xs'|'sm'|'md'|'lg'} size            default 'md'
 * @prop {string}              icon            Lucide icon name, rendered before children
 * @prop {string}              iconRight       Lucide icon name, rendered after children
 * @prop {boolean}             loading         shows a spinner, disables the button
 * @prop {boolean}             disabled
 * @prop {boolean}             fullWidth       stretches to container width
 * @prop {'button'|'submit'}   type            default 'button'
 * @prop {function}            onClick
 * @prop {ReactNode}           children
 */
import { Icon } from './Icon.jsx';

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  onClick,
  children,
  className = '',
}) {
  const ICON_SIZE = { xs: 11, sm: 12, md: 14, lg: 16 };
  const iconSize = ICON_SIZE[size] || 14;
  const classes = [
    'ds-btn',
    'ds-btn--' + size,
    'ds-btn--' + variant,
    fullWidth ? 'ds-btn--full' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading
        ? <span className="ds-btn__spinner" aria-label="Loading" />
        : icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}
