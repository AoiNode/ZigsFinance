import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCsv, validateSheetUrl, PERIOD_MODES, periodMode, periodBounds, periodRangeLabel, inPeriod, sumInPeriod, normalizePeriodKey, syncPayload, AUDIT_LIMIT, trimAuditLog, spreadsheetId, compactId } from "../src/utils.js";

test("validateSheetUrl only accepts Google Sheets URL", () => {
  assert.equal(validateSheetUrl("https://docs.google.com/spreadsheets/d/abc123/edit"), true);
  assert.equal(validateSheetUrl("https://example.com/sheets/d/abc"), false);
});

test("parseCsv parses expected rows", () => {
  const csv = "date,type,category,amount,account,note\n2026-01-01,expense,Makan,20000,Kas,sarapan";
  const rows = parseCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "Makan");
  assert.equal(rows[0].amount, "20000");
});

const DAY = (y, m, d) => new Date(y, m - 1, d, 12);
/** Jumlah hari dari a sampai b (b - a). */
const jarakHari = (a, b) => Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

test("periodBounds memutar: rentang selalu berakhir HARI INI", () => {
  const senin = DAY(2026, 9, 21);
  assert.deepEqual(periodBounds("1d", senin), { from: "2026-09-21", to: "2026-09-21" });
  assert.deepEqual(periodBounds("7d", senin), { from: "2026-09-15", to: "2026-09-21" });
  assert.deepEqual(periodBounds("30d", senin), { from: "2026-08-23", to: "2026-09-21" });
});

test("BUG LAMA: hari Senin tidak lagi menarik pekan ke DEPAN", () => {
  // Dulu "minggu" = Senin–Minggu pekan kalender. Hari Senin 21 Sep jadi menampilkan 21–27 Sep:
  // enam hari yang belum terjadi, sehingga ringkasannya hampir selalu nol lalu melonjak.
  const senin = DAY(2026, 9, 21);
  const { from, to } = periodBounds("7d", senin);
  assert.equal(to, "2026-09-21", "batas akhir harus hari ini, bukan Minggu pekan ini");
  assert.ok(to <= "2026-09-21", "tidak boleh ada tanggal yang belum terjadi");
  assert.equal(jarakHari(from, to), 6, "7 hari terakhir = mundur 6 hari dari hari ini");
});

test("rentang memutar tidak terpengaruh hari apa hari ini", () => {
  // Inti perbaikan ini: hasilnya sama panjangnya, hari apa pun. Dulu Senin dan Minggu memberi
  // rentang yang berbeda jauh.
  const hari = [21, 22, 23, 24, 25, 26, 27].map((d) => DAY(2026, 9, d));
  const panjang = hari.map((h) => jarakHari(periodBounds("7d", h).from, periodBounds("7d", h).to));
  assert.deepEqual(panjang, [6, 6, 6, 6, 6, 6, 6], "semua harus 7 hari");
  hari.forEach((h) => {
    const { to } = periodBounds("7d", h);
    assert.equal(to, `${to.slice(0, 8)}${String(h.getDate()).padStart(2, "0")}`, "batas akhir = hari itu sendiri");
  });
});

test("rentang memutar aman melewati batas bulan dan tahun", () => {
  assert.deepEqual(periodBounds("7d", DAY(2026, 9, 1)), { from: "2026-08-26", to: "2026-09-01" });
  assert.deepEqual(periodBounds("7d", DAY(2027, 1, 3)), { from: "2026-12-28", to: "2027-01-03" });
  // 1 Maret di tahun kabisat: mundur 6 hari harus mendarat di 24 Februari
  assert.deepEqual(periodBounds("7d", DAY(2028, 3, 1)), { from: "2028-02-24", to: "2028-03-01" });
  // 1 Januari: 30 hari terakhir harus masuk ke Desember tahun sebelumnya
  assert.deepEqual(periodBounds("30d", DAY(2027, 1, 1)), { from: "2026-12-03", to: "2027-01-01" });
});

test("label rentang terbaca manusia, termasuk saat melewati tahun", () => {
  const jumat = DAY(2026, 9, 11);
  assert.equal(periodRangeLabel("1d", jumat), "11 Sep 2026");
  assert.equal(periodRangeLabel("7d", jumat), "5\u201311 Sep 2026");
  assert.equal(periodRangeLabel("30d", jumat), "13 Agu\u201311 Sep 2026");
  // rentang lintas tahun ditulis lengkap supaya tidak terbaca seolah keduanya di tahun yang sama
  assert.equal(periodRangeLabel("7d", DAY(2027, 1, 3)), "28 Des 2026\u20133 Jan 2027");
});

test("nama pilihan periode: 1d / 7d / 30d", () => {
  assert.deepEqual(PERIOD_MODES.map((m) => m.short), ["1d", "7d", "30d"]);
  assert.deepEqual(PERIOD_MODES.map((m) => m.key), ["1d", "7d", "30d"]);
  assert.deepEqual(PERIOD_MODES.map((m) => m.days), [1, 7, 30]);
  assert.equal(periodMode("7d").label, "7 hari terakhir");
  assert.equal(periodMode("1d").label, "hari ini");
  assert.equal(PERIOD_MODES.length, 3);
});

test("pilihan lama (day/week/month) ikut dipindahkan, bukan dibuang", () => {
  // Tanpa ini, pengguna yang sudah memilih "bulan" akan diam-diam kembali ke setelan awal.
  assert.equal(normalizePeriodKey("day"), "1d");
  assert.equal(normalizePeriodKey("week"), "7d");
  assert.equal(normalizePeriodKey("month"), "30d");
  assert.equal(normalizePeriodKey("7d"), "7d", "kunci baru tetap diterima");
  assert.equal(normalizePeriodKey("nonsense"), null);
  assert.equal(normalizePeriodKey(undefined), null);
  assert.equal(periodMode("month").key, "30d", "periodMode harus ikut memindahkan");
  assert.equal(periodMode("nonsense").key, "30d", "nilai tidak dikenal jatuh ke bawaan 30d");
});

test("sumInPeriod scopes amounts without bleeding across year or period", () => {
  const transactions = [
    { date: "2026-09-11", type: "expense", amount: 50000 },
    { date: "2026-09-11", type: "income", amount: 200000 },
    { date: "2026-09-07", type: "expense", amount: 25000 },
    { date: "2025-09-15", type: "expense", amount: 900000 },
    { date: "2026-10-01", type: "expense", amount: 700000 }
  ];
  const friday = DAY(2026, 9, 11);
  assert.equal(sumInPeriod(transactions, "expense", periodBounds("1d", friday)), 50000);
  assert.equal(sumInPeriod(transactions, "expense", periodBounds("7d", friday)), 75000);
  assert.equal(sumInPeriod(transactions, "expense", periodBounds("30d", friday)), 75000);
  assert.equal(sumInPeriod(transactions, "income", periodBounds("30d", friday)), 200000);
});

test("transaksi masa depan tidak ikut terhitung", () => {
  // 30 hari terakhir berakhir hari ini, jadi transaksi bertanggal besok atau bulan depan tidak
  // boleh masuk. Ini yang bikin ringkasan pekan kalender lama terasa aneh: rentangnya ke depan.
  const transactions = [
    { date: "2026-09-11", type: "expense", amount: 50000 },
    { date: "2026-09-12", type: "expense", amount: 111000 },
    { date: "2026-09-30", type: "expense", amount: 222000 },
  ];
  const friday = DAY(2026, 9, 11);
  assert.equal(sumInPeriod(transactions, "expense", periodBounds("30d", friday)), 50000);
  assert.equal(inPeriod({ date: "2026-09-12" }, periodBounds("30d", friday)), false);
});

test("inPeriod tolerates timestamps and rejects malformed dates", () => {
  const bounds = periodBounds("30d", DAY(2026, 9, 11));
  assert.equal(inPeriod({ date: "2026-09-11T08:30:00Z" }, bounds), true);
  assert.equal(inPeriod({ date: "" }, bounds), false);
  assert.equal(inPeriod({}, bounds), false);
  assert.equal(inPeriod({ date: "11/09/2026" }, bounds), false);
});

test("syncPayload: membuang status lokal yang berubah di sekitar sync", () => {
  // hasPendingSync dan lastSyncedAt berubah TEPAT di sekitar proses sync. Kalau ikut dikirim,
  // sheet "settings" selalu terlihat berubah setiap sync dan selalu ditulis ulang padahal isinya
  // sama — satu tabel yang seharusnya bisa dilewati jadi ikut ditulis terus.
  const state = {
    settings: {
      sheetUrl: "https://docs.google.com/spreadsheets/d/abc/edit",
      appsScriptUrl: "https://script.google.com/macros/s/x/exec",
      hasPendingSync: true,
      lastSyncedAt: "2026-09-21T12:00:00.000Z",
      lastSourceChangeAt: "2026-08-01T00:00:00.000Z"
    },
    accounts: [], transactions: [], budgets: [], bills: [], goals: [], auditLog: []
  };
  const p = syncPayload(state);
  assert.equal(p.action, "sync");
  assert.equal(p.payload.settings.hasPendingSync, undefined, "status pending tidak boleh dikirim");
  assert.equal(p.payload.settings.lastSyncedAt, undefined, "waktu sync terakhir tidak boleh dikirim");
  assert.equal(p.payload.settings.sheetUrl, state.settings.sheetUrl, "konfigurasi asli tetap dikirim");
  assert.equal(p.payload.settings.lastSourceChangeAt, state.settings.lastSourceChangeAt);
});

test("syncPayload: membatasi panjang jejak aktivitas", () => {
  // Log ini bertambah 1 entri setiap sync dan seluruh isinya ikut dikirim + ditulis ulang.
  // Tanpa batas, tiap sync lebih lambat dari sebelumnya — makin dipakai makin berat.
  const banyak = Array.from({ length: 900 }, (_, i) => ({ id: `a${i}`, action: "sync_google_sheet" }));
  const p = syncPayload({ settings: {}, auditLog: banyak });
  assert.equal(p.payload.auditLog.length, AUDIT_LIMIT);
  assert.equal(p.payload.auditLog[0].id, "a0", "yang dipertahankan adalah entri terbaru");

  const sedikit = [{ id: "x" }];
  assert.equal(syncPayload({ settings: {}, auditLog: sedikit }).payload.auditLog.length, 1);
  assert.deepEqual(syncPayload({ settings: {} }).payload.auditLog, [], "tanpa log tetap aman");
});

test("syncPayload: bentuk payload tetap sama seperti yang dibaca Apps Script", () => {
  // Apps Script membaca payload.transactions / bills / auditLog dst. Kalau nama field berubah,
  // sync akan jalan tanpa error tapi tidak menulis apa pun.
  const state = {
    settings: { sheetUrl: "u" }, profile: { name: "Owner" }, categories: ["Makan"],
    accounts: [{ id: "a" }], transactions: [{ id: "t" }], budgets: [{ id: "b" }],
    bills: [{ id: "d" }], goals: [{ id: "g" }], auditLog: []
  };
  const p = syncPayload(state);
  for (const key of ["accounts", "transactions", "budgets", "bills", "goals", "auditLog", "settings"]) {
    assert.ok(Object.hasOwn(p.payload, key), `payload.${key} harus ada`);
  }
  assert.equal(p.payload.transactions[0].id, "t");
  assert.equal(p.payload.bills[0].id, "d", "tagihan dikirim sebagai `bills`, Sheet-nya bernama debts");
});

test("trimAuditLog tahan terhadap nilai aneh", () => {
  assert.deepEqual(trimAuditLog(null), []);
  assert.deepEqual(trimAuditLog(undefined), []);
  assert.deepEqual(trimAuditLog("bukan array"), []);
  assert.deepEqual(trimAuditLog([1, 2, 3], 2), [1, 2]);
  assert.deepEqual(trimAuditLog([1, 2], 5), [1, 2]);
});

test("helper sumber data menampilkan ID aktif dengan aman", () => {
  const url = "https://docs.google.com/spreadsheets/d/1V_8FKX2Mgkx79GEG0A9myMtOWaJyvQzXjlzfKBgXimU/edit?gid=0#gid=0";
  assert.equal(spreadsheetId(url), "1V_8FKX2Mgkx79GEG0A9myMtOWaJyvQzXjlzfKBgXimU");
  assert.equal(spreadsheetId("bukan link"), "");
  assert.equal(compactId("1234567890ABCDEFGHIJ"), "12345678…EFGHIJ");
  assert.equal(compactId("pendek"), "pendek");
});

test("form ganti sumber selalu memberi feedback, timeout, dan bukti simpan", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  // feedback inline + loading
  assert.match(app, /id="sourceFormStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(app, /id="saveSourceBtn"/);
  assert.match(app, /submit\.disabled = true/);
  assert.match(app, /submit\.textContent = "Menguji koneksi…"/);
  assert.match(app, /status\.className = "source-form-status success"/);
  assert.match(app, /status\.className = "source-form-status error"/);

  // request tidak boleh menggantung tanpa batas
  assert.match(app, /function fetchWithTimeout\(/);
  assert.match(app, /new AbortController\(\)/);
  assert.match(app, /lebih dari 15 detik/);

  // setelah menulis localStorage, baca balik sebelum mengaku sukses
  assert.match(app, /JSON\.parse\(localStorage\.getItem\(DB_KEY\)/);
  assert.match(app, /stored\?\.settings\?\.sheetUrl !== next/);
  assert.match(app, /stored\?\.settings\?\.appsScriptUrl !== appsScriptUrl/);

  // kartu Pengaturan menampilkan bukti sumber yang benar-benar aktif
  assert.match(app, /ID aktif:/);
  assert.match(app, /active-source-endpoint/);
});

test("perubahan URL Apps Script saja tetap dianggap pergantian sumber", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /const sheetChanged = oldSheet !== next/);
  assert.match(app, /const scriptChanged = oldScript !== appsScriptUrl/);
  assert.match(app, /const sourceChanged = sheetChanged \|\| scriptChanged/);
  assert.match(app, /if \(sourceChanged\) state\.settings\.hasPendingSync = true/);
  assert.match(app, /oldAppsScriptUrl/);
  assert.match(app, /newAppsScriptUrl/);
});

test("sync mencoba ulang gangguan sementara sebelum menjadi merah", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(app, /const SYNC_MAX_ATTEMPTS = 3/);
  assert.match(app, /const SYNC_TIMEOUT_MS = 45000/);
  assert.match(app, /function postSyncOnce\(/);
  assert.match(app, /function postSyncWithRetry\(/);
  assert.match(app, /response\.status === 408 \|\| response\.status === 429 \|\| response\.status >= 500/,
    "408, 429, dan 5xx harus dianggap sementara");
  assert.match(app, /error\?\.name === "AbortError"/,
    "timeout harus boleh dicoba ulang");
  assert.match(app, /error instanceof TypeError/,
    "kegagalan jaringan fetch harus boleh dicoba ulang");
  assert.match(app, /await wait\(500 \* \(2 \*\* \(attempt - 1\)\)\)/,
    "retry harus memakai backoff, bukan menembak Google terus-menerus");
  assert.match(app, /Koneksi Google terganggu — mencoba lagi/,
    "pengguna harus tahu aplikasi sedang memulihkan gangguan");
  assert.match(app, /postSyncWithRetry\(appsScriptUrl, params/,
    "alur sync utama harus benar-benar memakai retry wrapper");
});

test("Apps Script mengunci penulisan agar dua perangkat tidak bertabrakan", async () => {
  const gs = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
  assert.match(gs, /LockService\.getScriptLock\(\)/);
  assert.match(gs, /lock\.tryLock\(25000\)/);
  assert.match(gs, /retryable: true/,
    "lock contention harus memberi tahu client bahwa request aman dicoba ulang");
  assert.match(gs, /if \(lock\.hasLock\(\)\) lock\.releaseLock\(\)/,
    "lock wajib dilepas di finally");
});

test("klik sync berulang tidak membuat beberapa POST paralel", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /let syncInFlight = null/, "harus ada penyimpan Promise sync aktif");
  assert.match(app, /if \(syncInFlight\)/, "pemanggilan kedua harus memakai sync yang sedang berjalan");
  assert.match(app, /syncInFlight = performGoogleSheetSync\(\)/, "hanya fungsi inti yang membuat request baru");
  assert.match(app, /syncInFlight = null/, "guard harus dibersihkan setelah selesai");
  assert.match(app, /btn\.disabled = syncVisualStatus === "loading"/, "tombol harus nonaktif saat loading");
  assert.match(app, /aria-busy/, "status loading harus terbaca aksesibilitas");
});

test("Apps Script melewati tabel yang tidak berubah, bukan menulis semuanya", async () => {
  // Ini inti percepatan sync: ~35 panggilan SpreadsheetApp per sync turun jadi ~5-14 karena
  // tabel yang isinya sama persis tidak disentuh lagi.
  const gs = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

  // sidik jari isi tiap tabel
  assert.match(gs, /function fingerprint\(/, "harus ada sidik jari isi tabel");
  assert.match(gs, /Utilities\.computeDigest/, "pakai MD5 bawaan Apps Script");
  assert.match(gs, /PropertiesService\.getScriptProperties\(\)/, "sidik jari disimpan di Script Properties");

  // keputusan lewati/tulis
  assert.match(gs, /dilewati\.push/, "harus ada jalur yang melewati tabel");
  assert.match(gs, /tersimpan === cetak/, "melewati hanya kalau sidik jarinya sama");
  assert.match(gs, /getLastRow\(\) === rows\.length \+ 1/, "jumlah baris tetap dicek sebagai jaring pengaman");

  // semua sheet diambil sekali, bukan 7 kali getSheetByName
  assert.match(gs, /function sheetMap\(/, "harus ada pengambilan sheet sekali jalan");
  assert.match(gs, /ss\.getSheets\(\)/, "getSheets sekali, bukan getSheetByName berkali-kali");

  // header tidak boleh berubah — Sheet yang sudah ada harus tetap terbaca
  assert.match(gs, /transactions: \["id", "date", "type", "category", "amount", "accountId", "note"\]/);
  assert.match(gs, /debts: \["id", "name", "amount", "dueDate", "paid"\]/);
});

test("versi aset sinkron antara index.html, impor modul, dan cache service worker", async () => {
  // Service worker proyek ini CACHE-FIRST dan berpatokan pada URL. Kalau sebuah modul diimpor
  // tanpa versi (atau versinya tidak dinaikkan), perubahan di file itu tidak akan pernah sampai
  // ke pengguna yang sudah memasang PWA-nya — mereka tetap menjalankan kode lama tanpa cara
  // menyadarinya. Tes ini menjaga ketiganya tetap sinkron.
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  const versiHtml = [...html.matchAll(/(?:href|src)="\.\/([\w./-]+)\?v=(\d+)"/g)].map((m) => `./${m[1]}?v=${m[2]}`);
  assert.ok(versiHtml.length >= 2, "index.html harus memakai versi aset");
  for (const aset of versiHtml) {
    assert.ok(sw.includes(aset), `sw.js SHELL harus memuat ${aset} (versi index.html dan sw.js tidak sinkron)`);
  }

  // Impor antar-modul juga wajib ber-versi
  const impor = [...app.matchAll(/from\s+"\.\/([\w.-]+\.js)(\?v=\d+)?"/g)];
  assert.ok(impor.length > 0, "app.js harus mengimpor modul lain");
  for (const [, path, versi] of impor) {
    assert.ok(versi, `impor ./${path} di app.js harus ber-versi (?v=) supaya tidak nyangkut di cache`);
    assert.ok(sw.includes(`./src/${path}${versi}`), `sw.js SHELL harus memuat ./src/${path}${versi}`);
  }

  assert.match(sw, /zigs-fi-shell-v\d+/, "nama cache harus ber-versi supaya cache lama dibuang");
});

test("Pengaturan hanya menampilkan 5 jejak aktivitas terbaru tanpa pagination", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const settingsBody = app.match(/function renderSettings\(\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(settingsBody, /const recentAuditLog = state\.auditLog\.slice\(0, 5\)/,
    "harus mengambil tepat lima entri pertama (auditLog tersusun terbaru dulu)");
  assert.match(settingsBody, /recentAuditLog\.map/,
    "baris yang dirender harus berasal dari lima entri terbaru");
  assert.doesNotMatch(settingsBody, /paginate\(state\.auditLog/,
    "Jejak aktivitas tidak boleh punya halaman lanjutan");
  assert.doesNotMatch(settingsBody, /auditPage\.controls/,
    "kontrol Sebelumnya/Berikutnya harus hilang dari kartu Jejak aktivitas");
  assert.doesNotMatch(app, /auditLog: 1/,
    "state pagination auditLog yang sudah tidak dipakai harus dihapus");

  // Data sumber tetap lengkap; batas lima hanya untuk presentasi.
  assert.doesNotMatch(settingsBody, /state\.auditLog\s*=/,
    "renderSettings tidak boleh memotong data audit asli");
  assert.match(settingsBody, /recentAuditLog\.length[^\n]*terbaru/,
    "badge harus menjelaskan jumlah aktivitas terbaru yang benar-benar tampil");
});

test("tutorial mobile tidak melebar dan Code.gs selalu versi terbaru", async () => {
  const tutorial = await readFile(new URL("../tutorial.html", import.meta.url), "utf8");
  const gs = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

  assert.match(tutorial, /width=device-width,initial-scale=1,viewport-fit=cover/);
  assert.match(tutorial, /env\(safe-area-inset-bottom\)/);
  assert.match(tutorial, /@media\(max-width:480px\)/);

  // Setiap lapisan pembungkus blok kode harus boleh menyusut di viewport HP.
  assert.match(tutorial, /\.guide-shell\{[^}]*width:min\(1080px,100%\)[^}]*overflow:hidden/);
  assert.match(tutorial, /\.guide-grid\{[^}]*min-width:0/);
  assert.match(tutorial, /\.step\{[^}]*min-width:0[^}]*overflow:hidden/);
  assert.match(tutorial, /\.code-wrap\{[^}]*min-width:0[^}]*max-width:100%/);
  assert.match(tutorial, /pre\{[^}]*width:100%[^}]*max-width:100%[^}]*overflow:auto/);

  // Daftar isi menjadi chip horizontal di HP, bukan sidebar yang menyempitkan konten.
  assert.match(tutorial, /\.toc-links\{display:flex[^}]*overflow-x:auto/);

  // Kode di tutorial harus berasal dari file backend terbaru, bukan salinan lama dalam HTML.
  assert.match(tutorial, /apps-script\/Code\.gs\?v=6/);
  assert.match(gs, /function fingerprint\(/, "Code.gs harus versi sync cepat");
  assert.match(gs, /dilewati\.push/, "Code.gs harus melewati tabel yang tidak berubah");
  assert.match(tutorial, /sync hanya menulis tabel yang berubah/);
  assert.match(tutorial, /ISI_SPREADSHEET_ID/, "ID tetap placeholder untuk pengguna tutorial");
});

test("dashboard and reports both expose the period switch and its handler", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /periodSwitch\("dashboard"\)/);
  assert.match(app, /periodSwitch\("reports"\)/);
  assert.match(app, /data-period-kind/);
  assert.match(app, /setPeriodScope\(periodOption\.dataset\.periodKind, periodOption\.dataset\.periodMode\)/);
  assert.match(app, /finance_os_period_scope/);
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(sw, /zigs-fi-shell-v\d+/);
});

