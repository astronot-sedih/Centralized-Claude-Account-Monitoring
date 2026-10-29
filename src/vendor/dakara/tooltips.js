"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * enableTooltips — DS tooltips for plain HTML (no React): any element with
 * data-ds-tooltip="Label" (optional data-ds-tooltip-placement="top|bottom|left|right")
 * gets the same fixed-layer Tooltip as the React component (§32, §35) instead of the
 * native `title` tooltip. One delegated listener per root; returns a cleanup fn.
 */
import { placeLayer, reducedMotion, EXIT_MS } from './layer.js';

export function enableTooltips(root = document, { delay = 250 } = {}) {
  let tip = null, timer = 0, current = null;
  const hide = () => {
    clearTimeout(timer); current = null;
    if (!tip) return;
    const t = tip; tip = null;
    t.setAttribute('data-state', 'closed');
    setTimeout(() => t.remove(), reducedMotion() ? 0 : EXIT_MS.tooltip);
  };
  const show = (el) => {
    const label = el.getAttribute('data-ds-tooltip');
    if (!label || el.disabled) return;
    hide(); current = el;
    timer = setTimeout(() => {
      if (current !== el) return;
      const t = document.createElement('span');
      t.className = 'ds-tt ds-layer'; t.setAttribute('role', 'tooltip'); t.textContent = label;
      t.style.cssText = 'top:0;left:0;visibility:hidden';
      document.body.appendChild(t);
      const p = placeLayer(el, t, el.getAttribute('data-ds-tooltip-placement') || 'top');
      t.classList.add('ds-tt--' + p.side); t.setAttribute('data-side', p.side); t.setAttribute('data-state', 'open');
      t.style.cssText = 'top:' + p.top + 'px;left:' + p.left + 'px;--ds-arrow:' + p.arrow + 'px';
      tip = t;
    }, delay);
  };
  const over = (e) => { const el = e.target.closest && e.target.closest('[data-ds-tooltip]'); if (el && el !== current) show(el); else if (!el && current) hide(); };
  const out = (e) => { if (current && !current.contains(e.relatedTarget)) hide(); };
  root.addEventListener('pointerover', over); root.addEventListener('pointerout', out);
  root.addEventListener('focusin', over); root.addEventListener('focusout', out);
  window.addEventListener('scroll', hide, true);
  return () => { hide(); root.removeEventListener('pointerover', over); root.removeEventListener('pointerout', out); root.removeEventListener('focusin', over); root.removeEventListener('focusout', out); window.removeEventListener('scroll', hide, true); };
}
