# Monitoring Akun Claude Tim

Laporan harian pemakaian kuota setiap akun Claude di tim, lewat email.

Fitur ini **mati secara bawaan**. Tidak ada email yang terkirim sampai Anda
menyalakannya.

---

## 1. Apa yang bisa dan tidak bisa diukur

Baca bagian ini dulu, dan teruskan ke atasan bersama laporan pertama. Tanpa
ini, sel kosong di tabel akan terbaca sebagai "orang ini tidak bekerja", yang
justru kebalikan dari kenyataannya.

| Cara pakai Claude | Persen kuota | Waktu reset | Units | Est. biaya |
|---|---|---|---|---|
| Claude Code → lewat 9router | ya | ya | **ya** | **ya** |
| Claude Desktop (chat) | ya | ya | tidak | tidak |

**Mengapa.** Persen kuota dibaca per-token OAuth dari endpoint
`api/oauth/usage` milik Anthropic, jadi akun yang chat-nya tidak pernah lewat
9router tetap terbaca. Jumlah token hanya tercatat kalau request-nya melewati
gateway ini — dan **Claude Desktop tidak punya setelan base URL**, jadi tidak
bisa diarahkan ke sini. Hanya Claude Code yang menghormati
`ANTHROPIC_BASE_URL`.

Ini batas sumber data, bukan kekurangan yang bisa ditambal.

**Tiga hal yang perlu dipahami atasan:**

1. **"tak terukur" ≠ tidak dipakai.** Artinya alat ini tidak bisa mengukurnya.
   Lihat kolom kuota untuk pemakaian sebenarnya.
2. **Angka USD itu setara harga API, bukan tagihan.** Paket Pro/Team ditagih
   per kursi, bukan per token. Angka ini berguna untuk argumen
   ("orang ini memakai setara $X terhadap kursi $20"), tapi bukan uang yang
   benar-benar keluar.
3. **Cakupan sampling membatasi angka tren.** Sampling jalan tiap jam selama
   9router hidup. Kalau laptop mati semalam, hari itu kurang tersampel dan
   "kena limit N dari 7 hari" akan **lebih rendah** dari kenyataan. Laporan
   selalu mencantumkan cakupannya.

**Units, bukan jumlah token.** Kuota Claude habis menurut bobot, bukan jumlah
token mentah:

```
units = cache_creation × 1,25 + cache_read × 0,1 + input × 1 + output × 5
```

Output dihitung 5×, cache read hanya 0,1×. Dua orang dengan jumlah token sama
bisa jauh berbeda konsumsi kuotanya, jadi melaporkan token mentah akan
menyesatkan tepat pada pertanyaan "siapa yang paling butuh Max".

---

## 2. Hubungkan setiap akun (sekali saja)

Setiap akun Claude harus di-OAuth ke instance 9router ini supaya kuotanya bisa
dibaca — **termasuk akun yang hanya dipakai lewat Desktop**.

1. Buka **Dashboard → Providers → Claude Code**.
2. **Add connection**, lalu login dengan akun tersebut.
3. Ulangi untuk ke-11 akun.

Kalau sebuah akun memakai 2FA, pemiliknya perlu hadir sekali untuk langkah ini.
Setelah itu token diperbarui otomatis.

### Tandai akun rekan sebagai monitor-only

Setelah akun rekan masuk, akun itu menjadi kandidat upstream untuk **semua**
traffic — termasuk traffic Anda. Artinya kuota Pro mereka bisa terpakai oleh
request orang lain, dan pengukurannya jadi kacau.

Di **Providers → Claude Code**, tiap koneksi punya tombol **Routed / Monitor**:

- **Routed** — bisa dipakai untuk melayani request (bawaan).
- **Monitor** — kuotanya tetap dibaca, tapi **tidak pernah** dipakai routing.

Tandai **Monitor** untuk semua akun yang bukan milik Anda.

> Jangan pakai tombol aktif/nonaktif untuk ini. Koneksi yang dinonaktifkan juga
> berhenti dibaca kuotanya — mematikan justru monitoring yang jadi alasan akun
> itu ditambahkan.

---

## 3. Arahkan pengguna Claude Code lewat 9router

Hanya perlu untuk yang ingin angka units dan biayanya terukur.

Untuk setiap orang:

1. **Dashboard → Endpoint & Key** → buat API key atas namanya.
2. Di key itu, pilih akun pada dropdown **Claude account**. Ini **memaku** key
   tersebut ke koneksinya sendiri.
3. Berikan padanya endpoint dan key itu:

```bash
export ANTHROPIC_BASE_URL=http://<host-9router>:20128
export ANTHROPIC_AUTH_TOKEN=<api-key-nya>
```

**Key yang dipaku gagal tertutup.** Kalau kuota akunnya habis, request-nya
error dengan jelas — tidak diam-diam pindah ke akun rekan. Ini disengaja:
fallback diam-diam itulah yang merusak laporan, karena pemakaian akan tercatat
atas nama orang yang tidak melakukannya.

---

## 4. Setel pengiriman email

Isi di `.env` (lihat `.env.example`):

```bash
MONITOR_ENABLED=true
MONITOR_SMTP_HOST=smtp.example.com
MONITOR_SMTP_PORT=587
MONITOR_SMTP_SECURE=false
MONITOR_SMTP_USER=bot@example.com
MONITOR_SMTP_PASS=<rahasia>
MONITOR_MAIL_FROM=bot@example.com
MONITOR_MAIL_TO=admin@example.com,atasan@example.com
MONITOR_REPORT_HOUR=7
MONITOR_TZ=Asia/Jakarta
```

`MONITOR_ENABLED` harus persis `true`. Nilai `1` atau `yes` tidak menyalakan —
disengaja, supaya salah ketik tidak berujung email tak terduga.

Mulai ulang 9router, lalu kirim percobaan:

```bash
curl -X POST http://localhost:20128/api/monitoring/send-test \
  -b "auth_token=<cookie-sesi-dashboard>"
```

Dibatasi satu kali per menit.

**Jadwal.** Sampling tiap jam; laporan dikirim sekali, pada jam
`MONITOR_REPORT_HOUR` waktu lokal. Kalau mesin tidur saat jam itu, laporan
**menyusul** begitu mesin hidup — bukan dilewati. Satu hari hanya dapat satu
laporan, dan tunggakan beberapa hari menjadi satu laporan untuk hari ini.

**Retensi.** Snapshot disimpan 90 hari, dipangkas setelah pengiriman berhasil.

---

## 5. Halaman dashboard

`/dashboard/monitoring` menampilkan laporan yang sama secara langsung, dari
objek yang sama dengan email — jadi layar dan email tidak mungkin berbeda
angka. Ada tombol **Ambil sampel sekarang** untuk sampling manual.

Beda dengan `/dashboard/quota`, yang menampilkan kuota live semua provider
tanpa riwayat, units, atau cakupan.

---

## 6. Keamanan

Baca sebelum mengekspos instance ini ke mesin rekan kerja.

- **Gateway ini bukan lagi layanan localhost.** Begitu rekan mengarahkan Claude
  Code ke sini, ia menerima traffic dari jaringan. **Nyalakan `requireApiKey`.**
- **Jangan percaya header forwarding.** `custom-server.js` mengambil IP klien
  dari socket TCP dan membuang `X-Forwarded-For` yang dikirim penyerang,
  mempercayainya hanya dari reverse proxy loopback. Jangan dibatalkan.
- **Repo ini tidak punya role.** Autentikasi dashboard adalah satu kata sandi
  bersama (atau sesi OIDC/SAML). Jadi **siapa pun yang bisa login dashboard**
  dapat melihat laporan ini dan setiap koneksi tersimpan. Aman selama tim hanya
  diberi **API key, bukan kata sandi dashboard**. Jangan bagikan kata sandi
  dashboard ke tim.
- **Laporan ini bersifat sensitif.** Isinya daftar anggota tim dan intensitas
  kerja mereka. Kirim hanya ke penerima yang Anda konfigurasi.
- **Kata sandi SMTP tidak pernah dikembalikan API.** `monitorSmtpPass` masuk
  `PROTECTED_SETTING_KEYS` dan dibuang dari respons `GET /api/settings`.
- **Token tidak pernah keluar dari proses.** Pesan error dibersihkan sebelum
  disimpan atau dikirim — di situlah token biasanya bocor.
- **Monitoring tidak pernah memakai reset grant.** `consumeClaudeResetGrant`
  menghabiskan sumber daya terbatas dan tak bisa dibatalkan; tidak ada jalur
  monitoring yang memanggilnya.

---

## 7. Kalau ada yang tidak beres

| Gejala | Kemungkinan sebab |
|---|---|
| Satu akun selalu "gagal dibaca" | Token kedaluwarsa — hubungkan ulang di Providers |
| Semua kolom units kosong | Belum ada yang pakai Claude Code lewat 9router, atau key-nya belum dipaku |
| Email tidak datang | `MONITOR_ENABLED` bukan persis `true`, atau SMTP salah — coba `send-test` |
| Cakupan rendah terus | 9router sering mati; tren akan kurang hitung selama ini terjadi |
| Kuota akun rekan ikut terpakai | Koneksinya belum ditandai **Monitor** |
