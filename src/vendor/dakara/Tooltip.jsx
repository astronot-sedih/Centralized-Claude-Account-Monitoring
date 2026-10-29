"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Tooltip — hover/focus label. No keyboard-shortcut hints (DESIGN-SYSTEM.md §31).
 * Rendered as a fixed layer (§32): never clipped by overflow:hidden containers,
 * flips and shifts to stay inside the viewport. Motion (§23): fade + 4px from the
 * trigger side, 120 ms in / 80 ms out.
 *
 * @prop {string}   label                            (required)
 * @prop {'top'|'bottom'|'left'|'right'} placement   default 'top' (preferred side)
 * @prop {number}   delay                            ms before showing, default 250
 * @prop {ReactNode} children                        the trigger element(s)
 */
import { useLayer, layerStyle, usePresence, EXIT_MS } from './layer.js';

const { useState, useRef } = React;
let ttSeq = 0;

export function Tooltip({ label, placement = 'top', delay = 250, children }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const wrap = useRef(null);
  const tip = useRef(null);
  const id = useRef('ds-tt-' + (++ttSeq));
  const [mounted, state] = usePresence(open, EXIT_MS.tooltip);
  const pos = useLayer(mounted, wrap, tip, placement, [label]);
  const show = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  const side = pos ? pos.side : placement;
  return (
    <span className="ds-tt-wrap" ref={wrap} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
      aria-describedby={open ? id.current : undefined}>
      {children}
      {mounted && (
        <span ref={tip} id={id.current} className={'ds-tt ds-tt--' + side + ' ds-layer'} role="tooltip"
          data-state={state} data-side={side} style={layerStyle(pos)}>
          {label}
        </span>
      )}
    </span>
  );
}
