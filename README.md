# Zigs.fi (Tanpa DB Server)

Aplikasi website keuangan kompleks untuk single user, data lokal di browser + sinkronisasi manual ke Google Sheets via Apps Script.

## Fitur Utama
- Dashboard: net worth, income, expense, saving rate, alert jatuh tempo
- Dompet Utama otomatis: semua transaksi masuk ke satu saldo tanpa pengaturan akun
- Transaksi: input manual, kategori dinamis, import CSV, anti duplikasi dasar
- Budget: limit per kategori per bulan + progress
- Tagihan/Cicilan: due date, status bayar, reminder visual
- Goals: target nominal + progres
- Laporan: top pengeluaran, export JSON/CSV
- Pengaturan Data Source:
  - ganti link Google Sheet manual
  - satu Google Sheet dapat digunakan terus-menerus
  - backup otomatis sebelum ganti link
  - audit log pergantian
  - test koneksi & sinkronisasi

## Jalankan
1. Buka file `index.html` langsung di browser, atau serve statis:
```powershell
cd C:\WINDOWS\system32\codex-telegram-bot\finance-web
python -m http.server 8080
```
2. Akses `http://localhost:8080`.

## Setup Google Sheets
1. Buat Google Sheet baru.
2. Buka Apps Script dari sheet tersebut.
3. Salin isi `apps-script/Code.gs`.
4. Deploy sebagai Web App (akses: Anyone with the link).
5. Masukkan:
- Link sheet ke `Settings > Data Source > Link Google Sheet`
- URL Web App ke `Apps Script Web App URL`
6. Klik `Simpan & Validasi`, lalu `Sync Google Sheet`.

## CSV Import
Header wajib:
```csv
date,type,category,amount,account,note
```

## Test
```powershell
npm test
```
