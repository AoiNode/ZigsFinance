import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("production build creates a complete static Vercel artifact", () => {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: process.cwd() });
  for (const file of [
    "dist/index.html",
    "dist/tutorial.html",
    "dist/src/app.js",
    "dist/src/styles.css",
    "dist/manifest.webmanifest",
    "dist/sw.js",
    "dist/icons/icon-192.png",
    "dist/apps-script/Code.gs"
  ]) assert.equal(existsSync(file), true, `${file} is missing`);
  assert.match(readFileSync("dist/index.html", "utf8"), /Zigs\.fi/);
});
