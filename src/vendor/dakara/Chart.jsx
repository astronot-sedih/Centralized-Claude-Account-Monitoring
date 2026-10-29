"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Chart — 16 jenis grafik dengan alternatif tabel (DESIGN-SYSTEM.md §39, v1.17).
 *
 * Satu komponen, satu kontrak: digambar di atas ChartBox (selalu mengisi container, §33.9),
 * seri berwarna viz-1…16 + penanda non-warna tetap, legenda = filter seri, toggle Grafik/Tabel,
 * tooltip lapisan fixed (§32), ringkasan teks untuk pembaca layar.
 *
 * @prop {'bar'|'line'|'area'|'pie'|'donut'|'radial'|'gauge'|'network'|'boxplot'|'scatter'|'radar'|'heatmap'|'histogram'|'stacked'|'waterfall'|'treemap'|'bubble'} type
 * @prop {object}   data         bentuk data per jenis — lihat README / index.d.ts
 * @prop {string}   title        nama grafik (caption tabel + aria-label)
 * @prop {string}   summary      deskripsi bermakna untuk pembaca layar (bukan "gambar grafik")
 * @prop {string}   unit         satuan nilai, mis. 'kasus', '%', 'Rp'
 * @prop {function} format       (v) => string untuk nilai; default id-ID
 * @prop {'auto'|'vertical'|'horizontal'} orientation   bar: auto = horizontal bila label tidak muat
 * @prop {'neutral'|'up-good'|'up-bad'} polarity       waterfall: warna naik/turun (§36)
 * @prop {boolean}  legend       default true (seri bisa difilter)
 * @prop {boolean}  tableToggle  default true (tombol Grafik/Tabel)
 * @prop {'chart'|'table'} defaultView
 * @prop {number}   minHeight    default 180
 */
import { ChartBox, niceTicks, labelStep } from './ChartBox.jsx';
import { Icon } from './Icon.jsx';
const { useState } = React;

export const CHART_TYPES = ['bar', 'line', 'area', 'pie', 'donut', 'radial', 'gauge', 'network', 'boxplot', 'scatter', 'radar', 'heatmap', 'histogram', 'stacked', 'waterfall', 'treemap', 'bubble'];
const MARK = ['circle', 'square', 'cross', 'circle', 'triangle', 'square', 'ring', 'diamond', 'diamond', 'triangle', 'tridown', 'plus', 'plus', 'star', 'hsquare', 'penta'];
const DASH = ['', '', '', '6 3', '', '2 3', '', '10 3', '', '1 3', '', '6 2 1 2', '', '', '', ''];
const MARK_NAME = ['lingkaran', 'persegi', 'silang', 'garis putus', 'segitiga', 'garis titik', 'lingkaran kosong', 'garis putus-panjang', 'belah ketupat', 'garis titik-pendek', 'segitiga terbalik', 'garis putus-titik', 'tanda tambah', 'bintang', 'persegi kosong', 'pentagon'];

/** Style of series i: { color, marker, dash, markerName } — color viz-(i+1), fixed non-colour marker. */
export function seriesStyle(i) {
  const k = ((i % 16) + 16) % 16;
  return { color: 'var(--viz-' + (k + 1) + ')', marker: MARK[k], dash: DASH[k], markerName: MARK_NAME[k] };
}

const fmtNum = (v, d = 1) => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: d });
export function fmtCompact(v) {
  const a = Math.abs(v);
  if (a >= 1e12) return fmtNum(v / 1e12) + ' T';
  if (a >= 1e9) return fmtNum(v / 1e9) + ' M';
  if (a >= 1e6) return fmtNum(v / 1e6) + ' jt';
  if (a >= 1e3) return fmtNum(v / 1e3) + ' rb';
  return fmtNum(v);
}
/** Truncate text to fit maxPx (approx. charPx per char) with an ellipsis. */
const clip = (t, maxPx, charPx = 6.2) => { t = String(t); const n = Math.floor(maxPx / charPx); return t.length <= n ? t : n < 2 ? '' : t.slice(0, n - 1) + '…'; };
const lin = (d0, d1, r0, r1) => (v) => d1 === d0 ? (r0 + r1) / 2 : r0 + (v - d0) * (r1 - r0) / (d1 - d0);
const sum = (a) => a.reduce((s, v) => s + (+v || 0), 0);
const pathOf = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');

/** Marker shape at (x, y), size r. */
export function Marker({ shape, x, y, r = 4, color, hollow }) {
  const f = hollow ? 'var(--surface)' : color, s = { fill: f, stroke: color, strokeWidth: hollow || shape === 'cross' || shape === 'plus' ? 1.6 : 0 };
  switch (shape) {
    case 'square': return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} {...s} />;
    case 'hsquare': return <rect x={x - r + 0.8} y={y - r + 0.8} width={2 * r - 1.6} height={2 * r - 1.6} {...s} fill="var(--surface)" strokeWidth={1.6} />;
    case 'ring': return <circle cx={x} cy={y} r={r - 0.6} {...s} fill="var(--surface)" strokeWidth={1.6} />;
    case 'triangle': return <path d={`M${x} ${y - r * 1.1}L${x + r * 1.1} ${y + r * 0.9}H${x - r * 1.1}Z`} {...s} />;
    case 'tridown': return <path d={`M${x} ${y + r * 1.1}L${x + r * 1.1} ${y - r * 0.9}H${x - r * 1.1}Z`} {...s} />;
    case 'diamond': return <path d={`M${x} ${y - r * 1.2}L${x + r * 1.2} ${y}L${x} ${y + r * 1.2}L${x - r * 1.2} ${y}Z`} {...s} />;
    case 'cross': return <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`} fill="none" stroke={color} strokeWidth={1.8} />;
    case 'plus': return <path d={`M${x} ${y - r * 1.1}V${y + r * 1.1}M${x - r * 1.1} ${y}H${x + r * 1.1}`} fill="none" stroke={color} strokeWidth={2} />;
    case 'star': {
      const p = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.5 : r * 1.25; p.push([x + rr * Math.cos(a), y + rr * Math.sin(a)]); }
      return <path d={pathOf(p) + 'Z'} {...s} />;
    }
    case 'penta': {
      const p = []; for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / 5; p.push([x + r * 1.15 * Math.cos(a), y + r * 1.15 * Math.sin(a)]); }
      return <path d={pathOf(p) + 'Z'} {...s} />;
    }
    default: return <circle cx={x} cy={y} r={r} {...s} />;
  }
}

function Swatch({ i, line, color }) {
  const st = seriesStyle(i), c = color || st.color;
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" className="ds-chart__swatch">
      {line && <line x1="1" y1="6" x2="21" y2="6" stroke={c} strokeWidth="2" strokeDasharray={st.dash || undefined} />}
      <Marker shape={st.marker} x={11} y={6} r={3.6} color={c} />
    </svg>
  );
}

/* ---------- axes ---------- */
function YAxis({ plot, ticks, y, fmt }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line className="ds-chart__grid" x1={plot.x0} x2={plot.x1} y1={Math.round(y(t)) + 0.5} y2={Math.round(y(t)) + 0.5} />
          <text x={plot.x0 - 6} y={y(t)} dy="0.32em" textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
    </g>
  );
}
function XLabels({ labels, xs, plot, width }) {
  const n = labels.length, st = labelStep(n, width), last = n - 1;
  return (
    <g>
      {labels.map((l, i) => (i === last || (i % st === 0 && last - i >= st)) ? (
        <text key={i} x={xs[i]} y={plot.y1 + 16} textAnchor={n > 1 && i === 0 && xs[i] - plot.x0 < 20 ? 'start' : n > 1 && i === last && plot.x1 - xs[i] < 20 ? 'end' : 'middle'}>{String(l)}</text>
      ) : null)}
    </g>
  );
}
const extent = (vals, zero = true) => {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (zero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (lo === hi) hi = lo + 1;
  return [lo, hi];
};

/* ---------- tooltip (fixed layer, §32) ---------- */
function useTip() {
  const [tip, setTip] = useState(null);
  const on = (text) => ({
    onMouseMove: (e) => setTip({ x: e.clientX, y: e.clientY, text }),
    onMouseLeave: () => setTip(null),
    onFocus: (e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left + r.width / 2, y: r.top, text }); },
    onBlur: () => setTip(null),
  });
  const node = tip ? (
    <div className="ds-layer ds-chart-tip" role="tooltip" style={{ left: Math.min(tip.x + 12, window.innerWidth - 248), top: Math.max(8, tip.y - 40) }}>{tip.text}</div>
  ) : null;
  return [on, node];
}

/* ---------- renderers: each gets ({ width, height, plot, d, P }) ---------- */
function catSeries(d) { return { cats: d.categories || [], series: d.series || [] }; }

function renderBars({ width, height, d, P, stacked }) {
  const { cats, series } = catSeries(d);
  const vis = series.map((s, i) => ({ ...s, i })).filter((s) => !P.hidden.has(s.i));
  const longest = Math.max(...cats.map((c) => String(c).length), 1);
  const horiz = P.orientation === 'horizontal' || (P.orientation !== 'vertical' && !stacked && (width - 48) / Math.max(1, cats.length) < Math.min(longest * 6.5, 64));
  const totals = cats.map((_, ci) => sum(vis.map((s) => s.values[ci])));
  const vals = stacked ? totals : vis.flatMap((s) => s.values);
  const [lo, hi] = extent(vals.length ? vals : [0, 1]);
  const ticks = niceTicks(lo, hi, horiz ? 4 : 4);
  if (horiz) {
    const left = Math.min(150, 10 + longest * 6.4);
    const plot = { x0: left, x1: width - 36, y0: 4, y1: height - 22 };
    const x = lin(ticks[0], ticks[ticks.length - 1], plot.x0, plot.x1);
    const band = (plot.y1 - plot.y0) / cats.length, bw = Math.max(4, Math.min(28, band * 0.64)), each = bw / Math.max(1, vis.length);
    return (
      <g>
        {ticks.map((t) => <g key={t}><line className="ds-chart__grid" x1={Math.round(x(t)) + 0.5} x2={Math.round(x(t)) + 0.5} y1={plot.y0} y2={plot.y1} /><text x={x(t)} y={plot.y1 + 16} textAnchor="middle">{P.axisFmt(t)}</text></g>)}
        {cats.map((c, ci) => {
          const cy = plot.y0 + band * ci + band / 2;
          return (
            <g key={ci}>
              <text x={plot.x0 - 8} y={cy} dy="0.32em" textAnchor="end" className="ds-chart__cat">{String(c)}</text>
              {vis.map((s, k) => {
                const v = s.values[ci], y0 = cy - bw / 2 + each * k;
                return <rect key={k} className="ds-chart__mark" tabIndex={0} x={Math.min(x(0), x(v))} y={y0} width={Math.max(1, Math.abs(x(v) - x(0)))} height={Math.max(2, each - 1)} rx="2" fill={seriesStyle(s.i).color} {...P.tip(`${c} · ${s.name}: ${P.fmt(v)}`)} />;
              })}
              {vis.length === 1 && <text x={x(vis[0].values[ci]) + 6} y={cy} dy="0.32em" className="ds-chart__value">{P.fmt(vis[0].values[ci])}</text>}
            </g>
          );
        })}
      </g>
    );
  }
  const plot = { x0: 44, x1: width - 8, y0: 14, y1: height - 24 };
  const y = lin(ticks[0], ticks[ticks.length - 1], plot.y1, plot.y0);
  const band = (plot.x1 - plot.x0) / cats.length, bw = Math.max(6, Math.min(48, band * 0.6));
  const xs = cats.map((_, i) => plot.x0 + band * i + band / 2);
  return (
    <g>
      <YAxis plot={plot} ticks={ticks} y={y} fmt={P.axisFmt} />
      {cats.map((c, ci) => {
        if (stacked) {
          let acc = 0;
          return (
            <g key={ci}>
              {vis.map((s) => { const v = +s.values[ci] || 0, a = acc; acc += v; return <rect key={s.i} className="ds-chart__mark" tabIndex={0} x={xs[ci] - bw / 2} y={y(acc)} width={bw} height={Math.max(0, y(a) - y(acc) - (acc ? 1 : 0))} fill={seriesStyle(s.i).color} {...P.tip(`${c} · ${s.name}: ${P.fmt(v)}`)} />; })}
              <text x={xs[ci]} y={y(acc) - 5} textAnchor="middle" className="ds-chart__value">{P.axisFmt(acc)}</text>
            </g>
          );
        }
        const each = bw / Math.max(1, vis.length);
        return (
          <g key={ci}>
            {vis.map((s, k) => { const v = s.values[ci]; return <rect key={k} className="ds-chart__mark" tabIndex={0} x={xs[ci] - bw / 2 + each * k} y={Math.min(y(0), y(v))} width={Math.max(2, each - (vis.length > 1 ? 1 : 0))} height={Math.max(1, Math.abs(y(v) - y(0)))} rx="2" fill={seriesStyle(s.i).color} {...P.tip(`${c} · ${s.name}: ${P.fmt(v)}`)} />; })}
          </g>
        );
      })}
      <XLabels labels={cats} xs={xs} plot={plot} width={plot.x1 - plot.x0} />
    </g>
  );
}

function renderLine({ width, height, d, P, area }) {
  const { cats, series } = catSeries(d);
  const vis = series.map((s, i) => ({ ...s, i })).filter((s) => !P.hidden.has(s.i));
  const [lo, hi] = extent(vis.flatMap((s) => s.values).concat(area ? [0] : []), !!area || d.zero !== false);
  const ticks = niceTicks(lo, hi, 4);
  const plot = { x0: 44, x1: width - 10, y0: 10, y1: height - 24 };
  const y = lin(ticks[0], ticks[ticks.length - 1], plot.y1, plot.y0);
  const xs = cats.map((_, i) => cats.length < 2 ? (plot.x0 + plot.x1) / 2 : plot.x0 + i * (plot.x1 - plot.x0) / (cats.length - 1));
  const showMarks = cats.length <= 31;
  return (
    <g>
      <YAxis plot={plot} ticks={ticks} y={y} fmt={P.axisFmt} />
      {vis.map((s) => {
        const st = seriesStyle(s.i), pts = s.values.map((v, i) => [xs[i], y(v)]);
        return (
          <g key={s.i}>
            {area && <path className="ds-chart__area" d={pathOf(pts) + `L${xs[xs.length - 1]} ${y(Math.max(0, ticks[0]))}L${xs[0]} ${y(Math.max(0, ticks[0]))}Z`} fill={st.color} />}
            <path className="ds-chart__line" d={pathOf(pts)} stroke={st.color} strokeDasharray={st.dash || undefined} />
            {showMarks && pts.map((p, i) => <g key={i} className="ds-chart__mark" tabIndex={-1} {...P.tip(`${cats[i]} · ${s.name}: ${P.fmt(s.values[i])}`)}><circle cx={p[0]} cy={p[1]} r="9" fill="transparent" /><Marker shape={st.marker} x={p[0]} y={p[1]} r={3.2} color={st.color} /></g>)}
          </g>
        );
      })}
      <XLabels labels={cats} xs={xs} plot={plot} width={plot.x1 - plot.x0} />
    </g>
  );
}

function arc(cx, cy, r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0, p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  if (r0 <= 0) return `M${cx} ${cy}L${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}Z`;
  return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
}
export function pieItems(d, maxItems = 6) {
  const items = [...(d.items || [])].sort((a, b) => b.value - a.value);
  if (items.length <= maxItems) return items.map((it, i) => ({ ...it, i }));
  const head = items.slice(0, maxItems - 1).map((it, i) => ({ ...it, i }));
  return head.concat([{ label: 'Lainnya', value: sum(items.slice(maxItems - 1).map((x) => x.value)), i: -1, other: items.length - maxItems + 1 }]);
}
function renderPie({ width, height, d, P, donut }) {
  const items = pieItems(d), total = sum(items.map((x) => x.value)) || 1;
  const r = Math.max(20, Math.min(width, height) / 2 - 22), cx = width / 2, cy = height / 2, r0 = donut ? r * 0.62 : 0;
  let a = -Math.PI / 2;
  return (
    <g>
      {items.map((it) => {
        const a0 = a, a1 = a + (it.value / total) * Math.PI * 2; a = a1;
        const mid = (a0 + a1) / 2, pct = it.value / total * 100, lr = donut ? (r + r0) / 2 : r * 0.66;
        const col = it.i < 0 ? 'var(--viz-muted)' : seriesStyle(it.i).color;
        return (
          <g key={it.label}>
            <path className="ds-chart__mark" tabIndex={0} d={arc(cx, cy, r0, r, a0, a1 - 0.004)} fill={col} stroke="var(--surface)" strokeWidth="1.5" {...P.tip(`${it.label}: ${P.fmt(it.value)} (${fmtNum(pct)}%)`)} />
            {pct >= 7 && <text x={cx + lr * Math.cos(mid)} y={cy + lr * Math.sin(mid)} dy="0.32em" textAnchor="middle" className="ds-chart__onfill">{fmtNum(pct, 0)}%</text>}
          </g>
        );
      })}
      {donut && <g><text x={cx} y={cy - 4} textAnchor="middle" className="ds-chart__center">{P.axisFmt(total)}</text><text x={cx} y={cy + 14} textAnchor="middle">{d.centerLabel || 'total'}</text></g>}
    </g>
  );
}

function renderRadial({ width, height, d, P }) {
  const items = (d.items || [{ label: d.label, value: d.value, max: d.max }]).slice(0, 3);
  const cx = width / 2, cy = height / 2, R = Math.max(24, Math.min(width, height) / 2 - 8), thick = Math.max(8, Math.min(18, R * 0.16));
  return (
    <g>
      {items.map((it, k) => {
        const r = R - k * (thick + 6), frac = Math.max(0, Math.min(1, it.value / (it.max || 100))), col = it.tone ? `var(--tone-${it.tone})` : seriesStyle(k).color;
        return (
          <g key={k} {...P.tip(`${it.label}: ${fmtNum(frac * 100)}% (${P.fmt(it.value)} dari ${P.fmt(it.max || 100)})`)} tabIndex={0} className="ds-chart__mark">
            <circle cx={cx} cy={cy} r={r - thick / 2} fill="none" stroke="var(--progress-track)" strokeWidth={thick} />
            {frac > 0 && <path d={frac >= 0.999 ? `M${cx} ${cy - r + thick / 2}a${r - thick / 2} ${r - thick / 2} 0 1 1 -0.01 0` : arcLine(cx, cy, r - thick / 2, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)} fill="none" stroke={col} strokeWidth={thick} strokeLinecap="round" />}
          </g>
        );
      })}
      {items.length === 1 && <text x={cx} y={cy - 2} dy="0.32em" textAnchor="middle" className="ds-chart__center">{fmtNum(items[0].value / (items[0].max || 100) * 100, 0)}%</text>}
      {items.length === 1 && items[0].label && <text x={cx} y={cy + 18} textAnchor="middle">{clip(items[0].label, (R - thick) * 1.6)}</text>}
    </g>
  );
}
function arcLine(cx, cy, r, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
}

function renderGauge({ width, height, d, P }) {
  const min = d.min || 0, max = d.max == null ? 100 : d.max, v = Math.max(min, Math.min(max, d.value));
  const R = Math.max(30, Math.min(width / 2 - 16, height - 44)), cx = width / 2, cy = Math.min(height - 28, R + 14), thick = Math.max(10, R * 0.14);
  const ang = (x) => Math.PI + (x - min) / (max - min) * Math.PI;
  const bands = d.bands || [];
  const band = bands.find((b) => v <= b.to), tone = d.tone || (band && band.tone);
  return (
    <g>
      <path d={arcLine(cx, cy, R - thick / 2, Math.PI, 2 * Math.PI)} fill="none" stroke="var(--progress-track)" strokeWidth={thick} />
      {bands.map((b, k) => { const from = k ? bands[k - 1].to : min; return <path key={k} d={arcLine(cx, cy, R + 4, ang(from) + 0.01, ang(b.to) - 0.01)} fill="none" stroke={b.tone ? `var(--tone-${b.tone})` : 'var(--faint-2)'} strokeWidth="3" />; })}
      <path className="ds-chart__mark" tabIndex={0} {...P.tip(`${d.label || 'Nilai'}: ${P.fmt(v)} (rentang ${P.fmt(min)}–${P.fmt(max)})`)} d={arcLine(cx, cy, R - thick / 2, Math.PI, Math.max(Math.PI + 0.02, ang(v)))} fill="none" stroke={tone ? `var(--tone-${tone})` : 'var(--viz-1)'} strokeWidth={thick} />
      <line x1={cx} y1={cy} x2={cx + (R - thick - 6) * Math.cos(ang(v))} y2={cy + (R - thick - 6) * Math.sin(ang(v))} stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill="var(--ink)" />
      <text x={cx - R + thick / 2} y={cy + 18} textAnchor="middle">{P.axisFmt(min)}</text>
      <text x={cx + R - thick / 2} y={cy + 18} textAnchor="middle">{P.axisFmt(max)}</text>
      <text x={cx} y={cy - R * 0.38} textAnchor="middle" className="ds-chart__center">{P.fmt(v)}</text>
      {(d.label || band) && <text x={cx} y={cy + 18} textAnchor="middle">{clip([d.label, band && band.label].filter(Boolean).join(' · '), (R - thick) * 1.7)}</text>}
    </g>
  );
}

function layoutNetwork(nodes, links, w, h) {
  const n = nodes.length, idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const groups = [...new Set(nodes.map((x) => x.group))];
  const pos = nodes.map((nd, i) => {
    const g = groups.indexOf(nd.group), ga = g / Math.max(1, groups.length) * Math.PI * 2, a = ga + (i * 2.399);
    return [w / 2 + Math.cos(ga) * w * 0.22 + Math.cos(a) * 24, h / 2 + Math.sin(ga) * h * 0.22 + Math.sin(a) * 24];
  });
  const L = links.map((l) => [idx.get(l.source), idx.get(l.target)]).filter(([a, b]) => a != null && b != null);
  const k = Math.sqrt((w * h) / Math.max(1, n)) * 0.55;
  for (let it = 0; it < 240; it++) {
    const t = 0.1 * (1 - it / 240) + 0.01, disp = pos.map(() => [0, 0]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], dd = Math.hypot(dx, dy) || 0.01, f = (k * k) / dd;
      disp[i][0] += dx / dd * f; disp[i][1] += dy / dd * f; disp[j][0] -= dx / dd * f; disp[j][1] -= dy / dd * f;
    }
    for (const [a, b] of L) {
      let dx = pos[a][0] - pos[b][0], dy = pos[a][1] - pos[b][1], dd = Math.hypot(dx, dy) || 0.01, f = (dd * dd) / k;
      disp[a][0] -= dx / dd * f; disp[a][1] -= dy / dd * f; disp[b][0] += dx / dd * f; disp[b][1] += dy / dd * f;
    }
    for (let i = 0; i < n; i++) {
      const dl = Math.hypot(disp[i][0], disp[i][1]) || 1, lim = Math.min(dl, k * t * 4);
      pos[i][0] = Math.max(28, Math.min(w - 28, pos[i][0] + disp[i][0] / dl * lim + (w / 2 - pos[i][0]) * 0.01));
      pos[i][1] = Math.max(16, Math.min(h - 22, pos[i][1] + disp[i][1] / dl * lim + (h / 2 - pos[i][1]) * 0.01));
    }
  }
  return { pos, L, groups };
}
const NET_CACHE = new WeakMap();
function renderNetwork({ width, height, d, P }) {
  const nodes = d.nodes || [], links = d.links || [];
  const key = width + 'x' + height;
  let c = NET_CACHE.get(nodes);
  if (!c || c.key !== key || c.links !== links) { c = { key, links, v: layoutNetwork(nodes, links, width, height) }; NET_CACHE.set(nodes, c); }
  const { pos, L, groups } = c.v;
  const deg = nodes.map(() => 0); L.forEach(([a, b]) => { deg[a]++; deg[b]++; });
  return (
    <g>
      {L.map(([a, b], k) => <line key={k} x1={pos[a][0]} y1={pos[a][1]} x2={pos[b][0]} y2={pos[b][1]} stroke="var(--node-line)" strokeWidth="1.2" strokeDasharray={links[k] && links[k].inferred ? '4 3' : undefined} />)}
      {nodes.map((nd, i) => {
        const g = groups.indexOf(nd.group); if (P.hidden.has(g)) return null;
        const st = seriesStyle(g), r = 4 + Math.min(6, deg[i]);
        return (
          <g key={nd.id} className="ds-chart__mark" tabIndex={0} {...P.tip(`${nd.label || nd.id} · ${nd.group || '—'} · ${deg[i]} relasi`)}>
            <Marker shape={st.marker} x={pos[i][0]} y={pos[i][1]} r={r} color={st.color} />
            {deg[i] >= 3 && <text x={pos[i][0]} y={pos[i][1] + r + 11} textAnchor="middle" className="ds-chart__nodelabel">{nd.label || nd.id}</text>}
          </g>
        );
      })}
    </g>
  );
}

export function quartiles(values) {
  const v = [...values].sort((a, b) => a - b), q = (p) => { const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
  const q1 = q(0.25), med = q(0.5), q3 = q(0.75), iqr = q3 - q1, lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const inside = v.filter((x) => x >= lo && x <= hi);
  return { min: inside[0], q1, med, q3, max: inside[inside.length - 1], outliers: v.filter((x) => x < lo || x > hi), n: v.length };
}
function renderBox({ width, height, d, P }) {
  const groups = (d.groups || []).map((g, i) => ({ ...g, i, s: quartiles(g.values) }));
  const all = groups.flatMap((g) => g.values);
  const ticks = niceTicks(Math.min(...all), Math.max(...all), 4);
  const plot = { x0: 44, x1: width - 8, y0: 10, y1: height - 24 };
  const y = lin(ticks[0], ticks[ticks.length - 1], plot.y1, plot.y0);
  const band = (plot.x1 - plot.x0) / groups.length, bw = Math.max(10, Math.min(44, band * 0.45));
  const xs = groups.map((_, i) => plot.x0 + band * i + band / 2);
  return (
    <g>
      <YAxis plot={plot} ticks={ticks} y={y} fmt={P.axisFmt} />
      {groups.map((g, i) => {
        const s = g.s, x = xs[i], col = seriesStyle(i).color;
        return (
          <g key={i} className="ds-chart__mark" tabIndex={0} {...P.tip(`${g.label} · median ${P.fmt(s.med)} · Q1 ${P.fmt(s.q1)} · Q3 ${P.fmt(s.q3)} · min ${P.fmt(s.min)} · maks ${P.fmt(s.max)}${s.outliers.length ? ' · ' + s.outliers.length + ' pencilan' : ''}`)}>
            <line x1={x} x2={x} y1={y(s.min)} y2={y(s.q1)} stroke="var(--ink-2)" />
            <line x1={x} x2={x} y1={y(s.q3)} y2={y(s.max)} stroke="var(--ink-2)" />
            <line x1={x - bw / 4} x2={x + bw / 4} y1={y(s.min)} y2={y(s.min)} stroke="var(--ink-2)" />
            <line x1={x - bw / 4} x2={x + bw / 4} y1={y(s.max)} y2={y(s.max)} stroke="var(--ink-2)" />
            <rect x={x - bw / 2} y={y(s.q3)} width={bw} height={Math.max(1, y(s.q1) - y(s.q3))} rx="2" fill={col} fillOpacity="0.22" stroke={col} strokeWidth="1.5" />
            <line x1={x - bw / 2} x2={x + bw / 2} y1={y(s.med)} y2={y(s.med)} stroke="var(--ink)" strokeWidth="2" />
            {s.outliers.map((o, k) => <circle key={k} cx={x} cy={y(o)} r="3" fill="var(--surface)" stroke={col} strokeWidth="1.5" />)}
          </g>
        );
      })}
      <XLabels labels={groups.map((g) => g.label)} xs={xs} plot={plot} width={plot.x1 - plot.x0} />
    </g>
  );
}

function renderScatter({ width, height, d, P, bubble }) {
  const series = (d.series || []).map((s, i) => ({ ...s, i })).filter((s) => !P.hidden.has(s.i));
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return null;
  const xt = niceTicks(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)), 5);
  const yt = niceTicks(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)), 4);
  const plot = { x0: 44, x1: width - 12, y0: 12, y1: height - 26 };
  const x = lin(xt[0], xt[xt.length - 1], plot.x0, plot.x1), y = lin(yt[0], yt[yt.length - 1], plot.y1, plot.y0);
  const rMax = Math.max(...pts.map((p) => p.r || 0), 1), rs = (r) => 4 + Math.sqrt((r || 0) / rMax) * Math.min(26, (plot.x1 - plot.x0) / 14);
  return (
    <g>
      <YAxis plot={plot} ticks={yt} y={y} fmt={P.axisFmt} />
      {xt.map((t) => <text key={t} x={x(t)} y={plot.y1 + 16} textAnchor="middle">{P.axisFmt(t)}</text>)}
      {d.xLabel && <text x={plot.x1} y={plot.y1 - 6} textAnchor="end" className="ds-chart__axislabel">{d.xLabel} →</text>}
      {d.yLabel && <text x={plot.x0 + 6} y={plot.y0 + 4} dy="0.6em" className="ds-chart__axislabel">↑ {d.yLabel}</text>}
      {series.map((s) => {
        const st = seriesStyle(s.i);
        return s.points.map((p, k) => (
          <g key={s.i + '-' + k} className="ds-chart__mark" tabIndex={-1} {...P.tip(`${p.label ? p.label + ' · ' : ''}${s.name} · ${d.xLabel || 'x'} ${P.fmt(p.x)} · ${d.yLabel || 'y'} ${P.fmt(p.y)}${bubble ? ' · ' + (d.rLabel || 'ukuran') + ' ' + P.fmt(p.r) : ''}`)}>
            {bubble
              ? <circle cx={x(p.x)} cy={y(p.y)} r={rs(p.r)} fill={st.color} fillOpacity="0.28" stroke={st.color} strokeWidth="1.5" />
              : <Marker shape={st.marker} x={x(p.x)} y={y(p.y)} r={3.6} color={st.color} />}
            {bubble && p.label && rs(p.r) > 16 && <text x={x(p.x)} y={y(p.y)} dy="0.32em" textAnchor="middle" className="ds-chart__nodelabel">{p.label}</text>}
          </g>
        ));
      })}
    </g>
  );
}

function renderRadar({ width, height, d, P }) {
  const axes = d.axes || [], series = (d.series || []).map((s, i) => ({ ...s, i })).filter((s) => !P.hidden.has(s.i));
  const max = d.max || Math.max(...series.flatMap((s) => s.values), 1);
  const cx = width / 2, cy = height / 2 + 4, R = Math.max(30, Math.min(width / 2 - 64, height / 2 - 22));
  const pt = (k, v) => { const a = -Math.PI / 2 + k * 2 * Math.PI / axes.length, r = R * v / max; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  return (
    <g>
      {[0.25, 0.5, 0.75, 1].map((f) => <path key={f} className="ds-chart__grid" fill="none" d={pathOf(axes.map((_, k) => pt(k, max * f))) + 'Z'} />)}
      {axes.map((a, k) => { const [x1, y1] = pt(k, max), [lx, ly] = pt(k, max * 1.12); return <g key={k}><line className="ds-chart__grid" x1={cx} y1={cy} x2={x1} y2={y1} /><text x={lx} y={ly} dy="0.32em" textAnchor={Math.abs(lx - cx) < 6 ? 'middle' : lx > cx ? 'start' : 'end'} className="ds-chart__cat">{a}</text></g>; })}
      {series.map((s) => {
        const st = seriesStyle(s.i), pts = s.values.map((v, k) => pt(k, v));
        return (
          <g key={s.i}>
            <path d={pathOf(pts) + 'Z'} fill={st.color} fillOpacity="0.1" stroke={st.color} strokeWidth="2" strokeDasharray={st.dash || undefined} />
            {pts.map((p, k) => <g key={k} className="ds-chart__mark" {...P.tip(`${s.name} · ${axes[k]}: ${P.fmt(s.values[k])}`)}><Marker shape={st.marker} x={p[0]} y={p[1]} r={3.2} color={st.color} /></g>)}
          </g>
        );
      })}
    </g>
  );
}

export function heatBuckets(values, n = 5) {
  const flat = values.flat().filter((v) => v != null), lo = Math.min(...flat), hi = Math.max(...flat);
  const edges = Array.from({ length: n + 1 }, (_, k) => lo + (hi - lo) * k / n);
  return { lo, hi, edges, bucket: (v) => Math.min(n - 1, Math.floor((v - lo) / ((hi - lo) || 1) * n)) };
}
function renderHeat({ width, height, d, P }) {
  const rows = d.rows || [], cols = d.cols || [], vals = d.values || [];
  const b = heatBuckets(vals), left = Math.min(120, 10 + Math.max(...rows.map((r) => String(r).length)) * 6.4);
  const plot = { x0: left, x1: width - 4, y0: 4, y1: height - 40 };
  const cw = (plot.x1 - plot.x0) / cols.length, ch = (plot.y1 - plot.y0) / rows.length, st = labelStep(cols.length, plot.x1 - plot.x0, 28);
  const lw = Math.min(200, plot.x1 - plot.x0);
  return (
    <g>
      {rows.map((r, ri) => <text key={ri} x={plot.x0 - 8} y={plot.y0 + ch * ri + ch / 2} dy="0.32em" textAnchor="end" className="ds-chart__cat">{r}</text>)}
      {cols.map((c, ci) => (ci % st === 0) ? <text key={ci} x={plot.x0 + cw * ci + cw / 2} y={plot.y1 + 14} textAnchor="middle">{c}</text> : null)}
      {vals.map((row, ri) => row.map((v, ci) => {
        const k = b.bucket(v);
        return (
          <g key={ri + '-' + ci} className="ds-chart__mark" {...P.tip(`${rows[ri]} · ${cols[ci]}: ${P.fmt(v)}`)}>
            <rect x={plot.x0 + cw * ci + 1} y={plot.y0 + ch * ri + 1} width={Math.max(1, cw - 2)} height={Math.max(1, ch - 2)} rx="2" fill={`var(--seq-${k + 1})`} />
            {cw > 30 && ch > 18 && <text x={plot.x0 + cw * ci + cw / 2} y={plot.y0 + ch * ri + ch / 2} dy="0.32em" textAnchor="middle" style={{ fill: k >= 3 ? 'var(--bg)' : 'var(--ink)' }}>{P.axisFmt(v)}</text>}
          </g>
        );
      }))}
      <g transform={`translate(${plot.x1 - lw},${height - 14})`}>
        {[0, 1, 2, 3, 4].map((k) => <rect key={k} x={k * lw / 5} y={-6} width={lw / 5 - 2} height={8} rx="2" fill={`var(--seq-${k + 1})`} />)}
        <text x={-6} y={-2} dy="0.32em" textAnchor="end">{P.axisFmt(b.lo)}</text>
        <text x={lw + 4} y={-2} dy="0.32em" textAnchor="start">{P.axisFmt(b.hi)}</text>
      </g>
    </g>
  );
}

export function histBins(d) {
  if (d.bins) return d.bins;
  const v = d.values || [], n = d.binCount || Math.max(4, Math.min(16, Math.round(Math.sqrt(v.length))));
  const lo0 = d.min != null ? d.min : Math.min(...v), hi = d.max != null ? d.max : Math.max(...v);
  const raw = (hi - lo0) / n || 1, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const w = d.binWidth || [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) || raw, lo = Math.floor(lo0 / w) * w;
  const bins = Array.from({ length: Math.max(1, Math.floor((hi - lo) / w) + 1) }, (_, k) => ({ from: lo + k * w, to: lo + (k + 1) * w, count: 0 }));
  v.forEach((x) => { const k = Math.min(bins.length - 1, Math.floor((x - lo) / w)); if (k >= 0) bins[k].count++; });
  return bins;
}
function renderHist({ width, height, d, P }) {
  const bins = histBins(d), ticks = niceTicks(0, Math.max(...bins.map((b) => b.count), 1), 4);
  const plot = { x0: 44, x1: width - 10, y0: 10, y1: height - 24 };
  const y = lin(0, ticks[ticks.length - 1], plot.y1, plot.y0), x = lin(bins[0].from, bins[bins.length - 1].to, plot.x0, plot.x1);
  const edges = bins.map((b) => b.from).concat([bins[bins.length - 1].to]), st = labelStep(edges.length, plot.x1 - plot.x0, 44);
  return (
    <g>
      <YAxis plot={plot} ticks={ticks} y={y} fmt={P.axisFmt} />
      {bins.map((b, k) => <rect key={k} className="ds-chart__mark" tabIndex={0} x={x(b.from) + 0.5} y={y(b.count)} width={Math.max(1, x(b.to) - x(b.from) - 1)} height={Math.max(0, plot.y1 - y(b.count))} fill="var(--viz-1)" {...P.tip(`${P.axisFmt(b.from)}–${P.axisFmt(b.to)}: ${fmtNum(b.count, 0)}`)} />)}
      {edges.map((e, k) => (k % st === 0 || k === edges.length - 1) ? <text key={k} x={x(e)} y={plot.y1 + 16} textAnchor={k === 0 ? 'start' : k === edges.length - 1 ? 'end' : 'middle'}>{P.axisFmt(e)}</text> : null)}
    </g>
  );
}

export function waterfallSteps(d) {
  let run = d.start || 0; const out = [];
  if (d.start != null) out.push({ label: d.startLabel || 'Awal', from: 0, to: run, value: run, kind: 'total' });
  (d.steps || []).forEach((s) => { const from = run; run += s.value; out.push({ label: s.label, from, to: run, value: s.value, kind: s.value >= 0 ? 'up' : 'down' }); });
  out.push({ label: d.endLabel || 'Akhir', from: 0, to: run, value: run, kind: 'total' });
  return out;
}
function renderWaterfall({ width, height, d, P }) {
  const st = waterfallSteps(d), vals = st.flatMap((s) => [s.from, s.to]);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals), 4);
  const plot = { x0: 44, x1: width - 8, y0: 16, y1: height - 24 };
  const y = lin(ticks[0], ticks[ticks.length - 1], plot.y1, plot.y0), band = (plot.x1 - plot.x0) / st.length, bw = Math.max(8, Math.min(44, band * 0.6));
  const xs = st.map((_, i) => plot.x0 + band * i + band / 2);
  const col = (k) => k === 'total' ? 'var(--ink-2)' : P.polarity === 'up-good' ? (k === 'up' ? 'var(--tone-positive)' : 'var(--tone-negative)') : P.polarity === 'up-bad' ? (k === 'up' ? 'var(--tone-negative)' : 'var(--tone-positive)') : (k === 'up' ? 'var(--viz-1)' : 'var(--viz-2)');
  return (
    <g>
      <YAxis plot={plot} ticks={ticks} y={y} fmt={P.axisFmt} />
      {st.map((s, i) => (
        <g key={i}>
          {i > 0 && <line x1={xs[i - 1] + bw / 2} x2={xs[i] - bw / 2} y1={y(st[i - 1].to)} y2={y(st[i - 1].to)} stroke="var(--faint)" strokeDasharray="3 3" />}
          <rect className="ds-chart__mark" tabIndex={0} x={xs[i] - bw / 2} y={Math.min(y(s.from), y(s.to))} width={bw} height={Math.max(1, Math.abs(y(s.to) - y(s.from)))} rx="2" fill={col(s.kind)} {...P.tip(`${s.label}: ${s.kind === 'total' ? P.fmt(s.value) : (s.value >= 0 ? '+' : '−') + P.fmt(Math.abs(s.value))}`)} />
          <text x={xs[i]} y={Math.min(y(s.from), y(s.to)) - 5} textAnchor="middle" className="ds-chart__value">{s.kind === 'total' ? P.axisFmt(s.value) : (s.value >= 0 ? '+' : '−') + P.axisFmt(Math.abs(s.value))}</text>
        </g>
      ))}
      <XLabels labels={st.map((s) => s.label)} xs={xs} plot={plot} width={plot.x1 - plot.x0} />
    </g>
  );
}

export function squarify(items, x, y, w, h) {
  const total = sum(items.map((i) => i.value)) || 1, out = [];
  let rest = items.map((it) => ({ ...it, a: it.value / total * w * h })).sort((a, b) => b.a - a.a);
  const worst = (row, side) => { const s = sum(row.map((r) => r.a)), mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a)); return Math.max(side * side * mx / (s * s), (s * s) / (side * side * mn)); };
  while (rest.length) {
    const side = Math.min(w, h); let row = [rest[0]], k = 1;
    while (k < rest.length && worst(row.concat([rest[k]]), side) <= worst(row, side)) { row.push(rest[k]); k++; }
    const s = sum(row.map((r) => r.a));
    if (w >= h) { const cw = s / h; let cy = y; row.forEach((r) => { const rh = r.a / cw; out.push({ ...r, x, y: cy, w: cw, h: rh }); cy += rh; }); x += cw; w -= cw; }
    else { const rh = s / w; let cx = x; row.forEach((r) => { const rw = r.a / rh; out.push({ ...r, x: cx, y, w: rw, h: rh }); cx += rw; }); y += rh; h -= rh; }
    rest = rest.slice(k);
  }
  return out;
}
function renderTreemap({ width, height, d, P }) {
  const items = d.items || [], groups = [...new Set(items.map((i) => i.group || i.label))], total = sum(items.map((i) => i.value));
  const rects = squarify(items, 0, 0, width, height);
  return (
    <g>
      {rects.map((r, k) => {
        const g = groups.indexOf(r.group || r.label), col = seriesStyle(g).color;
        if (P.hidden.has(g)) return null;
        return (
          <g key={k} className="ds-chart__mark" tabIndex={0} {...P.tip(`${r.label}${r.group ? ' · ' + r.group : ''}: ${P.fmt(r.value)} (${fmtNum(r.value / total * 100)}%)`)}>
            <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} rx="4" fill={`color-mix(in srgb, ${col} 26%, var(--surface))`} stroke={col} strokeWidth="1.2" />
            {r.w > 48 && r.h > 30 && <text x={r.x + 8} y={r.y + 18} className="ds-chart__tmlabel">{clip(r.label, r.w - 14, 6.6)}</text>}
            {r.w > 48 && r.h > 46 && <text x={r.x + 8} y={r.y + 34}>{clip(fmtNum(r.value / total * 100) + '% · ' + P.fmt(r.value), r.w - 14)}</text>}
          </g>
        );
      })}
    </g>
  );
}

const RENDER = {
  bar: (a) => renderBars(a), stacked: (a) => renderBars({ ...a, stacked: true }), line: (a) => renderLine(a), area: (a) => renderLine({ ...a, area: true }),
  pie: (a) => renderPie(a), donut: (a) => renderPie({ ...a, donut: true }), radial: renderRadial, gauge: renderGauge, network: renderNetwork,
  boxplot: renderBox, scatter: (a) => renderScatter(a), bubble: (a) => renderScatter({ ...a, bubble: true }), radar: renderRadar,
  heatmap: renderHeat, histogram: renderHist, waterfall: renderWaterfall, treemap: renderTreemap,
};

/** Legend entries (filterable series) per type. */
function legendOf(type, d) {
  if (['bar', 'stacked', 'line', 'area', 'radar'].includes(type)) return (d.series || []).map((s, i) => ({ i, label: s.name, line: type === 'line' || type === 'area' || type === 'radar' }));
  if (type === 'scatter' || type === 'bubble') return (d.series || []).map((s, i) => ({ i, label: s.name }));
  if (type === 'pie' || type === 'donut') return pieItems(d).map((it) => ({ i: it.i, label: it.label + (it.other ? ` (${it.other})` : ''), color: it.i < 0 ? 'var(--viz-muted)' : undefined, fixed: true }));
  if (type === 'network') return [...new Set((d.nodes || []).map((n) => n.group))].map((g, i) => ({ i, label: g || '—' }));
  if (type === 'treemap') return [...new Set((d.items || []).map((x) => x.group || x.label))].map((g, i) => ({ i, label: g, fixed: !(d.items || []).some((x) => x.group) }));
  if (type === 'radial') return (d.items || []).length > 1 ? d.items.map((it, i) => ({ i, label: it.label + ' · ' + fmtNum(it.value / (it.max || 100) * 100, 0) + '%', fixed: true, line: true, color: it.tone ? `var(--tone-${it.tone})` : undefined })) : [];
  return [];
}

/** Table equivalent of any chart: { columns: [{label, num}], rows: [[...]] }. */
export function chartToTable(type, d, fmt = (v) => fmtNum(v)) {
  const C = (label, num) => ({ label, num });
  switch (type) {
    case 'bar': case 'stacked': case 'line': case 'area': {
      const s = d.series || [];
      const cols = [C(d.categoryLabel || 'Kategori')].concat(s.map((x) => C(x.name, true))).concat(type === 'stacked' ? [C('Total', true)] : []);
      return { columns: cols, rows: (d.categories || []).map((c, ci) => [c].concat(s.map((x) => fmt(x.values[ci]))).concat(type === 'stacked' ? [fmt(sum(s.map((x) => x.values[ci])))] : [])) };
    }
    case 'pie': case 'donut': { const t = sum((d.items || []).map((x) => x.value)) || 1; return { columns: [C('Bagian'), C('Nilai', true), C('Persen', true)], rows: [...d.items].sort((a, b) => b.value - a.value).map((x) => [x.label, fmt(x.value), fmtNum(x.value / t * 100) + '%']) }; }
    case 'radial': return { columns: [C('Indikator'), C('Nilai', true), C('Target', true), C('Capaian', true)], rows: (d.items || [{ label: d.label, value: d.value, max: d.max }]).map((x) => [x.label, fmt(x.value), fmt(x.max || 100), fmtNum(x.value / (x.max || 100) * 100) + '%']) };
    case 'gauge': return { columns: [C('Indikator'), C('Nilai', true), C('Minimum', true), C('Maksimum', true)].concat((d.bands || []).length ? [C('Ambang')] : []), rows: [[d.label || 'Nilai', fmt(d.value), fmt(d.min || 0), fmt(d.max == null ? 100 : d.max)].concat((d.bands || []).length ? [(d.bands || []).map((b) => (b.label || b.tone) + ' ≤ ' + fmt(b.to)).join(' · ')] : [])] };
    case 'network': { const lab = new Map((d.nodes || []).map((n) => [n.id, n.label || n.id])); return { columns: [C('Asal'), C('Tujuan'), C('Relasi'), C('Status')], rows: (d.links || []).map((l) => [lab.get(l.source), lab.get(l.target), l.label || '—', l.inferred ? 'INFERENSI' : 'Tercatat']) }; }
    case 'boxplot': return { columns: [C('Kelompok'), C('n', true), C('Min', true), C('Q1', true), C('Median', true), C('Q3', true), C('Maks', true), C('Pencilan', true)], rows: (d.groups || []).map((g) => { const s = quartiles(g.values); return [g.label, s.n, fmt(s.min), fmt(s.q1), fmt(s.med), fmt(s.q3), fmt(s.max), s.outliers.length]; }) };
    case 'scatter': case 'bubble': return { columns: [C('Titik'), C('Seri'), C(d.xLabel || 'X', true), C(d.yLabel || 'Y', true)].concat(type === 'bubble' ? [C(d.rLabel || 'Ukuran', true)] : []), rows: (d.series || []).flatMap((s) => s.points.map((p, k) => [p.label || '#' + (k + 1), s.name, fmt(p.x), fmt(p.y)].concat(type === 'bubble' ? [fmt(p.r)] : []))) };
    case 'radar': return { columns: [C('Dimensi')].concat((d.series || []).map((s) => C(s.name, true))), rows: (d.axes || []).map((a, k) => [a].concat((d.series || []).map((s) => fmt(s.values[k])))) };
    case 'heatmap': return { columns: [C(d.rowLabel || '')].concat((d.cols || []).map((c) => C(String(c), true))), rows: (d.rows || []).map((r, ri) => [r].concat((d.values[ri] || []).map((v) => fmt(v)))) };
    case 'histogram': return { columns: [C('Rentang'), C('Jumlah', true)], rows: histBins(d).map((b) => [fmt(b.from) + ' – ' + fmt(b.to), fmtNum(b.count, 0)]) };
    case 'waterfall': return { columns: [C('Langkah'), C('Perubahan', true), C('Kumulatif', true)], rows: waterfallSteps(d).map((s) => [s.label, s.kind === 'total' ? '—' : (s.value >= 0 ? '+' : '−') + fmt(Math.abs(s.value)), fmt(s.to)]) };
    case 'treemap': { const t = sum((d.items || []).map((x) => x.value)) || 1; return { columns: [C('Bagian')].concat((d.items || []).some((x) => x.group) ? [C('Kelompok')] : []).concat([C('Nilai', true), C('Persen', true)]), rows: [...(d.items || [])].sort((a, b) => b.value - a.value).map((x) => [x.label].concat((d.items || []).some((y) => y.group) ? [x.group || '—'] : []).concat([fmt(x.value), fmtNum(x.value / t * 100) + '%'])) }; }
    default: return { columns: [], rows: [] };
  }
}

/** Standalone accessible data table for a chart (§39). */
export function ChartTable({ type, data, title, format, className = '' }) {
  const fmt = format || ((v) => fmtNum(v));
  const t = chartToTable(type, data, fmt);
  return (
    <div className={('ds-table-wrap ds-chart-table ' + className).trim()} tabIndex={0} role="region" aria-label={'Tabel data ' + (title || '')}>
      <table className="ds-table">
        {title && <caption className="ds-sr-only">{title}</caption>}
        <thead><tr>{t.columns.map((c, k) => <th key={k} scope="col" className={c.num ? 'num' : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>{t.rows.map((r, ri) => <tr key={ri}>{r.map((v, k) => k === 0 ? <th key={k} scope="row">{v}</th> : <td key={k} className={t.columns[k] && t.columns[k].num ? 'num' : undefined}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Chart({
  type = 'bar', data = {}, title, summary, unit, format, orientation = 'auto', polarity = 'neutral',
  legend = true, tableToggle = true, defaultView = 'chart', minHeight = 180, className = '',
}) {
  const [view, setView] = useState(defaultView);
  const [hidden, setHidden] = useState(() => new Set());
  const [tipOn, tipNode] = useTip();
  const fmt = format || ((v) => fmtNum(v) + (unit ? (unit === '%' ? '%' : ' ' + unit) : ''));
  const P = { fmt, axisFmt: (v) => fmtCompact(v), hidden, tip: tipOn, orientation, polarity };
  const items = legend ? legendOf(type, data) : [];
  const toggle = (i) => setHidden((h) => { const n = new Set(h); n.has(i) ? n.delete(i) : n.add(i); if (n.size >= items.length) return h; return n; });
  const auto = summary || (title ? title + '. ' : '') + 'Grafik ' + type + '; buka tampilan Tabel untuk angka lengkap.';
  const render = RENDER[type];
  return (
    <div className={('ds-chart-frame ' + className).trim()} data-type={type}>
      {(items.length > 0 || tableToggle) && (
        <div className="ds-chart-frame__bar">
          {items.length > 0 && view === 'chart' ? (
            <div className="ds-legend ds-chart__legend" role="group" aria-label="Seri — klik untuk menyembunyikan/menampilkan">
              {items.map((it) => it.fixed
                ? <span key={it.i + it.label} className="ds-legend__item"><Swatch i={Math.max(0, it.i)} line={it.line} color={it.color} />{it.label}</span>
                : <button key={it.i} type="button" className="ds-legend__item ds-legend__toggle" aria-pressed={!hidden.has(it.i)} onClick={() => toggle(it.i)}><Swatch i={it.i} line={it.line} />{it.label}</button>)}
            </div>
          ) : <span className="ds-chart-frame__spacer" />}
          {tableToggle && (
            <div className="ds-seg ds-seg--sm ds-chart-frame__view" role="group" aria-label="Tampilan">
              <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')} aria-label="Grafik" data-ds-tooltip="Grafik"><Icon name="chart-bar" size={14} /><span>Grafik</span></button>
              <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} aria-label="Tabel" data-ds-tooltip="Tabel"><Icon name="table" size={14} /><span>Tabel</span></button>
            </div>
          )}
        </div>
      )}
      {view === 'table'
        ? <ChartTable type={type} data={data} title={title} format={fmt} />
        : <ChartBox minHeight={minHeight} label={auto}>{({ width, height }) => (
            <svg className="ds-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
              {render ? render({ width, height, d: data, P }) : null}
            </svg>
          )}</ChartBox>}
      {tipNode}
    </div>
  );
}
