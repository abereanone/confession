// Adds the plural mark (you+, your+, yours+) to BSB quotations inside book sources.
//
//   node shared/data/scripts/mark-plural-you-in-text.mjs [--write] [--min N] FILE...
//
// A quotation is only marked where the text cites it. Each file is cut into blocks (paragraphs,
// and each footnote definition `[^n]: ...` on its own); in a block that cites a verse changed by
// mark-plural-you.mjs (bsb.changes.json, type "plural_you"), a run of at least N (default 4)
// consecutive words of that verse, ignoring case and punctuation, gets you/your/yours marked
// inside the run. Prose outside the run, and verses the block does not cite, are left alone, so
// "Love the Lord your God with all your heart" under Matthew 22:37 (singular in the KJV) is not
// marked even though Joshua 22:5 shares the words. Words already followed by + are skipped, so it
// is safe to rerun. Without --write it only reports; read the report before writing.
//
// Citations it understands: "John 15:14", "1 Pet. 2:21", "Matthew 5:11-12", "Rom 8:15, 28",
// `<cite>Psalm 18:3–4</cite>`. A block whose quotation is cited in a different block (a
// quotation followed by its reference on the next paragraph) is not marked: the report of
// "cited but no run found" lists those for checking by hand.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const write = args.includes("--write");
const minIdx = args.indexOf("--min");
const MIN = minIdx >= 0 ? Number(args[minIdx + 1]) : 4;
const files = args.filter((a, i) => !a.startsWith("--") && !(minIdx >= 0 && i === minIdx + 1));

const changes = JSON.parse(await readFile(path.join(here, "../bsb.changes.json"), "utf8")).filter(
  (c) => c.type === "plural_you"
);
const bookMap = JSON.parse(await readFile(path.join(here, "../../../apps/web/src/lib/bible/bookMap.json"), "utf8"));
Object.assign(bookMap, { psalm: "psa", "song of songs": "sng", "song of solomon": "sng" });

const WORD = /[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g;
const norm = (w) => w.toLowerCase().replace(/’/g, "'");
const YOU = new Set(["you", "your", "yours"]);
const plural = new Map(changes.map((c) => [`${c.book} ${c.chapter}:${c.verse}`, [...c.before.matchAll(WORD)].map((m) => norm(m[0]))]));

const names = Object.keys(bookMap).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
const REF = new RegExp(`\\b(${names.join("|")})\\.?\\s+(\\d+):(\\d+(?:\\s*[-–—]\\s*\\d+)?(?:\\s*,\\s*\\d+(?:\\s*[-–—]\\s*\\d+)?(?![:\\d]))*)`, "gi");

function citedVerses(block) {
  const out = new Set();
  for (const m of block.matchAll(REF)) {
    const code = bookMap[m[1].toLowerCase().replace(/\s+/g, " ")];
    if (!code) continue;
    for (const part of m[3].split(",")) {
      const [a, b] = part.split(/[-–—]/).map((s) => Number(s.trim()));
      for (let v = a; v <= (b || a); v++) out.add(`${code} ${m[2]}:${v}`);
    }
  }
  return out;
}

// Paragraphs, with each footnote definition as its own block. Returns [start, end] offsets.
function blocks(text) {
  const out = [];
  const re = /\n[ \t]*\n|\n(?=\[\^[^\]]+\]:)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push([last, m.index]);
    last = m.index + m[0].length;
  }
  out.push([last, text.length]);
  return out;
}

let total = 0;
const unmatched = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  const marks = new Map(); // offset of word end -> {ref, start}
  for (const [bs, be] of blocks(text)) {
    const block = text.slice(bs, be);
    const cited = [...citedVerses(block)].filter((r) => plural.has(r));
    if (!cited.length) continue;
    const toks = [...block.matchAll(WORD)].map((m) => ({ w: norm(m[0]), start: bs + m.index, end: bs + m.index + m[0].length }));
    for (const ref of cited) {
      const vw = plural.get(ref);
      let found = false;
      for (let t = 0; t < toks.length; t++) {
        for (let i = 0; i < vw.length; i++) {
          if (toks[t].w !== vw[i]) continue;
          if (t > 0 && i > 0 && toks[t - 1].w === vw[i - 1]) continue; // not the start of a run
          let n = 0;
          while (t + n < toks.length && i + n < vw.length && toks[t + n].w === vw[i + n]) n++;
          if (n < MIN) continue;
          found = true;
          for (let k = t; k < t + n; k++)
            if (YOU.has(toks[k].w) && text[toks[k].end] !== "+") marks.set(toks[k].end, { ref, start: toks[k].start });
        }
      }
      if (!found && vw.some((w) => YOU.has(w))) unmatched.push(`${file}: ${ref} cited, no quotation run found`);
    }
  }
  if (!marks.size) continue;
  console.log(`== ${file}: ${marks.size} word(s)`);
  const flat = (s) => s.replace(/\s+/g, " ");
  for (const [end, { ref, start }] of [...marks].sort((a, b) => a[0] - b[0]))
    console.log(`   ${ref.padEnd(10)} …${flat(text.slice(Math.max(0, start - 60), start))}[${text.slice(start, end)}+]${flat(text.slice(end, end + 40))}…`);
  total += marks.size;
  if (write) {
    let out = text;
    for (const end of [...marks.keys()].sort((a, b) => b - a)) out = out.slice(0, end) + "+" + out.slice(end);
    await writeFile(file, out, "utf8");
  }
}
if (unmatched.length) console.log(`\nCited plural verses with no quotation found (check by hand; often a reference without a quote):\n  ${unmatched.join("\n  ")}`);
console.log(`\n${total} word(s) ${write ? "marked" : "would be marked"} in ${files.length} file(s) checked`);
