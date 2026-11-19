# Youthdi — Kasir web gratis untuk warung (v1 / MVP)

React frontend + Node.js backend, built from `PRD-Warung-POS.md`.

## Menjalankan

Butuh Node.js 22.5 atau lebih baru.

```bash
# Terminal 1: backend (port 3001)
cd server
npm test            # 7 tes API
npm run dev

# Terminal 2: frontend (port 5173, proxy /api ke :3001)
cd client
npm install
npm run dev
```

Buka http://localhost:5173, daftar sebagai pemilik, tambah menu di tab **Menu**, lalu coba **Kasir**.

Produksi: set `JWT_SECRET` (wajib), `DB_FILE`, `PORT`. Jalankan di belakang HTTPS.
Backend tidak punya dependency npm (hanya `node:http`, `node:sqlite`, `crypto`).

## Cakupan (semua P0 di PRD)

| PRD | Status |
|---|---|
| F-01..03 Auth + peran Pemilik/Kasir, kelola staf | selesai |
| F-04 Menu tambah/ubah/nonaktifkan | selesai (foto menu belum) |
| F-08..12, F-14 Kasir, tunai + kembalian, QRIS manual, riwayat + cari + filter tanggal | selesai |
| F-15 Unggah QRIS statis | selesai (cek tipe file PNG/JPG, belum membaca isi QR) |
| F-17..20, F-23 Dashboard: total, tunai vs QRIS, jumlah transaksi, menu terlaris, rentang tanggal | selesai |
| F-25, F-26 Struk via cetak browser 58/80 mm | selesai |

Edge case di PRD bagian 6 yang ditangani: koneksi putus (pesanan disimpan di browser), tap ganda
(`clientId` idempotent), uang kurang diblokir, harga lama tidak berubah, menu dinonaktifkan bukan dihapus,
staf dinonaktifkan langsung kehilangan akses, data antar usaha terisolasi, satu login per staf.

## Belum dibuat (di luar P0)

Bahan/resep (F-05..07), void transaksi (F-13), QRIS dinamis (F-16), grafik tren dan per staf (F-21, F-22),
cetak ulang struk (F-27), sembunyikan widget (F-24), backup otomatis, ekspor data.

## Asumsi yang saya ambil

- Database SQLite (`node:sqlite`) supaya tanpa server tambahan. Cukup untuk pilot 5-10 warung; ganti ke Postgres sebelum skala 1.000 usaha.
- Login: token bertanda tangan HMAC, berlaku 12 jam, dicek ulang ke database tiap request.
- Hari dihitung zona waktu Asia/Jakarta (WIB).
- Pesanan QRIS baru tercatat setelah kasir menekan "Pembayaran sudah diterima" (sesuai alur 3.2 PRD).
- Belum ada pembatasan percobaan login (rate limiting). Tambahkan sebelum dipakai publik.
