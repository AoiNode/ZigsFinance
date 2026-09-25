/* ============================================================================
   Zigs.fi — Apps Script (jembatan Google Spreadsheet)
   ============================================================================

   KENAPA VERSI INI JAUH LEBIH CEPAT

   Versi sebelumnya menulis ULANG semua sheet pada setiap sync:
     7 sheet x (clearContents + setValues header + setValues semua baris)
   plus 7 panggilan getSheetByName untuk memastikan tab-nya ada.
   Hitungannya ~50 panggilan SpreadsheetApp per sync, dan setiap panggilan itu
   perjalanan bolak-balik ke server Google (biasanya 100-500ms). Jadi satu sync
   bisa 10-20 detik, dan makin banyak transaksi makin lama karena seluruh isi
   tabel ikut dikirim ulang setiap kali.

   Versi ini hanya menulis sheet yang ISINYA BERUBAH:
     - semua sheet diambil sekali lewat getSheets() (1 panggilan, bukan 14)
     - isi tiap sheet disidik jari (MD5) dan dibandingkan dengan sidik jari yang
       terakhir ditulis; kalau sama persis, sheet itu dilewati sama sekali
     - sidik jari dibaca dan ditulis borongan (getProperties/setProperties),
       bukan satu per satu
     - jadi sync rutin (mis. baru menambah 1 transaksi) hanya menyentuh
       transactions + audit_log, bukan ketujuh sheet

   Hasil hitungan, untuk sync yang mengubah 2 dari 7 sheet:
     sebelum : ~50 panggilan SpreadsheetApp
     sesudah : ~17 panggilan SpreadsheetApp + 2 panggilan Properties
   Dan kalau tidak ada yang berubah sama sekali: ~9 panggilan.

   CATATAN KEAMANAN: sidik jari disimpan di Script Properties, jadi kalau Sheet
   disentuh manual (baris ditambah/dihapus) pengecekannya gagal dan sheet itu
   ditulis ulang. Nilai yang diubah manual di dalam baris tetap bisa tertimpa
   saat datanya berubah dari aplikasi — sama seperti versi sebelumnya, karena
   aplikasi ini yang jadi sumber kebenaran (Sheet adalah cerminnya).
   ========================================================================= */

const SPREADSHEET_ID = "ISI_SPREADSHEET_ID";
const REQUIRED_TABS = ["accounts", "transactions", "budgets", "goals", "debts", "settings", "audit_log"];

/* Header tiap sheet. Urutannya harus sama dengan versi sebelumnya supaya Sheet
   yang sudah ada tidak perlu diubah dan tetap terbaca oleh versi lama. */
const SHEET_SPECS = {
  accounts: ["id", "name", "type", "balance", "active"],
  transactions: ["id", "date", "type", "category", "amount", "accountId", "note"],
  budgets: ["id", "month", "category", "limit"],
  goals: ["id", "name", "target", "current", "deadline"],
  debts: ["id", "name", "amount", "dueDate", "paid"],
  settings: ["key", "value"],
  audit_log: ["id", "at", "action", "detail"]
};

const HASH_PREFIX = "zigsfi_hash_";
const DATA_REVISION_KEY = "zigsfi_data_revision";
const MUTATION_LOG_SHEET = "_zigsfi_mutations";

function dataRevision() {
  return PropertiesService.getScriptProperties().getProperty(DATA_REVISION_KEY) || "0";
}

function bumpDataRevision() {
  var next = String(Number(dataRevision()) + 1);
  PropertiesService.getScriptProperties().setProperty(DATA_REVISION_KEY, next);
  return next;
}

function withDataReadLock(callback) {
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(25000)) throw new Error("Data sedang disinkronkan — coba tarik lagi sebentar.");
    return callback();
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === "ping" || action === "load" || action === "load-meta" || action === "load-page") {
    try {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      if (action === "ping") {
        var pingSheets = sheetMap(ss);
        return json({ ok: true, message: "connected", remoteHasData: remoteHasData(pingSheets), capabilities: ["mutations-v1", "paged-load-v1"] });
      }
      return withDataReadLock(function() {
        var sheets = sheetMap(ss);
        if (action === "load") return json({ ok: true, payload: loadState(ss, sheets) });
      if (action === "load-meta") {
        var txSheet = sheets.transactions;
        var totalTransactions = txSheet ? Math.max(0, txSheet.getLastRow() - 1) : 0;
        return json({ ok: true, totalTransactions: totalTransactions, revision: dataRevision(), payload: {
          accounts: readSheetObjects(ss, "accounts", sheets),
          transactions: [],
          budgets: readSheetObjects(ss, "budgets", sheets),
          goals: readSheetObjects(ss, "goals", sheets),
          bills: readSheetObjects(ss, "debts", sheets),
          settings: readSettings(ss, sheets),
          auditLog: readSheetObjects(ss, "audit_log", sheets)
        }});
      }
        if (action === "load-page") return json(loadPage(sheets, e.parameter || {}));
        throw new Error("unknown action");
      });
    } catch (err) {
      return json({ ok: false, message: err.message });
    }
  }
  return json({ ok: false, message: "unknown action" });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    /* Dua tab/perangkat dapat menekan Sync bersamaan. Tanpa lock, keduanya bisa
       clearContents lalu setValues pada sheet yang sama secara bersilangan. */
    if (!lock.tryLock(25000)) {
      return json({ ok: false, retryable: true, message: "Sinkronisasi lain masih berjalan. Mencoba lagi." });
    }
    var body = parseBody(e);
    if (body.action === "mutate") {
      return json(applyMutations(SpreadsheetApp.openById(SPREADSHEET_ID), body.mutations || [], body.payload || {}));
    }
    if (body.action !== "sync") throw new Error("unsupported action");

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheets = sheetMap(ss);
    var payload = body.payload || {};

    /* Susun daftar pekerjaan dulu, lalu kerjakan hanya yang perlu. */
    var pekerjaan = [
      ["accounts", payload.accounts || []],
      ["transactions", payload.transactions || []],
      ["budgets", payload.budgets || []],
      ["goals", payload.goals || []],
      ["debts", payload.bills || []],
      ["settings", flattenSettings(payload.settings || {})],
      ["audit_log", payload.auditLog || []]
    ];

    var props = PropertiesService.getScriptProperties();
    /* Ambil SEMUA sidik jari sekali jalan. getProperty satu per satu berarti 7 perjalanan
       tambahan ke server Properties hanya untuk membaca data yang sangat kecil. */
    var tersimpanSemua = props.getProperties();
    var sidikBaru = {};
    var ditulis = [];
    var dilewati = [];

    pekerjaan.forEach(function(item) {
      var name = item[0];
      var header = SHEET_SPECS[name];
      var rows = item[1];
      var sh = sheets[name];

      var cetak = fingerprint(header, rows);
      var tersimpan = tersimpanSemua[HASH_PREFIX + name];

      /* Lewati kalau: sheet sudah ada, isinya belum pernah berubah sejak terakhir
         ditulis, DAN jumlah barisnya masih pas (jaring pengaman untuk Sheet yang
         disentuh manual). */
      if (sh && tersimpan === cetak && sh.getLastRow() === rows.length + 1) {
        dilewati.push(name);
        return;
      }

      if (!sh) {
        sh = ss.insertSheet(name);
        sheets[name] = sh;
      }
      writeSheet(sh, header, rows);
      sidikBaru[HASH_PREFIX + name] = cetak;
      ditulis.push(name);
    });

    /* Sekali tulis untuk semua sidik jari yang berubah. */
    if (ditulis.length) props.setProperties(sidikBaru);
    if (ditulis.indexOf("transactions") !== -1) bumpDataRevision();

    return json({
      ok: true,
      syncedAt: new Date().toISOString(),
      ditulis: ditulis,
      dilewati: dilewati
    });
  } catch (err) {
    return json({ ok: false, message: err.message });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function validateMutation(m) {
  if (!m || m.entity !== "transactions" || !m.mutationId || !m.id || (m.op !== "upsert" && m.op !== "delete")) throw new Error("invalid mutation");
  if (m.op === "upsert" && (!m.record || String(m.record.id) !== String(m.id))) throw new Error("invalid mutation record");
}

function applyMutations(ss, mutations, payload) {
  if (!Array.isArray(mutations) || mutations.length > 500) throw new Error("invalid mutations batch");
  // Validasi seluruh batch sebelum write pertama: satu mutation malformed tidak boleh
  // meninggalkan mutation sebelumnya setengah-terapkan lalu mengembalikan respons gagal.
  mutations.forEach(validateMutation);
  var sheets = sheetMap(ss);
  var sh = sheets.transactions;
  if (!sh) {
    sh = ss.insertSheet("transactions");
    sh.getRange(1, 1, 1, SHEET_SPECS.transactions.length).setValues([SHEET_SPECS.transactions]);
  }
  var log = sheets[MUTATION_LOG_SHEET] || ss.insertSheet(MUTATION_LOG_SHEET);
  if (log.getLastRow() === 0) log.getRange(1, 1, 1, 2).setValues([["mutationId", "appliedAt"]]);
  try { log.hideSheet(); } catch (_) {}
  var seen = {};
  if (log.getLastRow() > 1) log.getRange(2, 1, log.getLastRow() - 1, 1).getValues().forEach(function(r) { seen[String(r[0])] = true; });
  var ids = {};
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function(r, i) { ids[String(r[0])] = i + 2; });
  var appliedMutationIds = [];
  var logRows = [];
  mutations.forEach(function(m) {
    if (seen[m.mutationId]) { appliedMutationIds.push(m.mutationId); return; }
    var rowNumber = ids[String(m.id)];
    if (m.op === "delete") {
      if (rowNumber) {
        sh.deleteRow(rowNumber);
        Object.keys(ids).forEach(function(id) { if (ids[id] > rowNumber) ids[id]--; });
        delete ids[String(m.id)];
      }
    } else {
      var record = m.record || {};
      var values = SHEET_SPECS.transactions.map(function(key) { return record[key] == null ? "" : record[key]; });
      if (rowNumber) sh.getRange(rowNumber, 1, 1, values.length).setValues([values]);
      else {
        rowNumber = sh.getLastRow() + 1;
        sh.getRange(rowNumber, 1, 1, values.length).setValues([values]);
        ids[String(m.id)] = rowNumber;
      }
    }
    seen[m.mutationId] = true;
    appliedMutationIds.push(m.mutationId);
    logRows.push([m.mutationId, new Date().toISOString()]);
  });
  if (logRows.length) {
    log.getRange(log.getLastRow() + 1, 1, logRows.length, 2).setValues(logRows);
    bumpDataRevision();
  }
  /* Retensi jurnal mutation ID dibatasi ~5.000 entri terakhir (Improvement 3 review):
     retry yang datang JAUH lebih lambat dari itu (lintasan ribuan mutasi) bisa terlepas dari
     dedup. Aman karena op-nya idempotent — upsert menulis nilai sama, delete baris sudah
     tiada — jadi retry paling-paling menulis ulang hasil identik, tidak pernah menggandakan. */
  if (log.getLastRow() > 5001) log.deleteRows(2, log.getLastRow() - 5001);
  PropertiesService.getScriptProperties().deleteProperty(HASH_PREFIX + "transactions");
  writeAuxiliarySheets(ss, payload || {});
  return { ok: true, appliedMutationIds: appliedMutationIds, syncedAt: new Date().toISOString() };
}

function writeAuxiliarySheets(ss, payload) {
  var sheets = sheetMap(ss);
  var jobs = [
    ["accounts", payload.accounts || []], ["budgets", payload.budgets || []],
    ["goals", payload.goals || []], ["debts", payload.bills || []],
    ["settings", flattenSettings(payload.settings || {})], ["audit_log", payload.auditLog || []]
  ];
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperties();
  var changed = {};
  jobs.forEach(function(item) {
    var name = item[0], rows = item[1], header = SHEET_SPECS[name], sh = sheets[name];
    var nextHash = fingerprint(header, rows);
    if (sh && stored[HASH_PREFIX + name] === nextHash && sh.getLastRow() === rows.length + 1) return;
    if (!sh) sh = ss.insertSheet(name);
    writeSheet(sh, header, rows);
    changed[HASH_PREFIX + name] = nextHash;
  });
  if (Object.keys(changed).length) props.setProperties(changed);
}

function loadPage(sheets, params) {
  var table = String(params.table || "transactions");
  if (table !== "transactions") throw new Error("unsupported paged table");
  var limit = Math.min(1000, Math.max(1, Number(params.limit) || 500));
  var offset = Math.max(0, Number(params.cursor) || 0);
  var sh = sheets[table];
  var total = sh ? Math.max(0, sh.getLastRow() - 1) : 0;
  var count = Math.min(limit, Math.max(0, total - offset));
  var rows = [];
  if (count > 0) {
    var values = sh.getRange(offset + 2, 1, count, SHEET_SPECS.transactions.length).getValues();
    rows = values.map(function(row) {
      var obj = {};
      SHEET_SPECS.transactions.forEach(function(key, i) { obj[key] = row[i]; });
      return obj;
    });
  }
  var next = offset + count;
  return { ok: true, table: table, rows: rows, nextCursor: next < total ? String(next) : null, done: next >= total, total: total, revision: dataRevision() };
}

/* Ambil semua sheet sekali jalan. Versi lama memanggil getSheetByName 7 kali untuk
   memastikan tab ada, plus 7 kali lagi di dalam upsertSheet — 14 perjalanan hanya
   untuk mencari sheet yang sama. */
function sheetMap(ss) {
  var map = {};
  ss.getSheets().forEach(function(sh) { map[sh.getName()] = sh; });
  return map;
}

/* Sidik jari isi sheet. MD5 lewat Utilities (native, cepat) atas header + semua baris.
   Dipakai untuk memutuskan perlu tulis ulang atau tidak. */
function fingerprint(header, rows) {
  var bagian = [header.join("\u0001")];
  for (var i = 0; i < rows.length; i++) {
    var baris = rows[i];
    bagian.push(header.map(function(key) {
      var v = baris[key];
      return v == null ? "" : String(v);
    }).join("\u0001"));
  }
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    bagian.join("\u0002"),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    return ((b & 0xFF) + 0x100).toString(16).slice(1);
  }).join("");
}

function writeSheet(sh, header, rows) {
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (!rows.length) return;
  var values = rows.map(function(row) {
    return header.map(function(key) {
      return row[key] == null ? "" : row[key];
    });
  });
  sh.getRange(2, 1, values.length, header.length).setValues(values);
}

function parseBody(e) {
  if (!e) return {};
  if (e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }
  var raw = (e.postData && e.postData.contents) || "";
  if (!raw) return {};

  var payloadMatch = raw.match(/(?:^|&)payload=([^&]+)/);
  if (payloadMatch && payloadMatch[1]) {
    return JSON.parse(decodeURIComponent(payloadMatch[1].replace(/\+/g, "%20")));
  }

  try {
    return JSON.parse(raw);
  } catch (_) {}

  throw new Error("invalid request payload");
}

function readSheetObjects(ss, name, sheets) {
  var sh = (sheets || sheetMap(ss))[name];
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var header = values.shift().map(String);
  return values.filter(function(row) {
    return row.some(function(v) { return v !== ""; });
  }).map(function(row) {
    var obj = {};
    header.forEach(function(key, i) { obj[key] = row[i]; });
    return obj;
  });
}

function readSettings(ss, sheets) {
  var result = {};
  readSheetObjects(ss, "settings", sheets).forEach(function(row) {
    var value = row.value;
    try { value = JSON.parse(value); } catch (_) {}
    result[row.key] = value;
  });
  return result;
}

function loadState(ss, sheets) {
  sheets = sheets || sheetMap(ss);
  return {
    accounts: readSheetObjects(ss, "accounts", sheets),
    transactions: readSheetObjects(ss, "transactions", sheets),
    budgets: readSheetObjects(ss, "budgets", sheets),
    goals: readSheetObjects(ss, "goals", sheets),
    bills: readSheetObjects(ss, "debts", sheets),
    settings: readSettings(ss, sheets),
    auditLog: readSheetObjects(ss, "audit_log", sheets)
  };
}

function remoteHasData(sheets) {
  return ["accounts", "transactions", "budgets", "goals", "debts", "audit_log"].some(function(name) {
    var sh = sheets[name];
    return sh && sh.getLastRow() > 1;
  });
}

function flattenSettings(settings) {
  return Object.keys(settings).map(function(k) {
    var v = settings[k];
    return {
      key: k,
      value: typeof v === "object" ? JSON.stringify(v) : String(v)
    };
  });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
