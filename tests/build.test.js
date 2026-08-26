import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("production build creates a complete static Vercel artifact", () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: process.cwd() });
  for (const file of [
    "dist/index.html",
    "dist/src/app.js",
    "dist/src/googleSheets.js",
    "dist/src/styles.css",
    "dist/manifest.webmanifest",
    "dist/sw.js",
    "dist/icons/icon-192.png",
    "dist/icons/icon-512.png"
  ]) assert.equal(existsSync(file), true, `${file} is missing`);
  assert.match(readFileSync("dist/index.html", "utf8"), /Zigs\.fi/);
});
