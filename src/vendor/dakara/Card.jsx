"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Card — surface container.
 *
 * @prop {ReactNode} children
 * @prop {'dense'|'default'|'padded'} padding  default 'default'
 * @prop {boolean}  elevated                   uses bg-elevated + shadow
 * @prop {boolean}  hoverable                  border lights on hover (and shows pointer)
 * @prop {function} onClick
 */
export function Card({ children, padding = 'default', elevated = false, hoverable = false, onClick, className = '' }) {
  const classes = [
    'ds-card',
    padding === 'padded' ? 'ds-card--padded' : '',
    padding === 'dense'  ? 'ds-card--dense'  : '',
    elevated ? 'ds-card--elevated' : '',
    hoverable || onClick ? 'ds-card--hover' : '',
    className,
  ].filter(Boolean).join(' ');
  return <div className={classes} onClick={onClick}>{children}</div>;
}
