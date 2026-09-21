export function validateSheetUrl(url) {
  return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/.+/.test(url);
}

/** Ambil ID Spreadsheet untuk ditampilkan sebagai bukti sumber yang sedang aktif. */
export function spreadsheetId(url) {
  const match = String(url || "").match(/\/spreadsheets\/d\/([^/?#]+)/);
  return match ? match[1] : "";
}

/** Ringkas ID panjang tanpa menyamarkan identitas sumber sepenuhnya. */
export function compactId(value, head = 8, tail = 6) {
  const text = String(value || "");
  if (text.length <= head + tail + 1) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

export function parseCsv(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) return [];
  const lines = cleaned.split(/\r?\n/);
  const headerLine = lines.shift() || "";
  const delimiter = (headerLine.includes(";") && !headerLine.includes(",")) ? ";" : ",";
  const header = headerLine.split(delimiter).map(s => s.trim().replace(/^\uFEFF/, ""));
  return lines.map(line => {
    const cols = line.split(delimiter);
    const obj = {};
    header.forEach((h, i) => obj[h] = (cols[i] || "").trim().replace(/^"|"$/g, ""));
    return obj;
  });
}

/**
 * Pilihan rentang waktu di dasbor dan laporan.
 *
 * Sengaja MEMUTAR (rolling): "7d" = 7 hari terakhir yang berakhir HARI INI, bukan Senin–Minggu
 * pekan kalender.
 *
 * Kenapa diubah: dengan pekan kalender, membuka aplikasi hari Senin menampilkan "21–27 Sep" yang
 * isinya 6 hari KE DEPAN. Ringkasannya hampir selalu nol di awal pekan (di server ini terukur
 * "21–27 Sep 2026 · 0 transaksi" padahal ada transaksi beberapa hari sebelumnya), lalu angkanya
 * melonjak tanpa hubungan dengan apa yang baru terjadi. Rentang memutar selalu berarti
 * "N hari terakhir" kapan pun dibuka, jadi angkanya bisa dibandingkan antar hari.
 */
export const PERIOD_MODES = [
  { key: "1d", short: "1d", label: "hari ini", days: 1 },
  { key: "7d", short: "7d", label: "7 hari terakhir", days: 7 },
  { key: "30d", short: "30d", label: "30 hari terakhir", days: 30 }
];

/**
 * Pemetaan kunci lama -> baru, supaya pilihan yang sudah tersimpan di perangkat tidak hilang
 * saat aplikasi diperbarui. Tanpa ini, pengguna yang memilih "bulan" akan diam-diam kembali ke
 * setelan awal.
 */
export const LEGACY_PERIOD_KEYS = { day: "1d", week: "7d", month: "30d" };

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Kembalikan kunci yang sah (termasuk dari kunci lama), atau null kalau tidak dikenal. */
export function normalizePeriodKey(key) {
  if (PERIOD_MODES.some((option) => option.key === key)) return key;
  const migrated = LEGACY_PERIOD_KEYS[key];
  return PERIOD_MODES.some((option) => option.key === migrated) ? migrated : null;
}

export function periodMode(mode) {
  return PERIOD_MODES.find((option) => option.key === normalizePeriodKey(mode)) || PERIOD_MODES[2];
}

function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Batas rentang: `to` selalu HARI INI, `from` mundur (days - 1) hari.
 * Jam diset 12 siang waktu lokal supaya pergeseran DST tidak menggeser tanggalnya.
 */
export function periodBounds(mode = "30d", now = new Date()) {
  const days = periodMode(mode).days;
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() - (days - 1), 12);
  return { from: isoDay(start), to: isoDay(base) };
}

export function periodRangeLabel(mode = "30d", now = new Date()) {
  const { from, to } = periodBounds(mode, now);
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (from === to) return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} ${start.getFullYear()}`;
  // Rentang yang melewati pergantian tahun ditulis lengkap, kalau tidak "31 Des–2 Jan 2027"
  // terbaca seolah keduanya di 2027.
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} ${start.getFullYear()}–${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  }
  const leading = start.getMonth() === end.getMonth() ? `${start.getDate()}` : `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}`;
  return `${leading}–${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
}

export function txDate(tx) {
  return String(tx?.date || "").slice(0, 10);
}

/**
 * Batas panjang jejak aktivitas lokal.
 *
 * Log ini bertambah satu entri SETIAP kali sync berhasil (addAudit dipanggil setelah sync), dan
 * seluruh isinya ikut dikirim serta ditulis ulang ke Sheet. Tanpa batas, payload membesar terus
 * (~105 byte per sync) sehingga sync berikutnya selalu lebih lambat daripada sebelumnya — makin
 * sering dipakai makin berat. 200 entri sudah cukup untuk melihat aktivitas terbaru.
 */
export const AUDIT_LIMIT = 200;

/** Potong jejak aktivitas ke `limit` entri terbaru. */
export function trimAuditLog(log, limit = AUDIT_LIMIT) {
  if (!Array.isArray(log)) return [];
  return log.length > limit ? log.slice(0, limit) : log;
}

/**
 * Bentuk payload yang dikirim ke Apps Script.
 *
 * Sengaja dipisah jadi fungsi murni supaya bisa dites: dua hal di sini langsung memengaruhi
 * kecepatan sync.
 *
 *  1. `hasPendingSync` dan `lastSyncedAt` dibuang. Keduanya status LOKAL yang berubah tepat di
 *     sekitar proses sync itu sendiri. Kalau ikut dikirim, sheet "settings" selalu terlihat
 *     berubah setiap sync — padahal isinya sama — sehingga selalu ditulis ulang.
 *  2. `auditLog` dipotong ke AUDIT_LIMIT entri terbaru, supaya payload tidak tumbuh tanpa batas.
 *
 * Sisanya dikirim apa adanya karena Apps Script membandingkan sidik jari isi tiap tabel dan
 * melewati tabel yang tidak berubah.
 */
export function syncPayload(state, { auditLimit = AUDIT_LIMIT } = {}) {
  const settings = state?.settings || {};
  const pengaturan = {};
  Object.keys(settings).forEach((key) => {
    if (key === "hasPendingSync" || key === "lastSyncedAt") return;
    pengaturan[key] = settings[key];
  });

  return {
    action: "sync",
    sheetUrl: settings.sheetUrl,
    payload: {
      profile: state?.profile,
      accounts: state?.accounts || [],
      categories: state?.categories || [],
      transactions: state?.transactions || [],
      budgets: state?.budgets || [],
      bills: state?.bills || [],
      goals: state?.goals || [],
      settings: pengaturan,
      auditLog: trimAuditLog(state?.auditLog, auditLimit)
    }
  };
}

export function inPeriod(tx, bounds) {
  const day = txDate(tx);
  if (!day || !bounds) return false;
  return day >= bounds.from && day <= bounds.to;
}

export function sumInPeriod(transactions, type, bounds) {
  return (transactions || [])
    .filter((tx) => tx.type === type && inPeriod(tx, bounds))
    .reduce((total, tx) => total + Number(tx.amount || 0), 0);
}
