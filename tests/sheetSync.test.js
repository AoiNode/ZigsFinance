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

test("empty local state cannot overwrite a populated remote Spreadsheet without confirmation", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(source, /REMOTE_DATA_EXISTS/);
  assert.match(source, /Spreadsheet sudah berisi data/);
});
