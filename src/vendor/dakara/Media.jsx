"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Media — MediaCard & MediaPreview (DESIGN-SYSTEM.md §40.2, v1.18).
 *
 * Jenis media dibedakan lewat ikon + label, bukan warna kartu. Akses:
 *   'full'       — thumbnail & pratinjau tampil
 *   'restricted' — pratinjau tersensor (tanpa memuat gambar asli), metadata terbatas, aksi dinonaktifkan
 *   'none'       — tanpa thumbnail & tanpa judul asli: "Konten terbatas" (tidak mengungkap isi)
 *
 * item: { id, type: 'photo'|'video'|'audio'|'document', title, thumb?, duration?, pages?, size?, format?,
 *         source?, owner?, time?, classification?, version?, access?, caption?, transcript?, alt? }
 */
import { Icon } from './Icon.jsx';
import { Classification } from './Security.jsx';
const { useState } = React;

export const MEDIA_TYPE = {
  photo: { label: 'Foto', icon: 'image' },
  video: { label: 'Video', icon: 'video-camera' },
  audio: { label: 'Audio', icon: 'waveform' },
  document: { label: 'Dokumen', icon: 'file-text' },
};
const mmss = (s) => s == null ? '' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

function Thumb({ item, big }) {
  const access = item.access || 'full', T = MEDIA_TYPE[item.type] || MEDIA_TYPE.document;
  if (access !== 'full') return (
    <span className={'ds-media__thumb ds-media__thumb--locked' + (big ? ' is-big' : '')}>
      <Icon name={access === 'none' ? 'lock-simple' : 'eye-slash'} size={big ? 24 : 18} />
      <span>{access === 'none' ? 'Tidak ada akses' : 'Pratinjau disensor'}</span>
    </span>
  );
  return (
    <span className={'ds-media__thumb ds-media__thumb--' + item.type + (big ? ' is-big' : '')}>
      {item.thumb ? <img src={item.thumb} alt={item.alt || ''} /> : <span className="ds-media__synthetic" aria-hidden="true" />}
      {item.type === 'audio' && <svg className="ds-media__wave" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">{Array.from({ length: 30 }, (_, i) => { const h = 6 + Math.abs(Math.sin(i * 1.7 + (item.id || '').length)) * 22; return <rect key={i} x={i * 4} y={16 - h / 2} width="2.4" height={h} rx="1" />; })}</svg>}
      {item.type === 'video' && <span className="ds-media__play" aria-hidden="true"><Icon name="play" weight="fill" size={big ? 20 : 14} /></span>}
      {item.type === 'document' && <span className="ds-media__page" aria-hidden="true"><span /><span /><span /><span /></span>}
      {(item.type === 'video' || item.type === 'audio') && item.duration != null && <span className="ds-media__dur">{mmss(item.duration)}</span>}
    </span>
  );
}

export function MediaCard({ item, selected = false, onOpen, className = '' }) {
  const access = item.access || 'full', T = MEDIA_TYPE[item.type] || MEDIA_TYPE.document;
  const title = access === 'none' ? 'Konten terbatas' : item.title;
  const meta = access === 'none' ? [T.label] : [T.label, item.format, item.type === 'document' && item.pages ? item.pages + ' hlm' : null, item.size].filter(Boolean);
  return (
    <button type="button" className={'ds-media' + (selected ? ' is-selected' : '') + (access !== 'full' ? ' is-locked' : '') + ' ' + className}
      aria-pressed={selected} onClick={() => onOpen && onOpen(item)} aria-label={`${T.label}: ${title}${access !== 'full' ? ', akses terbatas' : ''}`}>
      <Thumb item={item} />
      <span className="ds-media__body">
        <span className="ds-media__type"><Icon name={T.icon} size={14} />{T.label}</span>
        <span className="ds-media__title" title={title}>{title}</span>
        <span className="ds-media__meta">{meta.slice(1).join(' · ') || ' '}</span>
      </span>
    </button>
  );
}

export function MediaPreview({ item, onDownload, onClose, className = '' }) {
  const [playing, setPlaying] = useState(false);
  const [cc, setCc] = useState(true);
  const [tx, setTx] = useState(false);
  if (!item) return <div className={'ds-media-preview ds-media-preview--empty ' + className}><Icon name="cursor-click" size={20} />Pilih item untuk melihat pratinjau.</div>;
  const access = item.access || 'full', T = MEDIA_TYPE[item.type] || MEDIA_TYPE.document, ok = access === 'full';
  const rows = access === 'none'
    ? [['Jenis', T.label], ['Akses', 'Tidak berizin — minta akses ke pemilik data']]
    : [['Jenis', T.label + (item.format ? ' · ' + item.format : '')], ['Sumber', item.source], ['Pemilik', item.owner], ['Waktu', item.time], ['Versi', item.version], ['Ukuran', item.size], item.type === 'document' ? ['Halaman', item.pages] : null, (item.type === 'video' || item.type === 'audio') ? ['Durasi', mmss(item.duration)] : null, ['Izin', ok ? 'Lihat · unduh berizin' : 'Lihat ringkasan saja']].filter((r) => r && r[1] != null && r[1] !== '');
  return (
    <aside className={'ds-media-preview ' + className} aria-label={'Pratinjau ' + (access === 'none' ? 'konten terbatas' : item.title)}>
      <div className="ds-media-preview__head">
        <span className="ds-media__type"><Icon name={T.icon} size={14} />{T.label}</span>
        {item.classification && <Classification level={item.classification} size="sm" />}
        {onClose && <button type="button" className="ds-iconbtn ds-iconbtn--sm ds-iconbtn--flat ds-iconbtn--square" aria-label="Tutup pratinjau" onClick={onClose}><Icon name="x" size={14} /></button>}
      </div>
      <Thumb item={item} big />
      {ok && (item.type === 'video' || item.type === 'audio') && (
        <div className="ds-player" role="group" aria-label={'Kontrol ' + T.label.toLowerCase()}>
          <button type="button" className="ds-iconbtn ds-iconbtn--sm ds-iconbtn--square" aria-label={playing ? 'Jeda' : 'Putar'} onClick={() => setPlaying(!playing)}><Icon name={playing ? 'pause' : 'play'} size={14} /></button>
          <span className="ds-player__time">0:00 / {mmss(item.duration)}</span>
          <span className="ds-player__track"><span style={{ width: '0%' }} /></span>
          {item.type === 'video' && <button type="button" className="ds-iconbtn ds-iconbtn--sm ds-iconbtn--square" aria-pressed={cc} aria-label="Teks terjemahan (caption)" onClick={() => setCc(!cc)}><Icon name="closed-captioning" size={14} /></button>}
          <button type="button" className="ds-iconbtn ds-iconbtn--sm ds-iconbtn--square" aria-label="Volume"><Icon name="speaker-high" size={14} /></button>
        </div>
      )}
      <h3 className="ds-media-preview__title">{access === 'none' ? 'Konten terbatas' : item.title}</h3>
      {ok && item.caption && <p className="ds-media-preview__caption">{item.caption}</p>}
      <dl className="ds-kv-list">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {ok && item.transcript && (
        <div className="ds-media-preview__transcript">
          <button type="button" className="ds-media-preview__toggle" aria-expanded={tx} aria-controls={'tx-' + item.id} onClick={() => setTx(!tx)}><Icon name="caret-down" size={12} className="ds-media-preview__caret" />Transkrip</button>
          <div className="ds-collapse" data-state={tx ? 'open' : 'closed'} id={'tx-' + item.id}><div><p>{item.transcript}</p></div></div>
        </div>
      )}
      <div className="ds-media-preview__actions">
        {ok && onDownload && <button type="button" className="ds-btn ds-btn--sm ds-btn--secondary" onClick={() => onDownload(item)}><Icon name="download-simple" size={14} />Unduh berizin</button>}
        {!ok && <button type="button" className="ds-btn ds-btn--sm ds-btn--secondary"><Icon name="key" size={14} />Minta akses</button>}
      </div>
    </aside>
  );
}
