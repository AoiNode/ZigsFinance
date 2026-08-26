const SPREADSHEET_ID = "ISI_SPREADSHEET_ID";
const REQUIRED_TABS = ["accounts", "transactions", "budgets", "goals", "debts", "settings", "audit_log"];

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === "ping") {
    try {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      ensureRequiredTabs(ss);
      return json({ ok: true, message: "connected" });
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
    ensureRequiredTabs(ss);

    var payload = body.payload || {};
    upsertSheet(ss, "accounts", ["id", "name", "type", "balance", "active"], payload.accounts || []);
    upsertSheet(ss, "transactions", ["id", "date", "type", "category", "amount", "accountId", "note"], payload.transactions || []);
    upsertSheet(ss, "budgets", ["id", "month", "category", "limit"], payload.budgets || []);
    upsertSheet(ss, "goals", ["id", "name", "target", "current", "deadline"], payload.goals || []);
    upsertSheet(ss, "debts", ["id", "name", "amount", "dueDate", "paid"], payload.bills || []);
    upsertSheet(ss, "settings", ["key", "value"], flattenSettings(payload.settings || {}));
    upsertSheet(ss, "audit_log", ["id", "at", "action", "detail"], payload.auditLog || []);

    return json({ ok: true, syncedAt: new Date().toISOString() });
  } catch (err) {
    return json({ ok: false, message: err.message });
  }
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

function ensureRequiredTabs(ss) {
  REQUIRED_TABS.forEach(function(name) {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
}

function upsertSheet(ss, name, header, rows) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

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
