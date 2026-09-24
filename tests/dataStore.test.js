import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMutation,
  buildMutation,
  computeSummary,
  mergeMutation,
  migrationPlan,
  validatePulledPage,
} from "../src/data-store.js";

const tx = (id, date, type, amount, category = "Makan") => ({ id, date, type, amount, category, accountId: "main-wallet", note: "" });

test("reload setelah migrasi tidak boleh menganggap transactions kosong sebagai perintah hapus", async () => {
  const app = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/app.js", import.meta.url), "utf8"));
  assert.match(app, /state\.storage\?\.engine !== "indexeddb"/);
  assert.match(app, /if \(state\.storage\?\.engine !== "indexeddb"\) \{\s*const migration = await migrateLegacyTransactions/);
});

test("client memakai write-ahead journal sebelum mutasi IndexedDB", async () => {
  const app = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/app.js", import.meta.url), "utf8"));
  const body = app.match(/async function persistTransactionMutation[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(body.indexOf("writePendingMutationJournal(mutation)") !== -1, "WAL ditulis untuk setiap mutasi");
  assert.ok(body.indexOf("writePendingMutationJournal(mutation)") < body.indexOf("enqueuePersistence"), "WAL didahulukan sebelum antrian IndexedDB");
  assert.match(app, /localStorage\.setItem\(PENDING_MUTATIONS_KEY, JSON\.stringify\(pending\)\)/);
  assert.match(app, /for \(const mutation of Array\.isArray\(pending\) \? pending : \[\]\) await queueMutation/);
});

test("migrationPlan menjaga localStorage sampai salinan IndexedDB terverifikasi", () => {
  const local = [tx("a", "2026-09-01", "expense", 10), tx("b", "2026-09-02", "income", 20)];
  assert.deepEqual(migrationPlan(local, { count: 0, checksum: "" }).action, "copy-and-verify");
  const plan = migrationPlan(local, { count: 2, checksum: migrationPlan(local).checksum });
  assert.equal(plan.action, "verified");
  assert.equal(plan.safeToStripLocalTransactions, true);
});

test("outbox merge menyatukan edit berulang dan delete menang atas upsert", () => {
  const first = buildMutation("transactions", "upsert", tx("a", "2026-09-01", "expense", 10), "m1");
  const edited = buildMutation("transactions", "upsert", tx("a", "2026-09-01", "expense", 15), "m2");
  const merged = mergeMutation(first, edited);
  assert.equal(merged.record.amount, 15);
  assert.equal(merged.mutationId, "m2");
  const deleted = mergeMutation(merged, buildMutation("transactions", "delete", { id: "a" }, "m3"));
  assert.equal(deleted.op, "delete");
  assert.equal(deleted.record, undefined);
});

test("mutation idempotent: upsert sama tidak menggandakan dan delete aman diulang", () => {
  let rows = [];
  rows = applyMutation(rows, buildMutation("transactions", "upsert", tx("a", "2026-09-01", "expense", 10), "m1"));
  rows = applyMutation(rows, buildMutation("transactions", "upsert", tx("a", "2026-09-01", "expense", 10), "m1"));
  assert.equal(rows.length, 1);
  rows = applyMutation(rows, buildMutation("transactions", "delete", { id: "a" }, "m2"));
  rows = applyMutation(rows, buildMutation("transactions", "delete", { id: "a" }, "m2"));
  assert.deepEqual(rows, []);
});

test("computeSummary menghitung rolling period tanpa memuat histori ke UI", () => {
  const rows = [
    tx("a", "2026-09-24", "income", 100),
    tx("b", "2026-09-23", "expense", 25, "Makan"),
    tx("c", "2026-08-01", "expense", 999),
  ];
  const summary = computeSummary(rows, { from: "2026-09-18", to: "2026-09-24" });
  assert.deepEqual(summary, { income: 100, expense: 25, count: 2, byCategory: { Makan: 25 } });
});

test("pull page wajib berurutan dan lengkap sebelum staging boleh dipromosikan", () => {
  assert.deepEqual(validatePulledPage({ rows: [tx("a", "2026-09-01", "expense", 1)], nextCursor: "a", done: false }, null), { ok: true, nextCursor: "a", done: false });
  assert.equal(validatePulledPage({ rows: [], nextCursor: null, done: false }, "a").ok, false);
  assert.equal(validatePulledPage({ rows: [], nextCursor: null, done: true }, "a").ok, true);
  assert.equal(validatePulledPage({ rows: "bad", done: true }, null).ok, false);
});

test("Blocker 4: pull menolak saat total baris Sheet berubah di tengah jalan", () => {
  const page = { rows: [tx("a", "2026-09-01", "expense", 1)], nextCursor: "1", done: false, total: 100 };
  assert.equal(validatePulledPage(page, "0", 100).ok, true, "total sama → lanjut");
  const changed = validatePulledPage(page, "0", 101);
  assert.equal(changed.ok, false, "total berubah → batalkan pull");
  assert.match(changed.message, /berubah saat ditarik/);
});

test("Improvement 4: urutan page pakai index [date,id] supaya tidak melompat", async () => {
  const ds = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/data-store.js", import.meta.url), "utf8"));
  assert.match(ds, /createIndex\("dateId", \["date", "id"\]\)/);
  assert.match(ds, /index\("dateId"\)\.openCursor/);
});

test("IndexedDB module menyimpan stores transaksi, outbox, staging, summary, metadata", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/data-store.js", import.meta.url), "utf8"));
  for (const store of ["transactions", "outbox", "pull_staging", "summary", "metadata"]) {
    assert.match(source, new RegExp(`createObjectStore\\(\\"${store}\\"`));
  }
  assert.match(source, /async function migrateLegacyTransactions/);
  assert.match(source, /async function replaceFromStaging/);
  assert.match(source, /transaction\(\["transactions", "pull_staging", "outbox", "summary", "metadata"\], "readwrite"\)/);
  assert.match(source, /objectStore\(STORE_OUTBOX\)\.clear\(\)/);
});
