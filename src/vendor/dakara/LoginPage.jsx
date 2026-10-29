"use client";

// The upstream bundle is UMD and reads a global `React`; under a bundler it
// must be imported. Kept as a default import so the destructuring below works
// unchanged, keeping these files a verbatim copy in every other respect.
import React from "react";

/**
 * LoginPage — halaman masuk terpusat (§37.5).
 * Kartu 420–480px di tengah horizontal; logo resmi + nama aplikasi; username + password dengan toggle;
 * error tekstual di atas form; tombol Masuk primer penuh; label klasifikasi & bantuan di kaki kartu.
 *
 * @prop {string}   appName          nama aplikasi (wajib)
 * @prop {string}   orgName          nama organisasi (opsional)
 * @prop {string}   logoSrc          URL master logo resmi yang disahkan; kosong → slot placeholder "LOGO"
 * @prop {string}   logoAlt          default 'Logo organisasi'
 * @prop {string}   userLabel        default 'Nama pengguna / NIP'
 * @prop {string}   error            pesan gagal masuk yang aman (tanpa membocorkan akun mana yang salah)
 * @prop {boolean}  loading          tombol Masuk menampilkan spinner & mencegah klik ganda
 * @prop {boolean}  remember         tampilkan opsi "Ingat perangkat ini" (default true)
 * @prop {string}   classification   label klasifikasi, mis. 'TERBATAS' (opsional)
 * @prop {ReactNode} help            teks bantuan di kaki kartu
 * @prop {function} onSubmit         ({ username, password, remember }) => void
 * @prop {function} onForgot         klik "Lupa kata sandi?"
 */
import { TextField } from './TextField.jsx';
import { Button } from './Button.jsx';
import { Checkbox } from './Checkbox.jsx';
import { Icon } from './Icon.jsx';
const { useState } = React;

export function LoginPage({
  appName, orgName,
  logoSrc, logoAlt = 'Logo organisasi',
  userLabel = 'Nama pengguna / NIP',
  error, loading = false, remember = true, classification, help,
  onSubmit, onForgot, className = '',
}) {
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [show, setShow] = useState(false);
  const [keep, setKeep] = useState(false);
  const submit = (e) => { e.preventDefault(); if (!loading && onSubmit) onSubmit({ username, password, remember: keep }); };
  return (
    <main className={'ds-login ' + className}>
      <section className="ds-login__card" aria-labelledby="ds-login-title">
        <header className="ds-login__brand">
          <span className="ds-login__logo">
            {logoSrc ? <img src={logoSrc} alt={logoAlt} /> : <span className="ds-brand-slot" role="img" aria-label="Slot logo resmi">LOGO</span>}
          </span>
          <div>
            <h1 id="ds-login-title" className="ds-login__app">{appName}</h1>
            {orgName && <p className="ds-login__org">{orgName}</p>}
          </div>
        </header>
        {error && <div className="ds-login__error" role="alert"><Icon name="warning-circle" size={18} /><span>{error}</span></div>}
        <form className="ds-login__form" onSubmit={submit} noValidate>
          <TextField label={userLabel} name="username" autoComplete="username" leftIcon="user" value={username} onChange={e => setU(e.target.value)} required />
          <TextField label="Kata sandi" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" leftIcon="lock-simple"
            rightIcon={show ? 'eye-slash' : 'eye'} rightIconLabel={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            onRightIconClick={() => setShow(s => !s)} value={password} onChange={e => setP(e.target.value)} required />
          <div className="ds-login__row">
            {remember ? <Checkbox label="Ingat perangkat ini" checked={keep} onChange={setKeep} /> : <span />}
            <button type="button" className="ds-login__link" onClick={onForgot}>Lupa kata sandi?</button>
          </div>
          <Button type="submit" size="lg" fullWidth loading={loading}>Masuk</Button>
        </form>
        {(classification || help) && (
          <footer className="ds-login__foot">
            {classification && <span className="ds-login__class"><Icon name="lock-key" size={12} />{classification}</span>}
            {help && <span>{help}</span>}
          </footer>
        )}
      </section>
    </main>
  );
}
