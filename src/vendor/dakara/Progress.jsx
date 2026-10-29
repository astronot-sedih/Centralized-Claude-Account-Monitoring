"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Progress & Transfer — DESIGN-SYSTEM.md §38 (v1.16).
 *
 * ProgressBar  — determinate / indeterminate bar. Track neutral, fill = one process accent
 *                (`--progress-fill`); success only after final verification; paused / error tones.
 *                Value always also shown as text; no aria-valuenow when indeterminate.
 * TransferItem — one loading / upload / download / export operation, rendered from the backend
 *                data contract (backend is the source of truth; the UI only represents it).
 * formatBytes  — "680 MB", "1,2 GB" (id-ID).
 *
 * Data contract (operation):
 *   operation_id, operation_type ('upload'|'download'|'export'|'load'), object_label_safe,
 *   phase (free text, e.g. 'Memindai berkas'), total_bytes (nullable), processed_bytes (nullable),
 *   status ('queued'|'running'|'verifying'|'processing'|'paused'|'retrying'|'failed'|'completed'|'cancelled'),
 *   updated_at (ISO), supports_pause, supports_cancel, retryable, error_message_safe,
 *   + optional: queue_position, eta_seconds + eta_reliable, result_label, completed_at, integrity ('verified'|null)
 */
import { Icon } from './Icon.jsx';
import { IconButton } from './IconButton.jsx';
const { useRef, useEffect, useState } = React;

const NUM = (n, d = 0) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 });

export function formatBytes(n) {
  if (n == null || isNaN(n)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = Number(n);
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return NUM(v, v < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
}

/** "680 dari 1.000 MB" — both values in the unit of the total. */
export function formatBytesOf(done, total) {
  if (total == null) return done == null ? '' : formatBytes(done) + ' diproses';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  // unit of the total, but keep ≥ 10 units so values stay whole numbers ("680 dari 1.000 MB")
  let i = 0, t = Number(total);
  while (t / 1000 >= 10 && i < u.length - 1) { t /= 1000; i++; }
  const d = Number(done || 0) / Math.pow(1000, i);
  const dec = 0;
  return NUM(d, dec) + ' dari ' + NUM(t, dec) + ' ' + u[i];
}

function formatEta(s) {
  if (s == null) return '';
  if (s < 60) return '±' + Math.max(1, Math.round(s)) + ' dtk lagi';
  if (s < 3600) return '±' + Math.round(s / 60) + ' mnt lagi';
  return '±' + NUM(s / 3600, 1) + ' jam lagi';
}

export function ProgressBar({
  value, max = 100, indeterminate, label, valueText,
  status = 'active', size = 'md', showValue = true, showLabel = true, className = '',
}) {
  const indet = indeterminate || value == null;
  const pct = indet ? null : Math.max(0, Math.min(100, (Number(value) / (max || 100)) * 100));
  const txt = valueText != null ? valueText : (indet ? '' : NUM(Math.floor(pct)) + '%');
  const cls = ['ds-pbar', 'ds-pbar--' + status, size === 'sm' ? 'ds-pbar--sm' : '', indet ? 'ds-pbar--indeterminate' : '', className].filter(Boolean).join(' ');
  const aria = indet
    ? { 'aria-label': label, 'aria-valuetext': valueText || undefined }
    : { 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.floor(pct), 'aria-valuetext': (label ? label + ', ' : '') + (valueText || NUM(Math.floor(pct)) + ' persen') };
  return (
    <div className={cls}>
      {(showLabel && label) || (showValue && txt) ? (
        <div className="ds-pbar__head">
          {showLabel && label ? <span className="ds-pbar__label">{label}</span> : <span />}
          {showValue && txt ? <span className="ds-pbar__value">{txt}</span> : null}
        </div>
      ) : null}
      <div className="ds-pbar__track" role="progressbar" {...aria}>
        <span className="ds-pbar__fill" style={indet ? undefined : { width: pct + '%' }} />
      </div>
    </div>
  );
}

const VERB = { upload: 'MENGUNGGAH', download: 'MENGUNDUH', export: 'MENGEKSPOR', load: 'MEMUAT' };
const NOUN = { upload: 'Mengunggah', download: 'Mengunduh', export: 'Mengekspor', load: 'Memuat' };
const ICON = { upload: 'upload-simple', download: 'download-simple', export: 'export', load: 'database' };

export const TRANSFER_STATE = {
  queued:     { label: 'MENUNGGU',       tone: 'idle',    icon: 'hourglass-medium' },
  running:    { label: null,             tone: 'active',  icon: null },
  verifying:  { label: 'MEMVERIFIKASI',  tone: 'active',  icon: 'shield-check' },
  processing: { label: 'MEMPROSES',      tone: 'active',  icon: 'gear-six' },
  paused:     { label: 'DIJEDA',         tone: 'paused',  icon: 'pause-circle' },
  retrying:   { label: 'MENCOBA ULANG',  tone: 'paused',  icon: 'arrow-clockwise' },
  failed:     { label: 'GAGAL',          tone: 'error',   icon: 'warning-circle' },
  completed:  { label: 'SELESAI',        tone: 'success', icon: 'check-circle' },
  cancelled:  { label: 'DIBATALKAN',     tone: 'idle',    icon: 'prohibit' },
};

function timeOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(':', '.') + ' WIB';
}

export function TransferItem({ operation: op, onPause, onResume, onCancel, onRetry, onOpen, className = '' }) {
  const type = op.operation_type || 'upload';
  const st = TRANSFER_STATE[op.status] || TRANSFER_STATE.running;
  const label = st.label || VERB[type];
  const known = op.total_bytes != null && op.processed_bytes != null && op.total_bytes > 0;
  const pct = known ? Math.min(100, (op.processed_bytes / op.total_bytes) * 100) : null;

  // bar: determinate only for running/paused/retrying with known total; verify/process = indeterminate; done = 100
  let bar = null;
  if (op.status === 'completed') bar = { value: 100, status: 'success', valueText: '100%' };
  else if (op.status === 'running' || op.status === 'paused' || op.status === 'retrying')
    bar = known ? { value: pct, status: op.status === 'running' ? 'active' : 'paused' } : { indeterminate: true, status: 'active' };
  else if (op.status === 'verifying' || op.status === 'processing') bar = { indeterminate: true, status: 'active', valueText: '' };
  else if (op.status === 'failed' && known) bar = { value: pct, status: 'error' };

  const meta = [];
  if (op.status === 'queued') meta.push(op.queue_position ? 'Antrian ke-' + op.queue_position + ' · belum dimulai' : 'Belum dimulai');
  else if (op.status === 'verifying' || op.status === 'processing') meta.push(op.phase || (op.status === 'verifying' ? 'Memeriksa integritas berkas' : 'Memproses di server'), known ? formatBytes(op.total_bytes) + ' terkirim' : '');
  else if (op.status === 'completed') meta.push(op.integrity === 'verified' ? 'Terverifikasi' : 'Selesai', formatBytes(op.total_bytes), op.completed_at ? timeOf(op.completed_at) : '');
  else if (op.status === 'cancelled') meta.push('Dibatalkan ' + timeOf(op.updated_at), op.phase || '');
  else {
    meta.push(NOUN[type], known ? formatBytesOf(op.processed_bytes, op.total_bytes) : (op.processed_bytes != null ? formatBytes(op.processed_bytes) + ' · total belum diketahui' : ''));
    if (op.status === 'running' && op.eta_reliable && op.eta_seconds != null) meta.push(formatEta(op.eta_seconds));
    if (op.status === 'paused') meta.push('Dijeda ' + timeOf(op.updated_at));
  }

  // live announcements: status changes + 25/50/75% milestones, never every 1%
  const [announce, setAnnounce] = useState('');
  const last = useRef({ status: op.status, step: known ? Math.floor(pct / 25) : 0 });
  useEffect(() => {
    const step = known ? Math.floor(pct / 25) : 0;
    const name = (op.object_label_safe || 'Berkas');
    if (op.status !== last.current.status) {
      setAnnounce(name + ': ' + (TRANSFER_STATE[op.status]?.label || VERB[type]).toLowerCase() + (op.status === 'failed' && op.error_message_safe ? '. ' + op.error_message_safe : ''));
    } else if (op.status === 'running' && step > last.current.step && step < 4) {
      setAnnounce(name + ': ' + NOUN[type].toLowerCase() + ', ' + step * 25 + ' persen');
    }
    last.current = { status: op.status, step };
  }, [op.status, pct]);

  const acts = [];
  if (op.status === 'running' && op.supports_pause && onPause) acts.push(<IconButton key="p" icon="pause" size="sm" shape="square" label="Jeda" onClick={() => onPause(op)} />);
  if ((op.status === 'paused') && op.supports_pause && onResume) acts.push(<IconButton key="r" icon="play" size="sm" shape="square" label="Lanjutkan" onClick={() => onResume(op)} />);
  if (op.status === 'failed' && op.retryable && onRetry) acts.push(<button key="rt" type="button" className="ds-btn ds-btn--sm ds-btn--secondary" onClick={() => onRetry(op)}><Icon name="arrow-clockwise" size={14} />Coba lagi</button>);
  if (op.status === 'completed' && onOpen) acts.push(<button key="o" type="button" className="ds-btn ds-btn--sm ds-btn--secondary" onClick={() => onOpen(op)}>{op.result_label || 'Buka'}</button>);
  if (['queued', 'running', 'paused', 'retrying', 'failed'].includes(op.status) && op.supports_cancel && onCancel)
    acts.push(<IconButton key="c" icon="x" size="sm" shape="square" label={op.status === 'failed' ? 'Hapus dari daftar' : 'Batalkan'} onClick={() => onCancel(op)} />);

  const pctText = bar && !bar.indeterminate ? NUM(Math.floor(bar.value)) + '%' : '';
  return (
    <div className={('ds-transfer ds-transfer--' + st.tone + ' ' + className).trim()} data-status={op.status}>
      <span className="ds-transfer__tile" aria-hidden="true"><Icon name={ICON[type] || 'file'} size={18} /></span>
      <div className="ds-transfer__main">
        <div className="ds-transfer__row">
          <span className="ds-transfer__name" title={op.object_label_safe}>{op.object_label_safe}</span>
          <span className="ds-transfer__state">{st.icon && <Icon name={st.icon} size={12} />}{label}</span>
          {pctText && <span className="ds-transfer__pct">{pctText}</span>}
        </div>
        <div className="ds-transfer__meta">{meta.filter(Boolean).join(' · ')}</div>
        {bar && <ProgressBar {...bar} size="sm" showLabel={false} showValue={false}
          label={(NOUN[type] + ' ' + (op.object_label_safe || 'berkas'))} valueText={bar.indeterminate ? (TRANSFER_STATE[op.status]?.label || '').toLowerCase() : undefined} />}
        {op.status === 'failed' && op.error_message_safe && <div className="ds-transfer__error"><Icon name="warning-circle" size={14} />{op.error_message_safe}</div>}
        {op.status === 'retrying' && op.error_message_safe && <div className="ds-transfer__note">{op.error_message_safe}</div>}
      </div>
      {acts.length > 0 && <div className="ds-transfer__actions">{acts}</div>}
      <span className="ds-sr-only" role="status" aria-live="polite">{announce}</span>
    </div>
  );
}
