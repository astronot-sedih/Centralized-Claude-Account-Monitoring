"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * ChartBox — the fill-container frame for every chart (DESIGN-SYSTEM.md §33.9).
 * It takes all the space left in a widget body (flex: 1), measures itself with
 * ResizeObserver and hands the real pixel size to its render function, so the
 * chart is drawn at 1:1 — it always fills the card, text never stretches and
 * there are no letterbox bands from viewBox scaling.
 *
 * @prop {function} children   ({ width, height, plot }) => ReactNode — draw an <svg width height>
 * @prop {number}   minHeight  smallest drawable height, default 120
 * @prop {object}   margin     plot margins { top, right, bottom, left }; default 8 · 8 · 24 · 40
 * @prop {string}   label      text summary of the chart (role="img" + aria-label)
 * @prop {string}   className
 */
const { useRef, useState, useLayoutEffect } = React;

export const CHART_MARGIN = { top: 8, right: 8, bottom: 24, left: 40 };

/** Calls cb({ width, height }) whenever el's content box changes (rAF-throttled). Returns a cleanup fn. */
export function observeChartSize(el, cb) {
  let raf = 0, last = '';
  const emit = (w, h) => {
    const key = w + 'x' + h;
    if (key !== last) { last = key; cb({ width: w, height: h }); }
  };
  if (typeof ResizeObserver === 'undefined') {
    emit(Math.round(el.clientWidth), Math.round(el.clientHeight));
    return () => {};
  }
  const ro = new ResizeObserver((entries) => {
    const r = entries[0].contentRect;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => emit(Math.round(r.width), Math.round(r.height)));
  });
  ro.observe(el);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); };
}

/** Plot rectangle inside a measured box: { x0, x1, y0, y1, w, h }. */
export function plotArea(size, margin = {}) {
  const m = { ...CHART_MARGIN, ...margin };
  const x0 = m.left, x1 = Math.max(m.left + 1, size.width - m.right);
  const y0 = m.top, y1 = Math.max(m.top + 1, size.height - m.bottom);
  return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
}

/** 3–6 "nice" tick values covering [min, max] (1 · 2 · 2.5 · 5 × 10^n steps). */
export function niceTicks(min, max, count = 4) {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => s >= raw) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** How many category labels fit along the x axis (min 48px each); returns the step to skip by. */
export function labelStep(count, width, minPx = 48) {
  return Math.max(1, Math.ceil(count / Math.max(1, Math.floor(width / minPx))));
}

export function ChartBox({ children, minHeight = 120, margin, label, className = '' }) {
  const ref = useRef(null);
  const [size, setSize] = useState(null);
  useLayoutEffect(() => (ref.current ? observeChartSize(ref.current, setSize) : undefined), []);
  return (
    <div ref={ref} className={('ds-chart-box ' + className).trim()} style={{ minHeight }}
      role={label ? 'img' : undefined} aria-label={label}>
      {size && size.width > 0 && size.height > 0 && children({ ...size, plot: plotArea(size, margin) })}
    </div>
  );
}
