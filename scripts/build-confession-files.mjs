import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sharedDataDir = path.join(root, "shared", "data");
const splitDir = path.join(sharedDataDir, "confessions");
const legacyAggregateFile = path.join(sharedDataDir, "confessions.json");
const manifestFile = path.join(splitDir, "manifest.json");

const updatedAt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
}).format(new Date());
const base = await loadBaseConfessions();
const canonsOfDordt = await loadSplitConfession("canons-of-dordt");

const bySlug = new Map(base.map((item) => [item.slug, item]));
if (canonsOfDordt) {
  bySlug.set(canonsOfDordt.slug, canonsOfDordt);
}

const orderedSlugs = [
  ...base.map((item) => item.slug).filter((slug) => slug !== "canons-of-dordt"),
  ...(canonsOfDordt ? ["canons-of-dordt"] : []),
];

await mkdir(splitDir, { recursive: true });

for (const slug of orderedSlugs) {
  const confession = bySlug.get(slug);
  if (!confession) {
    continue;
  }

  await writeJson(path.join(splitDir, `${slug}.json`), confession);
}

await writeJson(manifestFile, {
  updatedAt,
  slugs: orderedSlugs,
});

await rm(legacyAggregateFile, { force: true });

console.log(
  `wrote ${orderedSlugs.length} confession files and manifest to ${path.relative(root, splitDir)}`
);

async function loadBaseConfessions() {
  const legacyText = await tryRead(legacyAggregateFile);
  if (legacyText) {
    const legacy = JSON.parse(legacyText);
    return Array.isArray(legacy.items) ? legacy.items : [];
  }

  const manifestText = await tryRead(manifestFile);
  const manifest = manifestText ? JSON.parse(manifestText) : null;
  const preferredOrder = Array.isArray(manifest?.slugs) ? manifest.slugs : [];

  const files = (await readdir(splitDir)).filter(
    (file) => file.endsWith(".json") && file !== "manifest.json"
  );

  const loaded = [];
  for (const file of files) {
    const fullPath = path.join(splitDir, file);
    const content = await readFile(fullPath, "utf-8");
    loaded.push(JSON.parse(content));
  }

  if (preferredOrder.length === 0) {
    return loaded.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }

  const bySlug = new Map(loaded.map((item) => [item.slug, item]));
  return preferredOrder
    .map((slug) => bySlug.get(slug))
    .filter(Boolean)
    .concat(loaded.filter((item) => !preferredOrder.includes(item.slug)));
}

async function tryRead(filePath) {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function loadSplitConfession(slug) {
  const text = await tryRead(path.join(splitDir, `${slug}.json`));
  return text ? JSON.parse(text) : null;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}
