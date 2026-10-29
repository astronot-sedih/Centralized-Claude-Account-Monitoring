"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * CCTV — CameraTile & CameraGrid (DESIGN-SYSTEM.md §40.3, v1.18).
 *
 * LIVE hanya bila stream sehat menurut cap waktu frame terakhir — bukan status koneksi. Status dihitung:
 *   no_access → NO ACCESS · offline → OFFLINE · replay → REPLAY · buffering → BUFFERING ·
 *   connected & umur frame > staleAfterMs → STALE · connected & segar → LIVE.
 * Setiap tile menampilkan ID kanal, nama, waktu frame terakhir (WIB) + umur, latensi, dan state tekstual + ikon.
 * Tidak berizin: tidak ada frame, tidak ada nama lokasi — pesan netral.
 *
 * CameraTile props: channel { id, name, location? }, state ('connected'|'buffering'|'offline'|'replay'|'no_access'),
 *   lastFrameAt (ISO|ms), now (ms, default Date.now()), staleAfterMs (default 10000), latencyMs, replayAt,
 *   selected, muted, onSelect, onToggleMute, onExpand, children (elemen <video>/<img> nyata), className
 * CameraGrid props: cameras [{ channel, state, lastFrameAt, latencyMs, replayAt }], layout (1|4|9|16), onLayoutChange,
 *   layouts (default [1,4,9,16]), selectedId, onSelect, now, staleAfterMs, page, onPageChange, renderMedia(cam) => node
 */
import { Icon } from './Icon.jsx';
import { IconButton } from './IconButton.jsx';
const { useState } = React;

export const CAMERA_STATE = {
  live:      { label: 'LIVE',       icon: 'broadcast' },
  buffering: { label: 'BUFFERING',  icon: 'circle-notch' },
  stale:     { label: 'STALE',      icon: 'clock-countdown' },
  offline:   { label: 'OFFLINE',    icon: 'plugs' },
  replay:    { label: 'REPLAY',     icon: 'clock-counter-clockwise' },
  no_access: { label: 'NO ACCESS',  icon: 'lock-simple' },
};

export function cameraStatus({ state, lastFrameAt, now = Date.now(), staleAfterMs = 10000 }) {
  if (state === 'no_access') return 'no_access';
  if (state === 'offline') return 'offline';
  if (state === 'replay') return 'replay';
  if (state === 'buffering') return 'buffering';
  const t = lastFrameAt == null ? null : (typeof lastFrameAt === 'number' ? lastFrameAt : Date.parse(lastFrameAt));
  if (t == null || isNaN(t) || now - t > staleAfterMs) return 'stale';
  return 'live';
}
const wib = (t) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':') + ' WIB';
export function frameAge(ms) {
  if (ms == null || isNaN(ms)) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + ' dtk lalu';
  if (s < 3600) return Math.round(s / 60) + ' mnt lalu';
  return Math.round(s / 3600) + ' jam lalu';
}

export function CameraTile({
  channel, state = 'connected', lastFrameAt, now, staleAfterMs = 10000, latencyMs, replayAt,
  selected = false, muted = true, onSelect, onToggleMute, onExpand, children, className = '',
}) {
  const t = now == null ? Date.now() : now;
  const st = cameraStatus({ state, lastFrameAt, now: t, staleAfterMs });
  const meta = CAMERA_STATE[st];
  const lf = lastFrameAt == null ? null : (typeof lastFrameAt === 'number' ? lastFrameAt : Date.parse(lastFrameAt));
  const denied = st === 'no_access';
  const showFrame = !denied && st !== 'offline' && lf != null;
  const name = denied ? 'Kanal terbatas' : channel.name;
  return (
    <article className={'ds-cam ds-cam--' + st + (selected ? ' is-selected' : '') + ' ' + className}
      aria-label={`${channel.id} ${name}, ${meta.label}`} aria-selected={onSelect ? selected : undefined}>
      <button type="button" className="ds-cam__media" onClick={() => onSelect && onSelect(channel.id)} aria-label={`Pilih ${channel.id}`} disabled={!onSelect}>
        {showFrame ? (children || <span className="ds-cam__synthetic" style={{ '--seed': (channel.id.charCodeAt(channel.id.length - 1) % 7) }} aria-hidden="true" />) : null}
        {!showFrame && (
          <span className="ds-cam__empty">
            <Icon name={meta.icon} size={20} />
            <span>{denied ? 'Anda tidak memiliki akses ke kanal ini.' : 'Kanal tidak tersambung.'}</span>
          </span>
        )}
        {st === 'stale' && showFrame && <span className="ds-cam__veil" aria-hidden="true" />}
      </button>
      <div className="ds-cam__top">
        <span className="ds-cam__state">{st !== 'live' && <Icon name={meta.icon} size={12} />}{meta.label}</span>
        <span className="ds-cam__id">{channel.id}</span>
      </div>
      <div className="ds-cam__bar">
        <div className="ds-cam__titles">
          <span className="ds-cam__name">{name}</span>
          <span className="ds-cam__meta">
            {st === 'replay' && replayAt ? 'Rekaman ' + wib(typeof replayAt === 'number' ? replayAt : Date.parse(replayAt))
              : denied ? 'Tidak berizin'
              : lf != null ? 'Frame ' + wib(lf) + ' · ' + frameAge(t - lf) + (st === 'live' && latencyMs != null ? ' · ' + (latencyMs / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' dtk' : '')
              : 'Tanpa frame'}
          </span>
        </div>
        {!denied && st !== 'offline' && (
          <div className="ds-cam__actions">
            {onToggleMute && <IconButton icon={muted ? 'speaker-slash' : 'speaker-high'} size="xs" shape="square" flat label={muted ? 'Nyalakan suara' : 'Bisukan'} onClick={() => onToggleMute(channel.id)} />}
            {onExpand && <IconButton icon="arrows-out" size="xs" shape="square" flat label="Perbesar" onClick={() => onExpand(channel.id)} />}
          </div>
        )}
      </div>
    </article>
  );
}

export function CameraGrid({
  cameras = [], layout, defaultLayout = 4, onLayoutChange, layouts = [1, 4, 9, 16], selectedId, onSelect,
  now, staleAfterMs, renderMedia, label = 'Grid kamera', className = '',
}) {
  const [lyIn, setLy] = useState(defaultLayout);
  const [page, setPage] = useState(0);
  const [selIn, setSel] = useState(null);
  const [mutedSet, setMuted] = useState(() => new Set());
  const ly = layout || lyIn, sel = selectedId !== undefined ? selectedId : selIn;
  const cols = Math.round(Math.sqrt(ly)), pages = Math.max(1, Math.ceil(cameras.length / ly)), pg = Math.min(page, pages - 1);
  const shown = ly === 1 && sel ? cameras.filter((c) => c.channel.id === sel) : cameras.slice(pg * ly, pg * ly + ly);
  const set = (n) => { if (!layout) setLy(n); setPage(0); onLayoutChange && onLayoutChange(n); };
  const pick = (id) => { if (selectedId === undefined) setSel(id); onSelect && onSelect(id); };
  const counts = cameras.reduce((m, c) => { const s = cameraStatus({ ...c, now: now == null ? Date.now() : now, staleAfterMs }); m[s] = (m[s] || 0) + 1; return m; }, {});
  return (
    <div className={('ds-camgrid ' + className).trim()}>
      <div className="ds-camgrid__bar">
        <div className="ds-seg" role="group" aria-label="Tata letak grid">
          {layouts.map((n) => <button key={n} type="button" aria-pressed={ly === n} onClick={() => set(n)}>{Math.sqrt(n) + '×' + Math.sqrt(n)}</button>)}
        </div>
        <span className="ds-camgrid__summary">{['live', 'stale', 'buffering', 'offline', 'replay', 'no_access'].filter((k) => counts[k]).map((k) => CAMERA_STATE[k].label + ' ' + counts[k]).join(' · ')}</span>
        {pages > 1 && !(ly === 1 && sel) && (
          <span className="ds-camgrid__pager">
            <IconButton icon="caret-left" size="sm" shape="square" label="Kelompok sebelumnya" disabled={pg === 0} onClick={() => setPage(pg - 1)} />
            <span className="ds-camgrid__page">{pg + 1}/{pages}</span>
            <IconButton icon="caret-right" size="sm" shape="square" label="Kelompok berikutnya" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} />
          </span>
        )}
      </div>
      <div className="ds-camgrid__tiles" role="group" aria-label={label} style={{ '--cols': cols }}>
        {shown.map((c) => (
          <CameraTile key={c.channel.id} {...c} now={now} staleAfterMs={staleAfterMs} selected={sel === c.channel.id}
            muted={!mutedSet.has(c.channel.id)} onSelect={pick}
            onToggleMute={(id) => setMuted((m) => { const n = new Set(m); n.has(id) ? n.delete(id) : n.add(id); return n; })}
            onExpand={(id) => { pick(id); set(1); }}>
            {renderMedia ? renderMedia(c) : null}
          </CameraTile>
        ))}
      </div>
    </div>
  );
}
