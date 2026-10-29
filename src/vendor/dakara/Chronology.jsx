"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Chronology — diagram kronologi peristiwa (DESIGN-SYSTEM.md §40.5, v1.18).
 *
 * Kedekatan waktu dan panah BUKAN klaim sebab-akibat. Empat jenis relasi dibedakan dan selalu berlabel:
 *   PRECEDES (urutan waktu, garis penuh tipis) · EVIDENCED_RELATION (keterkaitan berbukti, garis penuh tebal) ·
 *   VERIFIES (pemeriksaan, garis penuh + ikon centang) · HYPOTHESIS (garis putus + label INFERENSI).
 * Status node: OBSERVASI · LAPORAN · TERVERIFIKASI · TERCATAT · INFERENSI (teks + ikon, monokrom).
 * Diagram (lajur × urutan waktu) ↔ Urutan teks (daftar linier, otomatis < 640px). Urut: waktu terjadi / waktu diterima.
 *
 * event: { id, time, recorded_at?, approx?, title, type?, state, lane?, source?, evidence?: [{id,label,acquired_at}],
 *          validator?, version?, note? }
 * relation: { from, to, type, label? }
 */
import { Icon } from './Icon.jsx';
import { observeChartSize } from './ChartBox.jsx';
const { useState, useRef, useLayoutEffect } = React;

export const EVENT_STATE = {
  observasi:     { label: 'OBSERVASI',     icon: 'eye' },
  laporan:       { label: 'LAPORAN',       icon: 'file-text' },
  terverifikasi: { label: 'TERVERIFIKASI', icon: 'seal-check' },
  tercatat:      { label: 'TERCATAT',      icon: 'note-pencil' },
  inferensi:     { label: 'INFERENSI',     icon: 'lightbulb' },
};
export const RELATION_TYPE = {
  PRECEDES:           { label: '',               desc: 'urutan waktu (garis tipis, tanpa klaim keterkaitan)' },
  EVIDENCED_RELATION: { label: 'berbukti',       desc: 'keterkaitan didukung sumber' },
  VERIFIES:           { label: 'memverifikasi',  desc: 'pemeriksaan' },
  HYPOTHESIS:         { label: 'INFERENSI',      desc: 'hipotesis analis — bukan temuan' },
};
const hhmm = (t) => { const d = new Date(t); return isNaN(d) ? String(t || '') : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }); };
const dfull = (t) => { const d = new Date(t); return isNaN(d) ? String(t || '') : d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB'; };

function Node({ e, sel, onSelect, style }) {
  const st = EVENT_STATE[e.state] || EVENT_STATE.tercatat;
  return (
    <button type="button" className={'ds-chrono__node ds-chrono__node--' + e.state + (sel ? ' is-selected' : '')} style={style}
      aria-pressed={sel} onClick={() => onSelect && onSelect(e.id)}
      aria-label={`${e.id}, ${dfull(e.time)}${e.approx ? ' (perkiraan)' : ''}, ${e.title}, ${st.label}`}>
      <span className="ds-chrono__nhead"><b>{e.id}</b><time>{e.approx ? '±' : ''}{hhmm(e.time)} WIB</time></span>
      <span className="ds-chrono__ntitle">{e.title}</span>
      <span className="ds-chrono__state"><Icon name={st.icon} size={11} />{st.label}</span>
    </button>
  );
}

export function Chronology({ events = [], relations = [], selected, onSelect, defaultView = 'auto', title = 'Kronologi', className = '' }) {
  const [sortBy, setSortBy] = useState('time');
  const [view, setView] = useState(defaultView);
  const [w, setW] = useState(0);
  const ref = useRef(null);
  useLayoutEffect(() => (ref.current ? observeChartSize(ref.current, (s) => setW(s.width)) : undefined), []);
  const key = (e) => Date.parse(sortBy === 'recorded' ? (e.recorded_at || e.time) : e.time);
  const order = [...events].sort((a, b) => key(a) - key(b));
  const mode = view === 'auto' ? (w && w < 640 ? 'list' : 'graph') : view;
  const lanes = Math.max(1, ...events.map((e) => (e.lane || 0) + 1));
  // columns: after every incoming relation's source and after the previous event in the same lane (time order)
  const col = new Map(), laneLast = {};
  order.forEach((e) => {
    let c = laneLast[e.lane || 0] != null ? laneLast[e.lane || 0] + 1 : 0;
    relations.filter((r) => r.to === e.id && col.has(r.from)).forEach((r) => { c = Math.max(c, col.get(r.from) + 1); });
    col.set(e.id, c); laneLast[e.lane || 0] = c;
  });
  const ncol = Math.max(1, ...[...col.values()].map((c) => c + 1));
  const NH = 96, GX = 72, GY = 30, PAD = 16;
  const NW = Math.max(140, Math.min(200, Math.floor(((w || 900) - PAD * 2 - (ncol - 1) * GX) / ncol)));
  const gw = Math.max(w || 0, PAD * 2 + ncol * NW + (ncol - 1) * GX), gh = PAD * 2 + lanes * NH + (lanes - 1) * GY;
  const pos = (e) => ({ x: PAD + col.get(e.id) * (NW + GX), y: PAD + (e.lane || 0) * (NH + GY) });
  const byId = new Map(events.map((e) => [e.id, e]));

  return (
    <div className={('ds-chrono ' + className).trim()} ref={ref}>
      <div className="ds-chrono__bar">
        <div className="ds-seg" role="group" aria-label="Urutkan menurut">
          <button type="button" aria-pressed={sortBy === 'time'} onClick={() => setSortBy('time')}>Waktu kejadian</button>
          <button type="button" aria-pressed={sortBy === 'recorded'} onClick={() => setSortBy('recorded')}>Waktu diterima</button>
        </div>
        <div className="ds-seg" role="group" aria-label="Tampilan">
          <button type="button" aria-pressed={mode === 'graph'} onClick={() => setView('graph')} aria-label="Diagram" data-ds-tooltip="Diagram"><Icon name="flow-arrow" size={14} /><span>Diagram</span></button>
          <button type="button" aria-pressed={mode === 'list'} onClick={() => setView('list')} aria-label="Urutan teks" data-ds-tooltip="Urutan teks"><Icon name="list-numbers" size={14} /><span>Urutan</span></button>
        </div>
        {mode === 'graph' && <span className="ds-chrono__legend">
          <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="var(--faint)" strokeWidth="1.4" /></svg>urutan waktu</span>
          <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="currentColor" strokeWidth="2" /></svg>berbukti / verifikasi</span>
          <span><svg width="26" height="8"><line x1="0" y1="4" x2="26" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" /></svg>inferensi</span>
        </span>}
      </div>

      {mode === 'graph' ? (
        <div className="ds-chrono__scroll" tabIndex={0} role="group" aria-label={title + ' — diagram; gunakan tampilan Urutan untuk pembacaan linier'}>
          <div className="ds-chrono__canvas" style={{ width: gw, height: gh }}>
            <svg className="ds-chrono__links" width={gw} height={gh} aria-hidden="true">
              <defs><marker id="ds-chrono-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8Z" fill="var(--ink-2)" /></marker></defs>
              {relations.map((r, k) => {
                const a = byId.get(r.from), b = byId.get(r.to); if (!a || !b) return null;
                const pa = pos(a), pb = pos(b), back = col.get(b.id) < col.get(a.id);
                const x1 = back ? pa.x : pa.x + NW, y1 = pa.y + NH / 2, x2 = back ? pb.x + NW : pb.x, y2 = pb.y + NH / 2;
                const dx = Math.max(24, Math.abs(x2 - x1) / 2) * (back ? -1 : 1);
                const hyp = r.type === 'HYPOTHESIS', strong = r.type === 'EVIDENCED_RELATION' || r.type === 'VERIFIES';
                const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, lab = r.label || RELATION_TYPE[r.type]?.label || '';
                return (
                  <g key={k} className={'ds-chrono__link ds-chrono__link--' + r.type.toLowerCase()}>
                    <path d={`M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`} fill="none" strokeWidth={strong ? 2 : 1.4} strokeDasharray={hyp ? '5 4' : undefined} markerEnd="url(#ds-chrono-arrow)" />
                    {lab && <g transform={`translate(${mx},${my})`}><rect x={-(lab.length * 3.1 + 7)} y="-8" width={lab.length * 6.2 + 14} height="16" rx="4" className="ds-chrono__lbg" /><text textAnchor="middle" dy="0.34em" className={hyp ? 'is-hyp' : ''}>{lab}</text></g>}
                  </g>
                );
              })}
            </svg>
            {order.map((e) => { const p = pos(e); return <Node key={e.id} e={e} sel={selected === e.id} onSelect={onSelect} style={{ left: p.x, top: p.y, width: NW, height: NH }} />; })}
          </div>
        </div>
      ) : (
        <ol className="ds-chrono__list" aria-label={title + ' — urutan ' + (sortBy === 'time' ? 'waktu kejadian' : 'waktu diterima')}>
          {order.map((e) => {
            const out = relations.filter((r) => r.from === e.id), st = EVENT_STATE[e.state] || EVENT_STATE.tercatat;
            return (
              <li key={e.id} className={'ds-chrono__li' + (e.state === 'inferensi' ? ' is-hyp' : '')}>
                <span className="ds-chrono__rail" aria-hidden="true"><Icon name={st.icon} size={12} /></span>
                <div className="ds-chrono__libody">
                  <Node e={e} sel={selected === e.id} onSelect={onSelect} />
                  {out.length > 0 && (
                    <ul className="ds-chrono__rels">
                      {out.map((r, k) => <li key={k} className={r.type === 'HYPOTHESIS' ? 'is-hyp' : ''}><Icon name={r.type === 'HYPOTHESIS' ? 'arrow-bend-down-right' : 'arrow-right'} size={12} /><b>{r.to}</b>{(r.label || RELATION_TYPE[r.type]?.label || 'sesudahnya')}{r.type === 'HYPOTHESIS' ? ' — bukan temuan' : ''}</li>)}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Evidence/metadata panel for the selected event (permission-filtered data only). */
export function ChronologyDetail({ event: e, relations = [], className = '' }) {
  if (!e) return <aside className={'ds-chrono-detail ds-chrono-detail--empty ' + className}><Icon name="cursor-click" size={18} />Pilih peristiwa untuk melihat bukti.</aside>;
  const st = EVENT_STATE[e.state] || EVENT_STATE.tercatat;
  const rel = relations.filter((r) => r.from === e.id || r.to === e.id);
  return (
    <aside className={'ds-chrono-detail ' + className} aria-label={'Bukti ' + e.id}>
      <div className="ds-chrono-detail__head"><b>{e.id}</b><span className="ds-chrono__state"><Icon name={st.icon} size={11} />{st.label}</span></div>
      <h3 className="ds-chrono-detail__title">{e.title}</h3>
      <dl className="ds-kv-list">
        <div><dt>Waktu kejadian</dt><dd>{(e.approx ? '± ' : '') + dfull(e.time)}</dd></div>
        {e.recorded_at && <div><dt>Waktu diterima</dt><dd>{dfull(e.recorded_at)}</dd></div>}
        {e.source && <div><dt>Sumber</dt><dd>{e.source}</dd></div>}
        {e.validator && <div><dt>Pengesah</dt><dd>{e.validator}</dd></div>}
        {e.version && <div><dt>Versi</dt><dd>{e.version}</dd></div>}
      </dl>
      {e.evidence && e.evidence.length > 0 && (
        <div className="ds-chrono-detail__sec"><span className="ds-chrono-detail__label">Bukti</span>
          <ul className="ds-chrono-detail__ev">{e.evidence.map((v) => <li key={v.id}><Icon name="paperclip" size={14} /><span><b>{v.id}</b> {v.label}</span><time>{v.acquired_at ? dfull(v.acquired_at) : ''}</time></li>)}</ul></div>
      )}
      {rel.length > 0 && (
        <div className="ds-chrono-detail__sec"><span className="ds-chrono-detail__label">Relasi</span>
          <ul className="ds-chrono-detail__ev">{rel.map((r, k) => <li key={k} className={r.type === 'HYPOTHESIS' ? 'is-hyp' : ''}><Icon name={r.type === 'HYPOTHESIS' ? 'lightbulb' : 'link-simple'} size={14} /><span><b>{r.from} → {r.to}</b> {r.label || RELATION_TYPE[r.type]?.label || 'urutan waktu'}</span><code>{r.type}</code></li>)}</ul></div>
      )}
      {e.note && <p className="ds-chrono-detail__note"><Icon name="clock-counter-clockwise" size={14} />{e.note}</p>}
    </aside>
  );
}
