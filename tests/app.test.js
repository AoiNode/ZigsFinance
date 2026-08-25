import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, validateSheetUrl } from "../src/utils.js";

test("validateSheetUrl only accepts Google Sheets URL", () => {
  assert.equal(validateSheetUrl("https://docs.google.com/spreadsheets/d/abc123/edit"), true);
  assert.equal(validateSheetUrl("https://example.com/sheets/d/abc"), false);
});

test("parseCsv parses expected rows", () => {
  const csv = "date,type,category,amount,account,note\n2026-01-01,expense,Makan,20000,Kas,sarapan";
  const rows = parseCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "Makan");
  assert.equal(rows[0].amount, "20000");
});

