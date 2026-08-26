import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Google mode schedules automatic sync and exposes no manual sync button", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(source, /scheduleAutoSync\(\)/);
  assert.match(source, /setTimeout\(autoSyncToGoogle, 700\)/);
  assert.match(source, /sessionStorage\.setItem\(GOOGLE_SESSION_KEY/);
  assert.match(source, /expiresAt/);
  assert.doesNotMatch(source, /id="syncNowBtn/);
  assert.doesNotMatch(source, /onclick = syncToGoogleSheet/);
});
