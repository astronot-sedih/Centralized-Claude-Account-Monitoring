"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Popover — click-triggered floating panel. Closes on outside-click and Escape.
 * Rendered as a fixed layer (§32): escapes overflow:hidden/auto ancestors (cards,
 * modals, scroll panels), flips up when the space below is tight, shifts to stay
 * 8px inside the viewport. Motion (§23): fade + scale .96 from the trigger side,
 * 160 ms in / 120 ms out.
 *
 * @prop {ReactNode|function}  content           the panel body. If a function, receives { close }.
 * @prop {'bottom-start'|'bottom-end'|'bottom'|'top-start'|'top-end'} placement   default 'bottom-start' (preferred)
 * @prop {number}              width             default 240
 * @prop {ReactNode}           children          trigger element(s)
 * @prop {boolean}             defaultOpen       open by default
 */
import { useLayer, layerStyle, usePresence, EXIT_MS } from './layer.js';

const { useState, useRef, useEffect } = React;

export function Popover({ children, content, placement = 'bottom-start', width = 240, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef(null);
  const trigger = useRef(null);
  const panel = useRef(null);
  const [mounted, state] = usePresence(open, EXIT_MS.layer);
  const pos = useLayer(mounted, trigger, panel, placement, [width]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const cls = pos ? pos.side + (pos.align === 'center' ? '' : '-' + pos.align) : placement;
  return (
    <span className="ds-pop-wrap" ref={ref}>
      <span ref={trigger} onClick={() => setOpen(o => !o)} style={{ display: 'inline-flex' }}>{children}</span>
      {mounted && (
        <div ref={panel} className={'ds-pop ds-pop--' + cls + ' ds-layer'} style={layerStyle(pos, { width })} role="dialog"
          data-state={state} data-side={pos ? pos.side : placement.split('-')[0]}>
          {typeof content === 'function' ? content({ close: () => setOpen(false) }) : content}
        </div>
      )}
    </span>
  );
}
