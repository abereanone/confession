import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sharedConfessionsDir = path.join(root, "shared", "data", "confessions");

const targets = [
  path.join(root, "apps", "web", "src", "data", "confessions"),
  path.join(root, "apps", "mobile", "src", "data", "confessions"),
];
const legacyTargets = [
  path.join(root, "apps", "web", "src", "data", "confessions.json"),
  path.join(root, "apps", "mobile", "src", "data", "confessions.json"),
];

for (const target of targets) {
  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await cp(sharedConfessionsDir, target, { recursive: true });
  console.log(`synced ${path.relative(root, target)}`);
}

for (const target of legacyTargets) {
  await rm(target, { force: true });
}
