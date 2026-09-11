export function validateSheetUrl(url) {
  return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/.+/.test(url);
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

export const PERIOD_MODES = [
  { key: "day", short: "Hari", label: "hari ini" },
  { key: "week", short: "Minggu", label: "minggu ini" },
  { key: "month", short: "Bulan", label: "bulan ini" }
];

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function periodMode(mode) {
  return PERIOD_MODES.find((option) => option.key === mode) || PERIOD_MODES[2];
}

function isoDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function periodBounds(mode = "month", now = new Date()) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (mode === "day") {
    const day = isoDay(base);
    return { from: day, to: day };
  }
  if (mode === "week") {
    const from = new Date(base);
    from.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6, 12);
    to.setHours(0, 0, 0, 0);
    return { from: isoDay(from), to: isoDay(to) };
  }
  const from = new Date(base.getFullYear(), base.getMonth(), 1);
  const to = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { from: isoDay(from), to: isoDay(to) };
}

export function periodRangeLabel(mode = "month", now = new Date()) {
  const { from, to } = periodBounds(mode, now);
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (mode === "day") return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} ${start.getFullYear()}`;
  if (mode === "week") {
    const leading = start.getMonth() === end.getMonth() ? `${start.getDate()}` : `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}`;
    return `${leading}–${end.getDate()} ${MONTHS_SHORT[end.getMonth()]} ${end.getFullYear()}`;
  }
  return `${MONTHS_LONG[start.getMonth()]} ${start.getFullYear()}`;
}

export function txDate(tx) {
  return String(tx?.date || "").slice(0, 10);
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
