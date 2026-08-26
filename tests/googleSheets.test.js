import test from "node:test";
import assert from "node:assert/strict";
import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES, SHEET_TABS, sheetUrl, stateToSheetValues } from "../src/googleSheets.js";

test("Google OAuth uses configured public client id and minimum file scopes", async () => {
  assert.equal(GOOGLE_CLIENT_ID, "1080886660072-p6m6obifssalemf9ruefv2egid0fqlsd.apps.googleusercontent.com");
  assert.match(GOOGLE_SCOPES, /drive\.file/);
  assert.match(GOOGLE_SCOPES, /spreadsheets/);
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/googleSheets.js", import.meta.url), "utf8"));
  assert.match(source, /locale: "id"/);
  assert.doesNotMatch(source, /id_ID/);
  assert.doesNotMatch(GOOGLE_SCOPES, /auth\/drive(?:\s|$)/);
});

test("automatic spreadsheet contains the existing application schema", () => {
  assert.deepEqual(SHEET_TABS, ["accounts", "transactions", "budgets", "goals", "debts", "settings", "audit_log"]);
  const values = stateToSheetValues({
    accounts: [{ id: "main", name: "Dompet Utama", type: "cash", balance: 1000, active: true }],
    transactions: [{ id: "t1", date: "2026-08-25", type: "income", category: "Gaji", amount: 1000, accountId: "main", note: "" }],
    budgets: [], goals: [], bills: [], auditLog: [], settings: { googleSpreadsheetId: "abc" }
  });
  assert.deepEqual(values.transactions[0], ["id", "date", "type", "category", "amount", "accountId", "note"]);
  assert.equal(values.transactions[1][4], 1000);
  assert.equal(sheetUrl("abc"), "https://docs.google.com/spreadsheets/d/abc/edit");
});

test("source contains no Google client secret or durable access token storage", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/googleSheets.js", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /client_secret/i);
  assert.doesNotMatch(source, /localStorage\.setItem\([^)]*(access|refresh)[_-]?token/i);
});
