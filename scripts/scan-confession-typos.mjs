// Scan one confession for scan/OCR-type damage: words the rest of the corpus
// has never seen, glued or stray punctuation, mid-sentence capitals, doubled
// words and common word swaps.
//
//   node scripts/scan-confession-typos.mjs second-helvetic-confession
//
// Vocabulary comes from every *other* confession plus the BSB, so a clean run
// on a new import still lists legitimate rare words (proper names, Latin
// citations). Read the "unknown words" list by eye; the pattern hits are
// higher signal. It cannot see a real word used wrongly (`out salvation`,
// `their is`) unless a swap pattern below matches — diff against a printed
// edition for those (see CLAUDE.md, "Verifying text against an outside
// edition").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const slug = process.argv[2];
if (!slug) {
  console.error('usage: node scripts/scan-confession-typos.mjs <slug>');
  process.exit(1);
}

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'data');
const confDir = path.join(dataDir, 'confessions');
const stripProofs = (s) => s.replace(/\s*\{\{proofs:[^}]*\}\}/g, '');
const wordsOf = (s) => stripProofs(s).match(/[A-Za-zÀ-ɏ]+(?:['’-][A-Za-z]+)*/g) || [];
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

const vocab = new Map();
for (const f of fs.readdirSync(confDir)) {
  if (f === 'manifest.json' || f === `${slug}.json`) continue;
  const j = JSON.parse(fs.readFileSync(path.join(confDir, f), 'utf8'));
  for (const u of j.units || []) {
    for (const w of wordsOf(`${u.title} ${u.content.join(' ')}`)) bump(vocab, w.toLowerCase());
  }
}
for (const w of fs.readFileSync(path.join(dataDir, 'bsb.json'), 'utf8').match(/[A-Za-z]+/g)) {
  bump(vocab, w.toLowerCase());
}

const doc = JSON.parse(fs.readFileSync(path.join(confDir, `${slug}.json`), 'utf8'));
const small = 'Of|The|And|In|To|For|By|With|From|That|Which|But|Or|As|On|At';
const patterns = [
  ['midcap', new RegExp(`[a-z,;]\\s+(?:${small})\\b`, 'g')],
  ['spacing/punct', /\s{2,}|[a-z][,;:][A-Za-z]|[a-z]\.[A-Z][a-z]|\b[a-z]+\d+[a-z]*\b|\(\s|\s\)/g],
  ['doubled word', /\b([A-Za-z]+) \1\b/gi],
  [
    'swap',
    /\b(?:tbe|tlie|wlien|wliich|arid|hte|adn|teh|taht|wich|thier|form (?:immorality|sin|evil)|their (?:is|are|was)|once day|(?:in|so) may [a-z]+s|out (?:salvation|own|life))\b/gi,
  ],
  ['glued', /\b(?:to|of|in|for|by)(?:the|them|him|her|us|you)\b/g],
];

const hits = [];
const ownWords = new Map();
doc.units.forEach((u) => {
  u.content.forEach((p, i) => {
    const loc = `${u.number}.${i + 1}`;
    const t = stripProofs(p);
    const ctx = (m) => t.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ');
    for (const [kind, re] of patterns) for (const m of t.matchAll(re)) hits.push([loc, kind, ctx(m)]);
    for (const w of wordsOf(`${t} ${u.title}`)) bump(ownWords, w.toLowerCase());
  });
});

for (const h of hits) console.log(h.join(' | '));
const unknown = [...ownWords]
  .filter(([w]) => !vocab.has(w))
  .map(([w, n]) => (n > 1 ? `${w}*${n}` : w))
  .sort();
console.log(`\n${hits.length} pattern hits; ${unknown.length} unknown words:`);
console.log(unknown.join(' '));
