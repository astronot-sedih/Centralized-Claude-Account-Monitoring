"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Tag — metadata chip with optional remove icon.
 *
 * @prop {ReactNode} children
 * @prop {function}  onRemove        if provided, renders an "×" remove button
 * @prop {string}    icon            Lucide icon name shown before the label
 */
import { Icon } from './Icon.jsx';

export function Tag({ children, onRemove, icon, className = '' }) {
  return (
    <span className={'ds-tag ' + className}>
      {icon && <Icon name={icon} size={12} />}
      <span>{children}</span>
      {onRemove && (
        <button type="button" className="ds-tag__remove" onClick={onRemove} aria-label="Remove">
          <Icon name="x" size={10} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}
