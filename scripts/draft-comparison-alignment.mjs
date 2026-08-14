// Drafts the paragraph-level alignment spine for the WCF / Savoy / 1689
// comparison view.
//
//   node ./scripts/draft-comparison-alignment.mjs           # write the draft
//   node ./scripts/draft-comparison-alignment.mjs --report   # print it, write nothing
//
// Output: shared/data/comparison/alignment.draft.json
//
// The draft is NOT the source of truth. Review it, fix the rows it flags, and
// save the result as alignment.json — that curated file is what the site reads.
// Re-running this script after a corpus edit and diffing the draft against the
// curated spine is how you find alignment that has gone stale.
//
// Why a checked-in spine rather than matching at request time: some of these
// correspondences are editorial judgements no similarity metric will reach on
// its own. The 1689 dissolves Westminster's chapters 30 and 31 into the back
// half of its chapter 26, reordering as it goes. A reader who is shown a wrong
// pairing has been told the confessions say something they do not, so the
// machine drafts and a human signs off.
//
// Note: this script carries its own small word-folding routine rather than
// importing apps/web/src/lib/compare/text.ts. Paragraph-level similarity only
// needs to be good enough to pair paragraphs; the exact fold used for the
// word-by-word diff is a separate, stricter concern.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const comparisonDir = path.join(root, "shared", "data", "comparison");

const REPORT_ONLY = process.argv.includes("--report");

// Tuning. A pair scores 2*sim-1, so a match must clear ~0.68 similarity to beat
// two gaps. Loosen GAP to pair more aggressively; tighten it to leave more
// paragraphs unmatched for a human to look at.
const GAP = -0.35;
const REVIEW_BELOW = 0.6;
const RECAST_BELOW = 0.55;
const ORPHAN_PAIR_ABOVE = 0.5;

const map = JSON.parse(await readFile(path.join(comparisonDir, "chapter-map.json"), "utf8"));
const DOCS = Object.keys(map.docs);

const confessions = {};
for (const [docId, slug] of Object.entries(map.docs)) {
  confessions[docId] = JSON.parse(
    await readFile(path.join(root, "shared", "data", "confessions", `${slug}.json`), "utf8")
  );
}

/* ------------------------------------------------------------------ text -- */

const PROOF_TAG = /\{\{proofs:\s*([^}]+?)\s*\}\}/gi;

function plainText(raw) {
  return raw
    .replace(PROOF_TAG, "")
    .replace(/^\d+\.\d+\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fold(word) {
  let key = word.toLowerCase().replace(/[^a-z']/g, "");
  if (!key) return "";
  const exact = { hath: "has", doth: "does", saith: "says", shew: "show", unto: "to", upon: "on" };
  if (exact[key]) return exact[key];
  if (/[a-z]{3,}eth$/.test(key)) key = `${key.slice(0, -3)}s`;
  return key.replace(/ise$/, "ize").replace(/our$/, "or");
}

function bagOfWords(text) {
  const bag = new Map();
  for (const raw of text.split(/\s+/)) {
    const key = fold(raw);
    if (!key) continue;
    bag.set(key, (bag.get(key) ?? 0) + 1);
  }
  return bag;
}

/** Dice coefficient over folded word bags. */
function similarity(a, b) {
  const left = bagOfWords(a);
  const right = bagOfWords(b);
  let leftSize = 0;
  let rightSize = 0;
  let shared = 0;
  for (const count of left.values()) leftSize += count;
  for (const count of right.values()) rightSize += count;
  if (!leftSize || !rightSize) return 0;
  for (const [key, count] of left) shared += Math.min(count, right.get(key) ?? 0);
  return (2 * shared) / (leftSize + rightSize);
}

/* --------------------------------------------------------------- corpus  -- */

function paragraphsFor(docId, chapters) {
  const confession = confessions[docId];
  const out = [];
  for (const chapter of chapters) {
    const unit = confession.units.find((candidate) => candidate.number === chapter);
    if (!unit) throw new Error(`${docId} has no chapter ${chapter} (check chapter-map.json)`);
    unit.content.forEach((raw, index) => {
      out.push({ ref: `${chapter}.${index + 1}`, chapter, text: plainText(raw) });
    });
  }
  return out;
}

/**
 * Groups that share a chapter in any document must be aligned together, or that
 * chapter's paragraphs would be duplicated across groups. This is what makes
 * the church / church-censures / synods trio work: they collapse into one unit
 * spanning WCF 25, 30, 31 against 1689 26.
 */
function buildUnits(groups) {
  const parent = groups.map((_, index) => index);
  const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])));
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  const seen = new Map();
  groups.forEach((group, index) => {
    for (const docId of DOCS) {
      for (const chapter of group[docId] ?? []) {
        const token = `${docId}:${chapter}`;
        if (seen.has(token)) union(seen.get(token), index);
        else seen.set(token, index);
      }
    }
  });

  const units = new Map();
  groups.forEach((group, index) => {
    const key = find(index);
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(group);
  });
  return [...units.values()];
}

/* ------------------------------------------------------------- alignment -- */

/** Needleman-Wunsch global alignment. Returns [anchorIndex|null, otherIndex|null] pairs. */
function align(anchor, other) {
  const n = anchor.length;
  const m = other.length;
  const score = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));

  for (let i = 1; i <= n; i += 1) score[i][0] = score[i - 1][0] + GAP;
  for (let j = 1; j <= m; j += 1) score[0][j] = score[0][j - 1] + GAP;

  const sim = Array.from({ length: n }, (_, i) =>
    Float64Array.from({ length: m }, (_, j) => similarity(anchor[i].text, other[j].text))
  );

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      score[i][j] = Math.max(
        score[i - 1][j - 1] + (2 * sim[i - 1][j - 1] - 1),
        score[i - 1][j] + GAP,
        score[i][j - 1] + GAP
      );
    }
  }

  const pairs = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && score[i][j] === score[i - 1][j - 1] + (2 * sim[i - 1][j - 1] - 1)) {
      pairs.push([i - 1, j - 1, sim[i - 1][j - 1]]);
      i -= 1;
      j -= 1;
    } else if (i > 0 && score[i][j] === score[i - 1][j] + GAP) {
      pairs.push([i - 1, null, 0]);
      i -= 1;
    } else {
      pairs.push([null, j - 1, 0]);
      j -= 1;
    }
  }
  return pairs.reverse();
}

/** Anchor on the document with the most paragraphs; Savoy breaks ties as the textual middle. */
function pickAnchor(paragraphs) {
  const present = DOCS.filter((docId) => paragraphs[docId].length > 0);
  const order = ["savoy", "wcf", "lbcf"].filter((docId) => present.includes(docId));
  let best = order[0];
  for (const docId of order) {
    if (paragraphs[docId].length > paragraphs[best].length) best = docId;
  }
  return best;
}

function groupOf(unit, docId, ref) {
  const chapter = Number(ref.split(".")[0]);
  const match = unit.find((group) => (group[docId] ?? []).includes(chapter));
  return match ? match.id : unit[0].id;
}

function alignUnit(unit) {
  const chapters = {};
  for (const docId of DOCS) {
    chapters[docId] = [...new Set(unit.flatMap((group) => group[docId] ?? []))].sort((a, b) => a - b);
  }

  const paragraphs = {};
  for (const docId of DOCS) paragraphs[docId] = paragraphsFor(docId, chapters[docId]);

  const present = DOCS.filter((docId) => paragraphs[docId].length > 0);
  const anchorId = pickAnchor(paragraphs);
  const others = present.filter((docId) => docId !== anchorId);

  // slots[i] holds what each document contributes opposite anchor paragraph i.
  // orphans[i] holds material a document has *before* anchor paragraph i.
  const slots = paragraphs[anchorId].map(() => ({}));
  const orphans = paragraphs[anchorId].map(() => ({}));
  const trailing = {};

  for (const docId of others) {
    const pairs = align(paragraphs[anchorId], paragraphs[docId]);
    let nextAnchor = 0;
    let pending = [];

    for (const [anchorIndex, otherIndex, sim] of pairs) {
      if (anchorIndex === null) {
        pending.push(paragraphs[docId][otherIndex]);
        continue;
      }
      if (pending.length) {
        orphans[anchorIndex][docId] = pending;
        pending = [];
      }
      if (otherIndex !== null) {
        slots[anchorIndex][docId] = { paragraph: paragraphs[docId][otherIndex], sim };
      }
      nextAnchor = anchorIndex + 1;
    }
    if (pending.length) trailing[docId] = pending;
    void nextAnchor;
  }

  /* Emit rows in anchor order, interleaving orphan rows. */
  const rows = [];

  const emitOrphans = (bucket) => {
    const docsWithOrphans = Object.keys(bucket);
    if (docsWithOrphans.length === 0) return;

    // Two documents dropping the same material at the same point is one row,
    // not two — that is the shape of a clause the 1689 kept from Savoy but
    // Westminster never had.
    const queues = Object.fromEntries(docsWithOrphans.map((docId) => [docId, [...bucket[docId]]]));
    while (Object.values(queues).some((queue) => queue.length)) {
      const row = { refs: {}, sims: {} };
      const heads = docsWithOrphans.filter((docId) => queues[docId].length);
      const [first, ...rest] = heads;
      row.refs[first] = [queues[first].shift().ref];
      for (const docId of rest) {
        const sim = similarity(
          paragraphs[first].find((p) => p.ref === row.refs[first][0])?.text ??
            bucket[first][0].text,
          queues[docId][0].text
        );
        if (sim >= ORPHAN_PAIR_ABOVE) {
          row.refs[docId] = [queues[docId].shift().ref];
          row.sims[`${first}-${docId}`] = round(sim);
        }
      }
      rows.push(finishRow(unit, row, present));
    }
  };

  paragraphs[anchorId].forEach((anchorParagraph, index) => {
    emitOrphans(orphans[index]);

    const row = { refs: { [anchorId]: [anchorParagraph.ref] }, sims: {} };
    for (const docId of others) {
      const slot = slots[index][docId];
      if (!slot) continue;
      row.refs[docId] = [slot.paragraph.ref];
      row.sims[pairKey(anchorId, docId)] = round(slot.sim);
    }
    rows.push(finishRow(unit, row, present));
  });

  emitOrphans(trailing);

  return rows;
}

function pairKey(a, b) {
  return [a, b].sort().join("-");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function finishRow(unit, row, present) {
  const docsInRow = DOCS.filter((docId) => row.refs[docId]?.length);
  const missing = present.filter((docId) => !docsInRow.includes(docId));
  const sims = Object.values(row.sims);
  const worst = sims.length ? Math.min(...sims) : null;

  let kind = "parallel";
  if (missing.length) kind = docsInRow.includes("wcf") ? "omission" : "insertion";
  else if (worst !== null && worst < RECAST_BELOW) kind = "recast";

  const anchorDoc = docsInRow[0];
  const group = groupOf(unit, anchorDoc, row.refs[anchorDoc][0]);

  const out = { id: "", group, kind };
  for (const docId of DOCS) out[docId] = row.refs[docId] ?? [];
  if (sims.length) out.sim = row.sims;
  if (worst !== null && worst < REVIEW_BELOW) out.review = "low similarity — confirm this pairing";
  else if (kind !== "parallel" && present.length === DOCS.length && missing.length) {
    out.review = `no counterpart in ${missing.join(", ")} — confirm this is a real gap`;
  }
  return out;
}

/* ----------------------------------------------------------------- main  -- */

const units = buildUnits(map.groups);
const rows = units.flatMap((unit) => alignUnit(unit));

const counter = new Map();
for (const row of rows) {
  const next = (counter.get(row.group) ?? 0) + 1;
  counter.set(row.group, next);
  row.id = `${row.group}-${next}`;
}

const spine = {
  $comment:
    "DRAFT, generated by scripts/draft-comparison-alignment.mjs. Review the rows carrying a `review` note, then save as alignment.json.",
  generatedAt: new Date().toISOString().slice(0, 10),
  docs: map.docs,
  groups: map.groups.map(({ id, label, note }) => (note ? { id, label, note } : { id, label })),
  rows,
};

const flagged = rows.filter((row) => row.review);
const byKind = rows.reduce((acc, row) => ({ ...acc, [row.kind]: (acc[row.kind] ?? 0) + 1 }), {});

console.log(`rows: ${rows.length}`, byKind);
console.log(`needing review: ${flagged.length}`);
for (const row of flagged) {
  const refs = DOCS.map((docId) => `${docId} ${row[docId].join(",") || "—"}`).join("  |  ");
  console.log(`  ${row.id.padEnd(24)} ${refs.padEnd(46)} ${row.review}`);
}

if (!REPORT_ONLY) {
  await mkdir(comparisonDir, { recursive: true });
  await writeFile(
    path.join(comparisonDir, "alignment.draft.json"),
    `${JSON.stringify(spine, null, 2)}\n`,
    "utf8"
  );
  console.log(`\nwrote ${path.relative(root, path.join(comparisonDir, "alignment.draft.json"))}`);
}
