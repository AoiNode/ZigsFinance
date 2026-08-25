import { cp, copyFile, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of [
  "index.html",
  "tutorial.html",
  "manifest.webmanifest",
  "sw.js",
  "README.md",
  "google-apps-script.txt"
]) {
  await copyFile(new URL(file, root), new URL(file, dist));
}

for (const dir of ["src", "icons", "apps-script"]) {
  await cp(new URL(`${dir}/`, root), new URL(`${dir}/`, dist), { recursive: true });
}

console.log("Static build ready in dist/");
