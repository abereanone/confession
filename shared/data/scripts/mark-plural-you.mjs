// Marks the second person plural in bsb.json: "you" -> "you+", "your" -> "your+", "yours" -> "yours+".
//
//   node shared/data/scripts/mark-plural-you.mjs [path/to/kjv.json]
//
// English "you" is both singular and plural; the KJV kept them apart (thou/thee/thy singular,
// ye/you/your plural). A verse is marked only when its KJV text has plural pronouns and no
// singular ones, and then every you/your/yours in the BSB verse gets the +. Left alone:
//   - verses whose KJV mixes singular and plural (the plural one cannot be picked safely),
//   - verses whose KJV has no second person pronoun (no evidence either way),
//   - "yourselves" (already plural) and "yourself" (singular),
//   - verses carrying their own non-BSB text (`version`, e.g. KJV insertions).
// Each changed verse is logged in bsb.changes.json as type "plural_you". Safe to rerun:
// a word already followed by + is not marked again.
//
// KJV source: baptistcatechism.org/lib/kjv.json (sibling repo), or the path given.
// Afterwards run scripts/sync-bible-to-sites.mjs to copy the master to the other sites.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "..");
const codeRoot = path.resolve(dataDir, "../../..");
const kjvFile = process.argv[2] ?? path.join(codeRoot, "baptistcatechism.org/lib/kjv.json");

const bsbFile = path.join(dataDir, "bsb.json");
const changesFile = path.join(dataDir, "bsb.changes.json");
const bsb = JSON.parse(await readFile(bsbFile, "utf8"));
const changes = JSON.parse(await readFile(changesFile, "utf8"));
const kjvRaw = JSON.parse(await readFile(kjvFile, "utf8"));

// kjv.json uses upper-case codes; three differ from bsb.json's.
const kjvCode = { MAR: "mrk", NAM: "nah", PHL: "phm" };
const kjv = {};
for (const [code, chapters] of Object.entries(kjvRaw)) kjv[kjvCode[code] ?? code.toLowerCase()] = chapters;

const PLURAL = /\b(ye|you|your|yours|yourselves)\b/i;
const SINGULAR = /\b(thou|thee|thy|thine|thyself)\b/i;
const MARK = /\b(you|your|yours)\b(?!\+)/gi;

let verses = 0;
let words = 0;
for (const [code, chapters] of Object.entries(bsb)) {
  if (!kjv[code]) throw new Error(`no KJV book for "${code}"`);
  chapters.forEach((chapter, ci) =>
    chapter.forEach((v) => {
      if (v.version) return;
      const kv = kjv[code][ci]?.[v.verse - 1];
      if (!kv || !PLURAL.test(kv) || SINGULAR.test(kv)) return;
      let n = 0;
      const after = v.text.replace(MARK, (w) => (n++, `${w}+`));
      if (!n) return;
      changes.push({ book: code, chapter: ci + 1, verse: v.verse, type: "plural_you", before: v.text, after });
      v.text = after;
      verses++;
      words += n;
    })
  );
}

await writeFile(bsbFile, `${JSON.stringify(bsb, null, 2)}\n`, "utf8");
await writeFile(changesFile, `${JSON.stringify(changes, null, 2)}\n`, "utf8");
console.log(`marked ${words} words in ${verses} verses`);
