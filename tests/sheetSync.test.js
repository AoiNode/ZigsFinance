import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Apps Script supports loading complete state from an existing Spreadsheet", async () => {
  const source = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
  assert.match(source, /action === "load"/);
  assert.match(source, /readSheetObjects/);
  assert.match(source, /auditLog/);
});

test("new device setup restores before allowing Spreadsheet writes", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(source, /loadStateFromGoogleSheet/);
  assert.match(source, /Pulihkan dari Spreadsheet/);
  assert.match(source, /remoteHasData/);
});

test("Apps Script mendukung mutation batch idempotent dan paginated pull", async () => {
  const source = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
  assert.match(source, /body\.action === "mutate"/);
  assert.match(source, /function applyMutations\(/);
  assert.match(source, /appliedMutationIds/);
  assert.match(source, /MUTATION_LOG_SHEET/);
  assert.match(source, /function loadPage\(/);
  assert.match(source, /action === "load-page"/);
  assert.match(source, /Math\.min\(1000, Math\.max\(1/);
  assert.match(source, /capabilities: \["mutations-v1", "paged-load-v1"\]/);
});

test("client negosiasi capability dan fallback aman ke sync penuh backend lama", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(source, /async function getSyncCapabilities\(/);
  assert.match(source, /capabilities\.includes\("mutations-v1"\)/);
  assert.match(source, /params\.set\("payload", JSON\.stringify\(\{ action: "mutate", mutations/);
  assert.match(source, /acknowledgeMutations\(financeDb, data\.appliedMutationIds\)/);
  assert.match(source, /await getAllTransactions\(financeDb\)/, "fallback full sync wajib mengambil seluruh histori dari IndexedDB");
  assert.match(source, /JSON\.stringify\(syncPayload\(\{ \.\.\.state, transactions: allTransactions \}\)\)/,
    "backend lama tetap dilayani oleh full sync tanpa memotong histori");
});

test("manual Sync tetap satu arah meski data lokal kosong", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const syncBody = source.match(/async function performGoogleSheetSync\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(syncBody, /action=ping|remoteHasData|loadStateFromGoogleSheet/);
  assert.match(syncBody, /postSyncWithRetry/);
});

test("Blocker 5: backup sebelum Tarik Data memuat seluruh histori IndexedDB", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const body = app.match(/async function pullDataFromGoogleSheet[\s\S]*?\n\}/)?.[0] || "";
  assert.match(body, /getAllTransactions\(financeDb\)/, "backup wajib mengambil seluruh histori, bukan page cache");
  assert.match(body, /transactions: backupTransactions/, "backup JSON memuat field transactions penuh");
  assert.match(body, /Backup lokal gagal dibuat/i, "backup gagal harus membatalkan pull");
});

test("Blocker 3: full-sync meng-ack outbox yang sudah tercakup snapshot", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const body = app.match(/async function performGoogleSheetSync\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(body, /preSyncMutationIds/, "id outbox ditangkap sebelum request");
  assert.match(body, /acknowledgeMutations\(financeDb, preSyncMutationIds\)/, "respons tanpa appliedMutationIds tetap melepas mutasi lama");
  assert.match(body, /hasPendingSync =[\s\S]*getOutbox\(financeDb\)/, "status bersih hanya bila outbox benar-benar kosong");
});

test("load-meta memberi total dan revision transaksi untuk guard paginated pull", async () => {
  const source = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
  assert.match(source, /totalTransactions/, "load-meta wajib mengembalikan jumlah baris transaksi");
  assert.match(source, /revision/, "load-meta/load-page wajib mengembalikan revision untuk mendeteksi perubahan isi dengan total sama");
  assert.match(source, /bumpDataRevision/, "setiap write wajib menaikkan revision");
  assert.match(source, /withDataReadLock/, "load/load-meta/load-page wajib menunggu writer selesai");
});

test("fallback pull backend lama mempromosikan transaksi remote ke IndexedDB", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const body = app.match(/async function loadStateFromGoogleSheet[\s\S]*?\n\}/)?.[0] || "";
  assert.match(body, /if \(financeDbReady && !paged\)/);
  assert.match(body, /stagePulledRows\(financeDb, legacyRemoteRows\)/);
  assert.match(body, /replaceFromStaging\(financeDb, legacyRemoteRows\.length\)/);
});

test("Apps Script memvalidasi seluruh mutation batch sebelum write pertama", async () => {
  const source = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
  const body = source.match(/function applyMutations\(ss, mutations, payload\) \{[\s\S]*?\n\}/)?.[0] || "";
  const validation = body.indexOf("mutations.forEach(validateMutation)");
  const firstWrite = body.indexOf("sh.deleteRow");
  assert.ok(validation >= 0 && firstWrite > validation, "semua mutation harus divalidasi sebelum sheet diubah");
});

test("capability probe gagal memakai kontrak konservatif untuk request saat ini", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const body = app.match(/async function getSyncCapabilities\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(body, /return probed \?/, "probe gagal → [] untuk operasi ini, cache lama hanya untuk UI");
});

test("client mengirim outbox incremental per batch maksimum 500 dan ack per respons", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const body = app.match(/async function performGoogleSheetSync\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(body, /mutationBatches\(outboxRows, 500\)/);
  assert.match(body, /for \(const mutationBatch of/);
  assert.match(body, /acknowledgeMutations\(financeDb, data\.appliedMutationIds\)/);
});
