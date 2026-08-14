// Word-level n-way alignment for the confession comparison view.
//
// The output model is deliberately column-shaped: a list of segments, each of
// which knows what every document reads at that point in the text. Rendering
// three columns is then a matter of walking the segments once per column, and
// the columns stay row-aligned for free because they share the segment list.
//
// Strategy: pick a base document, diff it against each of the others with an
// LCS, and cut a new segment wherever the set of documents agreeing with the
// base changes. Runs where *every* document matches become "common" segments;
// everything between them is a "variant" segment carrying each document's own
// wording (or nothing, where a document omits the clause).
//
// Why a single n-way pass instead of three pairwise diffs: with pairwise diffs
// the three columns cannot be laid out on shared rows, and toggling a column
// off would reshuffle the highlighting of the two that remain. One alignment,
// projected onto whichever subset the reader selected, keeps the text stable as
// columns come and go — see projectSegments.

import { DOC_IDS, foldWord, tokenize, type DocId, type FoldOptions } from "./text";

/** A content token plus the whitespace that preceded it, so text round-trips. */
type Word = {
  text: string;
  key: string;
  lead: string;
};

export type Segment = {
  kind: "common" | "variant";
  /** Rendered text per document. A missing entry means "this document has nothing here". */
  text: Partial<Record<DocId, string>>;
  /** Folded comparison text per document; used when projecting onto a subset. */
  key: Partial<Record<DocId, string>>;
  /**
   * For variant segments: documents grouped by identical reading. A group of
   * two in a three-way comparison is the interesting case — "Westminster and
   * Savoy read alike here, the 1689 does not."
   */
  agree?: DocId[][];
};

function toWords(text: string, options: FoldOptions): Word[] {
  const tokens = tokenize(text, options);
  const words: Word[] = [];
  let lead = "";

  for (const token of tokens) {
    if (token.kind === "space") {
      lead += token.text;
      continue;
    }
    words.push({ text: token.text, key: token.key, lead });
    lead = "";
  }

  return words;
}

/**
 * Render a word range, keeping the whitespace that preceded each word so
 * segments concatenate back into the original string. The lead is dropped only
 * at the very start of a document, where there is nothing to separate from.
 */
function render(words: Word[], from: number, to: number): string {
  let out = "";
  for (let i = from; i < to; i += 1) {
    out += (i === 0 ? "" : words[i].lead) + words[i].text;
  }
  return out;
}

/**
 * Longest common subsequence over folded keys. Returns, for each index in `a`,
 * the matching index in `b`, or -1.
 *
 * O(n*m) time and memory. Paragraphs here top out in the low hundreds of words,
 * so this runs at build time in milliseconds; if a row ever grew large enough to
 * matter, the fix is to anchor on unique words first (patience diff) rather than
 * to reach for a dependency.
 */
export function lcsMatch(a: Word[], b: Word[]): Int32Array {
  const n = a.length;
  const m = b.length;
  const table = new Int32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[at(i, j)] =
        a[i].key === b[j].key
          ? table[at(i + 1, j + 1)] + 1
          : Math.max(table[at(i + 1, j)], table[at(i, j + 1)]);
    }
  }

  const match = new Int32Array(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].key === b[j].key) {
      match[i] = j;
      i += 1;
      j += 1;
    } else if (table[at(i + 1, j)] >= table[at(i, j + 1)]) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return match;
}

/**
 * Align the given documents' text into a single segment list.
 *
 * `base` should be the document most likely to sit textually between the
 * others. For this corpus that is Savoy: it is a revision of Westminster and
 * the source the 1689 worked from, so anchoring on it keeps both diffs short.
 * Where the row has no Savoy text, fall back to Westminster.
 */
export function alignTexts(
  texts: Partial<Record<DocId, string>>,
  options: FoldOptions = {}
): Segment[] {
  const present = DOC_IDS.filter((doc) => typeof texts[doc] === "string");
  if (present.length === 0) return [];

  const words = new Map<DocId, Word[]>();
  for (const doc of present) words.set(doc, toWords(texts[doc] as string, options));

  if (present.length === 1) {
    const only = present[0];
    return [
      {
        kind: "variant",
        text: { [only]: texts[only] as string },
        key: { [only]: keyText(words.get(only) as Word[]) },
        agree: [[only]],
      },
    ];
  }

  const baseId = pickBase(present);
  const base = words.get(baseId) as Word[];
  const others = present.filter((doc) => doc !== baseId);

  const matches = new Map<DocId, Int32Array>();
  for (const doc of others) matches.set(doc, lcsMatch(base, words.get(doc) as Word[]));

  const segments: Segment[] = [];

  /** Next unconsumed word in each non-base document. */
  const cursor = new Map<DocId, number>(others.map((doc) => [doc, 0]));
  /** Where the current run of divergent base text began. */
  let variantStart = 0;

  /** Partner indices when every document matches base word `i`, else null. */
  const matchAll = (i: number): Map<DocId, number> | null => {
    const partner = new Map<DocId, number>();
    for (const doc of others) {
      const j = (matches.get(doc) as Int32Array)[i];
      if (j < 0) return null;
      partner.set(doc, j);
    }
    return partner;
  };

  const emitVariant = (baseFrom: number, baseTo: number, docTo: Map<DocId, number>) => {
    const segment: Segment = { kind: "variant", text: {}, key: {} };
    let any = false;

    if (baseTo > baseFrom) {
      segment.text[baseId] = render(base, baseFrom, baseTo);
      segment.key[baseId] = keyText(base.slice(baseFrom, baseTo));
      any = true;
    }
    for (const doc of others) {
      const from = cursor.get(doc) as number;
      const to = docTo.get(doc) as number;
      if (to <= from) continue;
      const docWords = words.get(doc) as Word[];
      segment.text[doc] = render(docWords, from, to);
      segment.key[doc] = keyText(docWords.slice(from, to));
      any = true;
    }
    if (!any) return;

    segment.agree = groupByReading(segment.key, present);
    segments.push(segment);
  };

  const emitCommon = (from: number, to: number) => {
    const text = render(base, from, to);
    const folded = keyText(base.slice(from, to));
    const segment: Segment = { kind: "common", text: {}, key: {} };
    for (const doc of present) {
      segment.text[doc] = text;
      segment.key[doc] = folded;
    }
    segments.push(segment);
  };

  let i = 0;
  while (i < base.length) {
    const partner = matchAll(i);
    if (!partner) {
      i += 1;
      continue;
    }

    // Everything the documents skipped in order to reach this shared word is
    // divergent, and closes off the pending variant segment.
    emitVariant(variantStart, i, partner);
    for (const doc of others) cursor.set(doc, partner.get(doc) as number);

    // Extend the run for as long as every document keeps matching contiguously.
    const runStart = i;
    do {
      for (const doc of others) cursor.set(doc, (cursor.get(doc) as number) + 1);
      i += 1;
      if (i >= base.length) break;
      const next = matchAll(i);
      if (!next) break;
      if (others.some((doc) => next.get(doc) !== cursor.get(doc))) break;
    } while (true);

    emitCommon(runStart, i);
    variantStart = i;
  }

  const tail = new Map<DocId, number>(
    others.map((doc) => [doc, (words.get(doc) as Word[]).length])
  );
  emitVariant(variantStart, base.length, tail);

  return mergeAdjacent(segments);
}

function keyText(words: Word[]): string {
  return words.map((word) => word.key).join(" ");
}

function pickBase(present: DocId[]): DocId {
  for (const candidate of ["savoy", "wcf", "lbcf"] as DocId[]) {
    if (present.includes(candidate)) return candidate;
  }
  return present[0];
}

function groupByReading(key: Partial<Record<DocId, string>>, present: DocId[]): DocId[][] {
  const groups = new Map<string, DocId[]>();
  for (const doc of present) {
    const reading = key[doc] ?? " omitted";
    const bucket = groups.get(reading);
    if (bucket) bucket.push(doc);
    else groups.set(reading, [doc]);
  }
  return [...groups.values()];
}

function mergeAdjacent(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    const previous = out[out.length - 1];
    if (previous && previous.kind === "common" && segment.kind === "common") {
      // Leading whitespace travels with each segment, so this is a plain join.
      for (const doc of Object.keys(segment.text) as DocId[]) {
        previous.text[doc] = (previous.text[doc] ?? "") + segment.text[doc];
        previous.key[doc] = (previous.key[doc] ?? "") + " " + segment.key[doc];
      }
      continue;
    }
    out.push(segment);
  }
  return out;
}

/**
 * Restrict an alignment to a subset of documents. A variant segment whose
 * remaining documents happen to read alike collapses to common, and adjacent
 * common segments merge — so a two-column view of a three-way alignment reads
 * as a clean pairwise diff without recomputing anything.
 */
export function projectSegments(segments: Segment[], docs: DocId[]): Segment[] {
  const kept: Segment[] = [];

  for (const segment of segments) {
    const text: Partial<Record<DocId, string>> = {};
    const key: Partial<Record<DocId, string>> = {};
    let any = false;

    for (const doc of docs) {
      if (segment.text[doc] === undefined) continue;
      text[doc] = segment.text[doc];
      key[doc] = segment.key[doc];
      any = true;
    }
    if (!any) continue;

    const readings = new Set(docs.map((doc) => key[doc] ?? " omitted"));
    const kind: Segment["kind"] = readings.size === 1 ? "common" : "variant";
    kept.push(
      kind === "common"
        ? { kind, text, key }
        : { kind, text, key, agree: groupByReading(key, docs) }
    );
  }

  return mergeAdjacent(kept);
}

/**
 * True when a segment's only content is punctuation — a comma in one document
 * against a semicolon in another, with no word in dispute.
 *
 * These are a third of all the marks on a three-way page and nearly half on
 * Savoy-vs-1689, so they are tagged rather than merged away: the reader can turn
 * them on, but by default they are shown unhighlighted and excluded from the
 * agreement figure, so two paragraphs differing only in pointing read as 100%.
 */
export function isPunctuationOnly(segment: Segment): boolean {
  if (segment.kind === "common") return false;
  const text = Object.values(segment.text).join("");
  return text.length > 0 && !/[\p{L}\p{N}]/u.test(text);
}

/** Word tokens in a string, ignoring punctuation. */
export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/** Word tokens plus punctuation marks. */
export function countTokens(text: string): number {
  return countWords(text) + (text.match(/[^\s\p{L}\p{N}]/gu) ?? []).length;
}

/** Fraction of folded words the documents hold in common — drives "N% identical". */
export function similarity(a: string, b: string, options: FoldOptions = {}): number {
  const left = a.split(/\s+/).filter(Boolean).map((word) => foldWord(word, options));
  const right = b.split(/\s+/).filter(Boolean).map((word) => foldWord(word, options));
  if (left.length === 0 && right.length === 0) return 1;
  if (left.length === 0 || right.length === 0) return 0;

  const pool = new Map<string, number>();
  for (const word of right) pool.set(word, (pool.get(word) ?? 0) + 1);

  let shared = 0;
  for (const word of left) {
    const count = pool.get(word) ?? 0;
    if (count > 0) {
      shared += 1;
      pool.set(word, count - 1);
    }
  }

  return (2 * shared) / (left.length + right.length);
}
