"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * Keamanan tampilan (DESIGN-SYSTEM.md §42, v1.19).
 * Komponen UI ini TIDAK menggantikan otorisasi sisi server: data yang tidak diizinkan tidak boleh dikirim ke klien
 * hanya untuk disembunyikan via CSS. Label klasifikasi di sini konseptual — kategori resmi mengikuti kebijakan organisasi.
 *
 * Classification        — label klasifikasi monokrom (teks + ikon + tingkat bentuk, bukan warna).
 * ClassificationBanner  — pita klasifikasi layar (atas, stabil, tidak tertutup).
 * MaskedValue           — nilai sensitif termasking; buka hanya bila diizinkan, tercatat (onReveal), tertutup lagi otomatis.
 * Watermark             — tanda air pengguna + waktu di atas area sensitif (aria-hidden, tidak menghalangi klik).
 * SessionTimeout        — dialog sesi akan berakhir (hitung mundur, Perpanjang / Keluar), pesan netral.
 * privacyGuard(opts)    — samarkan area [data-ds-sensitive] saat jendela kehilangan fokus/tersembunyi; judul tab aman.
 * safeTitle(app, page)  — judul tab tanpa isi rahasia: "Nama halaman · Aplikasi".
 */
import { Icon } from './Icon.jsx';
const { useState, useEffect, useRef } = React;

export const CLASSIFICATION = {
  biasa:            { label: 'Biasa',          rank: 0, icon: 'globe-simple' },
  terbatas:         { label: 'Terbatas',       rank: 1, icon: 'lock-simple-open' },
  rahasia:          { label: 'Rahasia',        rank: 2, icon: 'lock-simple' },
  'sangat-rahasia': { label: 'Sangat Rahasia', rank: 3, icon: 'lock-key' },
};

export function Classification({ level = 'terbatas', label, size = 'md', className = '' }) {
  const c = CLASSIFICATION[level] || { label: label || level, rank: 1, icon: 'lock-simple' };
  return (
    <span className={`ds-class ds-class--r${c.rank} ds-class--${size} ${className}`.trim()} aria-label={'Klasifikasi: ' + (label || c.label)}>
      <Icon name={c.icon} size={size === 'sm' ? 11 : 12} />{(label || c.label).toUpperCase()}
    </span>
  );
}

export function ClassificationBanner({ level = 'terbatas', label, note, className = '' }) {
  const c = CLASSIFICATION[level] || { label: label || level, rank: 1, icon: 'lock-simple' };
  return (
    <div className={`ds-class-banner ds-class-banner--r${c.rank} ${className}`.trim()} role="note" aria-label={'Klasifikasi layar: ' + (label || c.label)}>
      <Icon name={c.icon} size={12} /><b>{(label || c.label).toUpperCase()}</b>{note && <span>{note}</span>}
    </div>
  );
}

export function MaskedValue({ value, masked, canReveal = false, reason, onReveal, revealFor = 30, label = 'nilai', className = '' }) {
  const [shown, setShown] = useState(false);
  const [left, setLeft] = useState(0);
  const t = useRef(0);
  useEffect(() => () => clearInterval(t.current), []);
  const mask = masked || (value ? String(value).replace(/[^\s\-.@]/g, '•').replace(/^(.{0,2})/, (m) => String(value).slice(0, m.length)) : '••••');
  const reveal = () => {
    if (!canReveal) return;
    onReveal && onReveal({ label, reason, at: new Date().toISOString() });
    setShown(true); setLeft(revealFor);
    clearInterval(t.current);
    t.current = setInterval(() => setLeft((s) => { if (s <= 1) { clearInterval(t.current); setShown(false); return 0; } return s - 1; }), 1000);
  };
  const hide = () => { clearInterval(t.current); setShown(false); };
  return (
    <span className={('ds-mask ' + (shown ? 'is-shown ' : '') + className).trim()}>
      <span className="ds-mask__value" aria-label={shown ? undefined : label + ' disembunyikan'}>{shown ? value : mask}</span>
      {canReveal
        ? <button type="button" className="ds-mask__btn" onClick={shown ? hide : reveal} aria-label={shown ? 'Sembunyikan ' + label : 'Tampilkan ' + label + ' (tercatat di log audit)'} data-ds-tooltip={shown ? 'Sembunyikan' : 'Tampilkan · tercatat'}>
            <Icon name={shown ? 'eye-slash' : 'eye'} size={14} />{shown && <span className="ds-mask__left">{left} dtk</span>}
          </button>
        : <span className="ds-mask__lock" aria-label="Tidak berizin membuka" data-ds-tooltip="Tidak berizin"><Icon name="lock-simple" size={12} /></span>}
    </span>
  );
}

export function Watermark({ text, className = '' }) {
  const t = text || '';
  return (
    <div className={('ds-watermark ' + className).trim()} aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => <span key={i}>{t}</span>)}
    </div>
  );
}

export function SessionTimeout({ open = true, seconds = 120, onExtend, onLogout, className = '' }) {
  const [left, setLeft] = useState(seconds);
  const btn = useRef(null);
  useEffect(() => { setLeft(seconds); }, [seconds, open]);
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setLeft((s) => { if (s <= 1) { clearInterval(id); onLogout && onLogout('timeout'); return 0; } return s - 1; }), 1000);
    btn.current && btn.current.focus();
    return () => clearInterval(id);
  }, [open]);
  if (!open) return null;
  const mm = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  return (
    <div className={('ds-session ' + className).trim()} role="alertdialog" aria-modal="true" aria-labelledby="ds-session-t" aria-describedby="ds-session-d">
      <div className="ds-modal ds-modal--confirm">
        <div className="ds-modal__head"><div><div className="ds-modal__title" id="ds-session-t">Sesi akan berakhir</div>
          <div className="ds-modal__desc" id="ds-session-d">Demi keamanan, Anda akan keluar otomatis dalam <b className="ds-session__left" aria-live="polite">{mm}</b>. Pekerjaan yang belum disimpan dapat hilang.</div></div></div>
        <div className="ds-modal__foot">
          <button type="button" className="ds-btn ds-btn--md ds-btn--ghost" onClick={() => onLogout && onLogout('user')}>Keluar sekarang</button>
          <button type="button" ref={btn} className="ds-btn ds-btn--md ds-btn--primary" onClick={() => onExtend && onExtend()}>Tetap masuk</button>
        </div>
      </div>
    </div>
  );
}

/** "Halaman · Aplikasi" — never put record names, IDs or content in the tab title. */
export function safeTitle(app, page) { return (page ? page + ' · ' : '') + app; }

/**
 * Blurs every [data-ds-sensitive] area (adds html[data-ds-privacy="hidden"]) when the window loses focus or the tab is
 * hidden, and optionally swaps the tab title to a neutral one. Returns a cleanup function.
 */
export function privacyGuard({ neutralTitle, onBlur } = {}) {
  const root = document.documentElement; let saved = document.title;
  const hide = () => { root.setAttribute('data-ds-privacy', 'hidden'); if (neutralTitle) { saved = document.title; document.title = neutralTitle; } onBlur && onBlur(); };
  const show = () => { root.removeAttribute('data-ds-privacy'); if (neutralTitle) document.title = saved; };
  const vis = () => (document.hidden ? hide() : show());
  window.addEventListener('blur', hide); window.addEventListener('focus', show); document.addEventListener('visibilitychange', vis);
  return () => { window.removeEventListener('blur', hide); window.removeEventListener('focus', show); document.removeEventListener('visibilitychange', vis); show(); };
}
