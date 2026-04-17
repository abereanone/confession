import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sharedConfessions = path.join(root, "shared", "data", "confessions.json");

const targets = [
  path.join(root, "apps", "web", "src", "data", "confessions.json"),
  path.join(root, "apps", "mobile", "src", "data", "confessions.json"),
];

const content = await readFile(sharedConfessions, "utf-8");

for (const target of targets) {
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  console.log(`synced ${path.relative(root, target)}`);
}

