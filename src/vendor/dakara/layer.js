"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * layer — shared positioning for floating layers (Tooltip, Popover; Select keeps its own).
 *
 * Aturan anti-masking (DESIGN-SYSTEM.md §32): a floating layer is `position: fixed`
 * (class `.ds-layer`), placed from the trigger's getBoundingClientRect(), so no
 * ancestor with overflow:hidden/auto (card, modal, sidebar, table wrap) can clip it.
 * It flips to the opposite side when there is no room and shifts to stay
 * VIEWPORT_MARGIN px inside the viewport. Re-placed on scroll (capture) and resize.
 *
 * Motion (DESIGN-SYSTEM.md §23, v1.10): usePresence keeps a layer mounted for its exit
 * animation (`data-state="closed"`), then unmounts; 0 ms under reduced motion.
 */
export const LAYER_OFFSET = 8;
export const VIEWPORT_MARGIN = 8;

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

export function placeLayer(trigger, layer, placement, offset = LAYER_OFFSET, margin = VIEWPORT_MARGIN) {
  const r = trigger.getBoundingClientRect();
  const w = layer.offsetWidth, h = layer.offsetHeight;
  const vw = window.innerWidth, vh = window.innerHeight;
  let [side, align = 'center'] = String(placement).split('-');
  const room = {
    top: r.top - offset - h >= margin,
    bottom: r.bottom + offset + h <= vh - margin,
    left: r.left - offset - w >= margin,
    right: r.right + offset + w <= vw - margin,
  };
  if (!room[side] && room[OPPOSITE[side]]) side = OPPOSITE[side];
  let top, left;
  if (side === 'top' || side === 'bottom') {
    top = side === 'top' ? r.top - offset - h : r.bottom + offset;
    left = align === 'start' ? r.left : align === 'end' ? r.right - w : r.left + r.width / 2 - w / 2;
  } else {
    left = side === 'left' ? r.left - offset - w : r.right + offset;
    top = r.top + r.height / 2 - h / 2;
  }
  left = Math.round(Math.min(Math.max(left, margin), Math.max(margin, vw - w - margin)));
  top = Math.round(Math.min(Math.max(top, margin), Math.max(margin, vh - h - margin)));
  // arrow stays on the trigger's centre even after a shift
  const arrow = side === 'top' || side === 'bottom'
    ? Math.min(Math.max(r.left + r.width / 2 - left, 10), w - 10)
    : Math.min(Math.max(r.top + r.height / 2 - top, 10), h - 10);
  return { top, left, side, align, arrow };
}

/** Keeps a layer placed while it is open. */
export function useLayer(open, triggerRef, layerRef, placement, deps = []) {
  const { useState, useLayoutEffect } = React;
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const update = () => {
      if (triggerRef.current && layerRef.current) setPos(placeLayer(triggerRef.current, layerRef.current, placement));
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open, placement, ...deps]);
  return pos;
}

/** Inline style for a placed layer; hidden (but measurable) until the first placement. */
export function layerStyle(pos, extra) {
  return pos
    ? { ...extra, top: pos.top, left: pos.left, '--ds-arrow': pos.arrow + 'px' }
    : { ...extra, top: 0, left: 0, visibility: 'hidden' };
}

/** True when the user asked for reduced motion (OS setting or html[data-motion="reduce"]). */
export function reducedMotion() {
  if (typeof window === 'undefined') return true;
  const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !!mq || document.documentElement.getAttribute('data-motion') === 'reduce';
}

/** Exit durations (ms) — keep in sync with --motion-* in components.css. */
export const EXIT_MS = { tooltip: 80, layer: 120, modal: 150, panel: 200 };

/**
 * [mounted, state] for enter/exit animation: mounts at once with state "open",
 * on close switches to "closed" and unmounts after exitMs.
 */
export function usePresence(open, exitMs = EXIT_MS.layer) {
  const { useState, useEffect } = React;
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState(open ? 'open' : 'closed');
  useEffect(() => {
    if (open) { setMounted(true); setState('open'); return undefined; }
    setState('closed');
    const t = setTimeout(() => setMounted(false), reducedMotion() ? 0 : exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);
  return [mounted, state];
}
