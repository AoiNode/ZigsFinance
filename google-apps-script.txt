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

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === "ping" || action === "load") {
    try {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheets = sheetMap(ss);
      if (action === "load") return json({ ok: true, payload: loadState(ss, sheets) });
      return json({ ok: true, message: "connected", remoteHasData: remoteHasData(sheets) });
    } catch (err) {
      return json({ ok: false, message: err.message });
    }
  }
  return json({ ok: false, message: "unknown action" });
}

function doPost(e) {
  try {
    var body = parseBody(e);
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

    return json({
      ok: true,
      syncedAt: new Date().toISOString(),
      ditulis: ditulis,
      dilewati: dilewati
    });
  } catch (err) {
    return json({ ok: false, message: err.message });
  }
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
