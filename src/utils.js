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
