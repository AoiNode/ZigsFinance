import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import {
  openFinanceDb,
  getAllTransactions,
  migrateLegacyTransactions,
  stagePulledRows,
  replaceFromStaging,
  queueMutation,
  getOutbox,
  buildMutation,
  acknowledgeMutations,
  mutationBatches,
} from "../src/data-store.js";

const open = () => openFinanceDb(new IDBFactory());
const row = (id) => ({ id, date: "2026-09-25", type: "expense", category: "Makan", amount: 1000, accountId: "main-wallet", note: "" });
const add = (db, id) => queueMutation(db, buildMutation("transactions", "upsert", row(id)));

test("Blocker 1: marker localStorage hilang TIDAK menghapus IndexedDB yang valid", async () => {
  const db = await open();
  await add(db, "a");
  // Marker storage.engine hilang → app memanggil migrasi dengan legacy kosong.
  const plan = await migrateLegacyTransactions(db, []);
  const rows = await getAllTransactions(db);
  assert.equal(rows.length, 1, "IDB berisi data tidak boleh dikosongkan oleh legacy kosong");
  assert.equal(plan.safeToStripLocalTransactions, true);
});

test("Blocker 1b: legacy dan IDB berbeda disatukan, tidak ada baris yang hilang", async () => {
  const db = await open();
  await add(db, "a");
  const plan = await migrateLegacyTransactions(db, [row("b")]);
  const ids = (await getAllTransactions(db)).map(r => r.id).sort();
  assert.deepEqual(ids, ["a", "b"], "union legacy + IDB, tanpa clear");
  assert.equal(plan.safeToStripLocalTransactions, true);
});

test("migrasi pertama (IDB kosong) tetap menyalin seluruh legacy dan verifikasi", async () => {
  const db = await open();
  const plan = await migrateLegacyTransactions(db, [row("l1"), row("l2")]);
  assert.equal((await getAllTransactions(db)).length, 2);
  assert.equal(plan.safeToStripLocalTransactions, true);
});

test("Blocker 4: promosi pull menolak jumlah tidak lengkap dan data aktif utuh", async () => {
  const db = await open();
  for (const id of ["x", "y", "z"]) await add(db, id);
  await stagePulledRows(db, [row("p"), row("q")]);
  await assert.rejects(() => replaceFromStaging(db, 3), /2 dari 3/);
  const live = await getAllTransactions(db);
  assert.equal(live.length, 3, "data aktif tidak boleh disentuh saat total mismatch");
  const staged = await new Promise((res, rej) => {
    const q = db.transaction("pull_staging").objectStore("pull_staging").getAll();
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
  assert.equal(staged.length, 2, "staging tidak dibersihkan agar bisa diganti ulang");
});

test("promosi pull sukses saat jumlah cocok dan outbox lama dibersihkan", async () => {
  const db = await open();
  await add(db, "old");
  await stagePulledRows(db, [row("p1"), row("p2")]);
  const count = await replaceFromStaging(db, 2);
  assert.equal(count, 2);
  assert.deepEqual((await getAllTransactions(db)).map(r => r.id).sort(), ["p1", "p2"]);
  assert.equal((await getOutbox(db)).length, 0, "outbox tidak boleh diputar ulang setelah pull");
});

test("fallback pull backend lama juga mengganti IndexedDB, bukan hanya cache UI", async () => {
  const db = await open();
  await add(db, "old-local");
  const remote = [row("remote-1"), row("remote-2")];
  await stagePulledRows(db, remote);
  await replaceFromStaging(db, remote.length);
  assert.deepEqual((await getAllTransactions(db)).map(r => r.id).sort(), ["remote-1", "remote-2"]);
});

test("Improvement 2: ack subset tidak menghapus mutasi yang belum diterima server", async () => {
  const db = await open();
  await add(db, "m1");
  await add(db, "m2");
  const rows = await getOutbox(db);
  assert.equal(rows.length, 2);
  await acknowledgeMutations(db, [rows[0].mutationId]);
  const remaining = await getOutbox(db);
  assert.equal(remaining.length, 1, "mutasi yang belum di-ack harus bertahan");
  assert.equal(remaining[0].mutationId, rows[1].mutationId);
});

test("sync incremental memecah outbox lebih dari 500 tanpa kehilangan urutan", () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ mutationId: `m${i}` }));
  const batches = mutationBatches(rows, 500);
  assert.deepEqual(batches.map(batch => batch.length), [500, 500, 1]);
  assert.deepEqual(batches.flat().map(row => row.mutationId), rows.map(row => row.mutationId));
});
