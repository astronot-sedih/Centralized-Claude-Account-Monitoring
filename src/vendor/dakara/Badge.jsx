"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Badge — small status pill.
 *
 * @prop {'neutral'|'accent'|'success'|'warning'|'danger'|'info'} variant   default 'neutral'
 * @prop {boolean}  dot          show a colored leading dot, default true
 * @prop {ReactNode} children
 */
export function Badge({ variant = 'neutral', dot = true, children, className = '' }) {
  return (
    <span className={'ds-badge ds-badge--' + variant + ' ' + className}>
      {dot && <span className="ds-badge__dot" />}
      {children}
    </span>
  );
}
