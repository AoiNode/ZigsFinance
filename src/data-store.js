const DB_NAME = "zigs_finance_v2";
const DB_VERSION = 2;
const STORE_TRANSACTIONS = "transactions";
const STORE_OUTBOX = "outbox";
const STORE_STAGING = "pull_staging";
const STORE_SUMMARY = "summary";
const STORE_METADATA = "metadata";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function checksumRows(rows = []) {
  const text = stable([...rows].sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || ""))));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function migrationPlan(localRows = [], indexed = null) {
  const rows = Array.isArray(localRows) ? localRows : [];
  const checksum = checksumRows(rows);
  const verified = indexed && Number(indexed.count) === rows.length && indexed.checksum === checksum;
  return { action: verified ? "verified" : "copy-and-verify", count: rows.length, checksum, safeToStripLocalTransactions: !!verified };
}

export function buildMutation(entity, op, record, mutationId = globalThis.crypto?.randomUUID?.() || `m_${Date.now()}_${Math.random().toString(36).slice(2)}`) {
  if (!entity || !["upsert", "delete"].includes(op)) throw new Error("Mutasi tidak valid");
  const id = String(record?.id || "");
  if (!id) throw new Error("Mutasi wajib memiliki id");
  return { key: `${entity}:${id}`, mutationId, entity, op, id, ...(op === "upsert" ? { record: { ...record, id } } : {}), at: new Date().toISOString() };
}

export function mergeMutation(previous, next) {
  if (!previous) return next;
  if (!next) return previous;
  if (previous.key !== next.key) throw new Error("Mutasi berbeda tidak dapat digabung");
  return next.op === "delete" ? { ...next, record: undefined } : next;
}

export function applyMutation(rows = [], mutation) {
  const next = [...rows];
  const idx = next.findIndex(row => String(row.id) === mutation.id);
  if (mutation.op === "delete") {
    if (idx >= 0) next.splice(idx, 1);
    return next;
  }
  if (idx >= 0) next[idx] = { ...mutation.record };
  else next.push({ ...mutation.record });
  return next;
}

export function computeSummary(rows = [], bounds = {}) {
  const summary = { income: 0, expense: 0, count: 0, byCategory: {} };
  for (const row of rows) {
    const date = String(row?.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < bounds.from || date > bounds.to) continue;
    const amount = Number(row.amount || 0);
    summary.count += 1;
    if (row.type === "income") summary.income += amount;
    if (row.type === "expense") {
      summary.expense += amount;
      const category = String(row.category || "Lainnya");
      summary.byCategory[category] = (summary.byCategory[category] || 0) + amount;
    }
  }
  return summary;
}

export function validatePulledPage(page, previousCursor, expectedTotal = null, expectedRevision = null) {
  if (!page || !Array.isArray(page.rows) || typeof page.done !== "boolean") return { ok: false, message: "Halaman pull tidak valid" };
  if ((expectedTotal != null && Number(page.total) !== Number(expectedTotal)) ||
      (expectedRevision != null && String(page.revision || "") !== String(expectedRevision))) {
    return { ok: false, message: "Data Google Sheet berubah saat ditarik — coba lagi." };
  }
  if (!page.done && (!page.nextCursor || page.nextCursor === previousCursor || page.rows.length === 0)) return { ok: false, message: "Cursor pull tidak maju" };
  return { ok: true, nextCursor: page.nextCursor || null, done: page.done };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB gagal"));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Transaksi IndexedDB gagal"));
    tx.onabort = () => reject(tx.error || new Error("Transaksi IndexedDB dibatalkan"));
  });
}

export function openFinanceDb(indexedDBImpl = globalThis.indexedDB) {
  if (!indexedDBImpl) return Promise.reject(new Error("IndexedDB tidak tersedia"));
  return new Promise((resolve, reject) => {
    const request = indexedDBImpl.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      let txStore;
      if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
        txStore = db.createObjectStore("transactions", { keyPath: "id" });
        txStore.createIndex("date", "date");
        txStore.createIndex("type_date", ["type", "date"]);
      } else {
        txStore = request.transaction.objectStore(STORE_TRANSACTIONS);
      }
      // Tie-break tanggal sama agar urutan page deterministik dan tidak melompat saat
      // insert/edit di tengah halaman (Improvement 4 review).
      if (!txStore.indexNames.contains("dateId")) txStore.createIndex("dateId", ["date", "id"]);
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) db.createObjectStore("outbox", { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORE_STAGING)) db.createObjectStore("pull_staging", { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORE_SUMMARY)) db.createObjectStore("summary", { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORE_METADATA)) db.createObjectStore("metadata", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Database lokal gagal dibuka"));
  });
}

export async function getAllTransactions(db) {
  return requestResult(db.transaction(STORE_TRANSACTIONS).objectStore(STORE_TRANSACTIONS).getAll());
}

export async function getTransactionPage(db, offset = 0, limit = 10) {
  const tx = db.transaction(STORE_TRANSACTIONS);
  const store = tx.objectStore(STORE_TRANSACTIONS);
  const total = await requestResult(store.count());
  const rows = [];
  await new Promise((resolve, reject) => {
    const request = store.index("dateId").openCursor(null, "prev");
    let skipped = false;
    request.onerror = () => reject(request.error || new Error("Cursor transaksi gagal"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || rows.length >= limit) return resolve();
      if (!skipped && offset > 0) { skipped = true; cursor.advance(offset); return; }
      rows.push(cursor.value);
      cursor.continue();
    };
  });
  return { rows, total };
}

export async function getOutbox(db) {
  return requestResult(db.transaction(STORE_OUTBOX).objectStore(STORE_OUTBOX).getAll());
}

export function mutationBatches(rows = [], limit = 500) {
  const size = Math.max(1, Number(limit) || 500);
  const batches = [];
  for (let offset = 0; offset < rows.length; offset += size) batches.push(rows.slice(offset, offset + size));
  return batches;
}

export async function queueMutation(db, mutation) {
  const tx = db.transaction([STORE_TRANSACTIONS, STORE_OUTBOX], "readwrite");
  const live = tx.objectStore(STORE_TRANSACTIONS);
  const outbox = tx.objectStore(STORE_OUTBOX);
  const previous = await requestResult(outbox.get(mutation.key));
  const merged = mergeMutation(previous, mutation);
  if (mutation.op === "delete") live.delete(mutation.id); else live.put(mutation.record);
  outbox.put(merged);
  await transactionDone(tx);
  return merged;
}

export async function acknowledgeMutations(db, mutationIds = []) {
  const accepted = new Set(mutationIds);
  const tx = db.transaction(STORE_OUTBOX, "readwrite");
  const store = tx.objectStore(STORE_OUTBOX);
  const rows = await requestResult(store.getAll());
  rows.filter(row => accepted.has(row.mutationId)).forEach(row => store.delete(row.key));
  await transactionDone(tx);
}

export async function migrateLegacyTransactions(db, localRows = []) {
  const legacy = (Array.isArray(localRows) ? localRows : []).filter(row => row && row.id);
  const current = await getAllTransactions(db);

  if (current.length > 0) {
    // IndexedDB berisi data → IDB adalah sumber kebenaran. Legacy hanya MENAMBAH baris yang
    // belum ada; tidak pernah menghapus/menimpa isi IDB. Ini menutup kasus marker localStorage
    // hilang (mis. tab lama masih menulis state versi sebelumnya) tanpa mengosongkan database.
    const known = new Set(current.map(row => String(row.id)));
    const missing = legacy.filter(row => !known.has(String(row.id)));
    if (missing.length === 0) {
      return { action: "idb-authoritative", count: current.length, checksum: checksumRows(current), safeToStripLocalTransactions: true };
    }
    const tx = db.transaction([STORE_TRANSACTIONS, STORE_METADATA], "readwrite");
    const store = tx.objectStore(STORE_TRANSACTIONS);
    missing.forEach(row => store.put(row));
    tx.objectStore(STORE_METADATA).put({ key: "legacy_migration", added: missing.length, count: current.length + missing.length, at: new Date().toISOString() });
    await transactionDone(tx);
    const merged = await getAllTransactions(db);
    const mergedIds = new Set(merged.map(row => String(row.id)));
    if (!legacy.every(row => mergedIds.has(String(row.id)))) throw new Error("Verifikasi gabungan migrasi IndexedDB gagal");
    return { action: "merged", count: merged.length, checksum: checksumRows(merged), safeToStripLocalTransactions: true };
  }

  // IDB kosong: salin legacy. Tidak ada store.clear() di sini — memang tidak ada yang perlu
  // dihapus, dan menghapus membuat "legacy kosong" pernah berarti "hapus semua data".
  const plan = migrationPlan(legacy, { count: 0, checksum: checksumRows([]) });
  if (plan.action === "verified") return plan;
  const tx = db.transaction([STORE_TRANSACTIONS, STORE_METADATA], "readwrite");
  const store = tx.objectStore(STORE_TRANSACTIONS);
  legacy.forEach(row => store.put(row));
  tx.objectStore(STORE_METADATA).put({ key: "legacy_migration", count: legacy.length, checksum: plan.checksum, at: new Date().toISOString() });
  await transactionDone(tx);
  const copied = await getAllTransactions(db);
  const verified = migrationPlan(legacy, { count: copied.length, checksum: checksumRows(copied) });
  if (!verified.safeToStripLocalTransactions) throw new Error("Verifikasi migrasi IndexedDB gagal");
  return verified;
}

export async function clearPullStaging(db) {
  const tx = db.transaction(STORE_STAGING, "readwrite");
  tx.objectStore(STORE_STAGING).clear();
  await transactionDone(tx);
}

export async function stagePulledRows(db, rows = []) {
  const tx = db.transaction(STORE_STAGING, "readwrite");
  rows.forEach(row => row?.id && tx.objectStore(STORE_STAGING).put(row));
  await transactionDone(tx);
}

export async function replaceFromStaging(db, expectedTotal = null) {
  // Baca & validasi dulu lewat transaksi BACA. Data aktif hanya disentuh setelah jumlah
  // baris terbukti cocok. Staging ber-key id, sehingga rows.length = jumlah unik.
  const readTx = db.transaction(STORE_STAGING);
  const rows = await requestResult(readTx.objectStore(STORE_STAGING).getAll());
  if (expectedTotal != null && rows.length !== Number(expectedTotal)) {
    throw new Error(`Tarik data dibatalkan: ${rows.length} dari ${expectedTotal} baris — data aktif tidak diubah.`);
  }
  const tx = db.transaction(["transactions", "pull_staging", "outbox", "summary", "metadata"], "readwrite");
  const staging = tx.objectStore(STORE_STAGING);
  const live = tx.objectStore(STORE_TRANSACTIONS);
  live.clear();
  rows.forEach(row => live.put(row));
  staging.clear();
  tx.objectStore(STORE_OUTBOX).clear();
  tx.objectStore(STORE_SUMMARY).clear();
  tx.objectStore(STORE_METADATA).put({ key: "last_pull", count: rows.length, checksum: checksumRows(rows), at: new Date().toISOString() });
  await transactionDone(tx);
  return rows.length;
}

export async function summaryFromDb(db, bounds) {
  const summary = { income: 0, expense: 0, count: 0, byCategory: {} };
  const tx = db.transaction(STORE_TRANSACTIONS);
  const index = tx.objectStore(STORE_TRANSACTIONS).index("date");
  const range = globalThis.IDBKeyRange?.bound(bounds.from, `${bounds.to}\uffff`);
  await new Promise((resolve, reject) => {
    const request = index.openCursor(range || null);
    request.onerror = () => reject(request.error || new Error("Ringkasan IndexedDB gagal"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve();
      const row = cursor.value;
      const date = String(row?.date || "").slice(0, 10);
      if (date >= bounds.from && date <= bounds.to) {
        const amount = Number(row.amount || 0);
        summary.count += 1;
        if (row.type === "income") summary.income += amount;
        if (row.type === "expense") {
          summary.expense += amount;
          const category = String(row.category || "Lainnya");
          summary.byCategory[category] = (summary.byCategory[category] || 0) + amount;
        }
      }
      cursor.continue();
    };
  });
  return summary;
}

export const FINANCE_DB = Object.freeze({ name: DB_NAME, version: DB_VERSION });
