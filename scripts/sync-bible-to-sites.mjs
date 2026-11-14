// Copies the modified BSB (confession's master) into every sibling site.
//
//   node scripts/sync-bible-to-sites.mjs          write the copies
//   node scripts/sync-bible-to-sites.mjs --check  report drift, change nothing (exit 1 if any)
//
// Master: shared/data/bsb.json plus the single-verse overrides in
// shared/data/bible-cited.json. Overrides are baked into the copies as per-verse
// { text, version } entries so sites that do not read bible-cited.json still
// show them, labelled with the right translation.
//
// Targets (siblings under C:\code):
//   Astro sites    <site>/bsb-data-pipeline/bsb.json        same shape as the master
//   Static sites   <site>/<dir>/bible-tooltips-verses.json  { version, verses: { "gen 1:1": text | {text, version} } }
//
// After syncing, commit each site and push it yourself; sites deploy from GitHub.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const confessionRoot = path.resolve(here, "..");
const codeRoot = path.resolve(confessionRoot, "..");
const checkOnly = process.argv.includes("--check");

const astroSites = [
  "catechize.ing",
  "suffering.catechize.ing",
  "abolition.ing",
  "heritage-restored-site",
];
const staticSites = [
  { site: "thingsabove.us", dir: "assets" },
  { site: "michaelcoughlin.net", dir: "mnet-shared" },
  { site: "macaudio", dir: "public/bible" },
];

const bsb = JSON.parse(await readFile(path.join(confessionRoot, "shared/data/bsb.json"), "utf8"));
const cited = JSON.parse(await readFile(path.join(confessionRoot, "shared/data/bible-cited.json"), "utf8"));

// Apply single-verse overrides ("1jn 5:7"). Ranges and `parts` entries are left to
// confession's own runtime lookup, which is the only place that understands them.
const overrides = [];
for (const [key, entry] of Object.entries(cited.verses ?? {})) {
  const m = key.match(/^([1-3]?[a-z]+)\s+(\d+):(\d+)$/);
  if (!m || typeof entry !== "object" || typeof entry.text !== "string") {
    console.warn(`skipping override "${key}" (not a single verse with text)`);
    continue;
  }
  const verse = bsb[m[1]]?.[Number(m[2]) - 1]?.[Number(m[3]) - 1];
  if (!verse) {
    console.warn(`skipping override "${key}" (verse not in bsb.json)`);
    continue;
  }
  verse.text = entry.text;
  if (entry.version && entry.version.toUpperCase() !== "BSB") verse.version = entry.version;
  else delete verse.version;
  overrides.push(key);
}

const bsbOut = JSON.stringify(bsb, null, 2) + "\n";

const tooltipVerses = {};
for (const [code, chapters] of Object.entries(bsb)) {
  chapters.forEach((chapter, ci) =>
    chapter.forEach((v) => {
      const key = `${code} ${ci + 1}:${v.verse}`;
      tooltipVerses[key] = v.version ? { text: v.text, version: v.version } : v.text;
    })
  );
}
const tooltipOut = JSON.stringify({ version: "BSB", verses: tooltipVerses }) + "\n";

async function sync(file, content) {
  let current = null;
  try {
    current = await readFile(file, "utf8");
  } catch {}
  const rel = path.relative(codeRoot, file);
  if (current === content) {
    console.log(`  ok      ${rel}`);
    return false;
  }
  if (checkOnly) {
    console.log(`  DRIFT   ${rel}`);
    return true;
  }
  await writeFile(file, content);
  console.log(`  synced  ${rel}`);
  return true;
}

console.log(`Master: confession/shared/data (${overrides.length} override(s) applied: ${overrides.join(", ") || "none"})`);
let changed = 0;
for (const site of astroSites) {
  if (await sync(path.join(codeRoot, site, "bsb-data-pipeline", "bsb.json"), bsbOut)) changed++;
}
for (const { site, dir } of staticSites) {
  if (await sync(path.join(codeRoot, site, dir, "bible-tooltips-verses.json"), tooltipOut)) changed++;
}

if (checkOnly && changed) {
  console.log(`\n${changed} file(s) out of date. Run: node scripts/sync-bible-to-sites.mjs`);
  process.exit(1);
}
console.log(checkOnly ? "\nAll sites match the master." : `\n${changed} file(s) written.`);
