# Zigs.fi

Aplikasi keuangan pribadi berbasis browser dengan penyimpanan otomatis ke Google Sheets milik setiap pengguna.

## Fitur

- Login menggunakan Google OAuth
- Spreadsheet pribadi dibuat otomatis di Google Drive
- Sinkronisasi otomatis setelah perubahan data
- Dashboard pemasukan dan pengeluaran bulanan
- Saldo Dompet Utama sepanjang waktu
- Transaksi pemasukan/pengeluaran
- Anggaran, tagihan, target, dan laporan
- Impor/ekspor CSV dan cadangan JSON
- PWA installable untuk desktop dan mobile
- Pagination 10 item per halaman

## Penggunaan

1. Buka aplikasi.
2. Pilih **Lanjutkan dengan Google**.
3. Setujui akses Google Sheets dan Drive File.
4. Zigs.fi membuat file **Zigs.fi — Data Keuangan** secara otomatis.
5. Setiap perubahan disimpan lokal dan disinkronkan otomatis ke Spreadsheet.

## Development

```bash
npm test
npm run build
```

Hasil build statis tersedia di `dist/` dan siap dideploy ke Vercel.

## Keamanan

Aplikasi menggunakan scope `drive.file` dan `spreadsheets`. Access token hanya disimpan sementara di memory browser dan tidak ditulis ke localStorage atau repository.
