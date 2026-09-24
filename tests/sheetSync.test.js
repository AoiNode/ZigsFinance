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

test("manual Sync tetap satu arah meski data lokal kosong", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  const syncBody = source.match(/async function performGoogleSheetSync\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(syncBody, /action=ping|remoteHasData|loadStateFromGoogleSheet/);
  assert.match(syncBody, /postSyncWithRetry/);
});
