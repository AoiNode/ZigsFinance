import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseCsv, validateSheetUrl, PERIOD_MODES, periodMode, periodBounds, periodRangeLabel, inPeriod, sumInPeriod } from "../src/utils.js";

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

const DAY = (y, m, d) => new Date(y, m - 1, d, 12);

test("periodBounds uses local calendar days for harian, mingguan, bulanan", () => {
  const friday = DAY(2026, 9, 11);
  assert.deepEqual(periodBounds("day", friday), { from: "2026-09-11", to: "2026-09-11" });
  assert.deepEqual(periodBounds("week", friday), { from: "2026-09-07", to: "2026-09-13" });
  assert.deepEqual(periodBounds("month", friday), { from: "2026-09-01", to: "2026-09-30" });
});

test("week scope starts on Monday and can cross a month boundary", () => {
  assert.deepEqual(periodBounds("week", DAY(2026, 9, 1)), { from: "2026-08-31", to: "2026-09-06" });
  assert.deepEqual(periodBounds("week", DAY(2026, 9, 7)), { from: "2026-09-07", to: "2026-09-13" });
  assert.equal(periodRangeLabel("week", DAY(2026, 9, 1)), "31 Agu\u20136 Sep 2026");
});

test("month scope handles februari and leap years", () => {
  assert.deepEqual(periodBounds("month", DAY(2028, 2, 10)), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(periodBounds("month", DAY(2027, 2, 10)), { from: "2027-02-01", to: "2027-02-28" });
});

test("period labels are Indonesian, short, and human readable", () => {
  const friday = DAY(2026, 9, 11);
  assert.equal(periodRangeLabel("day", friday), "11 Sep 2026");
  assert.equal(periodRangeLabel("week", friday), "7\u201313 Sep 2026");
  assert.equal(periodRangeLabel("month", friday), "September 2026");
  assert.equal(periodMode("week").label, "minggu ini");
  assert.equal(periodMode("nonsense").label, "bulan ini");
  assert.equal(PERIOD_MODES.length, 3);
});

test("sumInPeriod scopes amounts without bleeding across year or period", () => {
  const transactions = [
    { date: "2026-09-11", type: "expense", amount: 50000 },
    { date: "2026-09-11", type: "income", amount: 200000 },
    { date: "2026-09-07", type: "expense", amount: 25000 },
    { date: "2025-09-15", type: "expense", amount: 900000 },
    { date: "2026-10-01", type: "expense", amount: 700000 }
  ];
  const friday = DAY(2026, 9, 11);
  assert.equal(sumInPeriod(transactions, "expense", periodBounds("day", friday)), 50000);
  assert.equal(sumInPeriod(transactions, "expense", periodBounds("week", friday)), 75000);
  assert.equal(sumInPeriod(transactions, "expense", periodBounds("month", friday)), 75000);
  assert.equal(sumInPeriod(transactions, "income", periodBounds("month", friday)), 200000);
});

test("inPeriod tolerates timestamps and rejects malformed dates", () => {
  const bounds = periodBounds("month", DAY(2026, 9, 11));
  assert.equal(inPeriod({ date: "2026-09-11T08:30:00Z" }, bounds), true);
  assert.equal(inPeriod({ date: "" }, bounds), false);
  assert.equal(inPeriod({}, bounds), false);
  assert.equal(inPeriod({ date: "11/09/2026" }, bounds), false);
});

test("dashboard and reports both expose the period switch and its handler", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /periodSwitch\("dashboard"\)/);
  assert.match(app, /periodSwitch\("reports"\)/);
  assert.match(app, /data-period-kind/);
  assert.match(app, /setPeriodScope\(periodOption\.dataset\.periodKind, periodOption\.dataset\.periodMode\)/);
  assert.match(app, /finance_os_period_scope/);
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(sw, /zigs-fi-shell-v\d+/);
});

