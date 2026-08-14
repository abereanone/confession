// Public API for the comparison view: turns the curated alignment spine plus
// the confession corpus into rows a template can render straight into columns.

import { findConfession } from "../confessions";
import {
  alignTexts,
  isPunctuationOnly,
  countTokens,
  countWords,
  projectSegments,
  type Segment,
} from "./align";
import { DOC_IDS, DOC_SLUGS, stripParagraph, type DocId, type FoldOptions } from "./text";
import spineJson from "../../data/comparison/alignment.json";

export type RowKind = "parallel" | "insertion" | "omission" | "recast";

/**
 * How sure the pairing is. "high" needs no further attention; "medium" and
 * "low" are the rows a reviewer should spend their time on, and are what
 * /compare/review lists.
 */
export type Confidence = "high" | "medium" | "low";

type SpineRow = {
  id: string;
  group: string;
  kind: RowKind;
  wcf: string[];
  savoy: string[];
  lbcf: string[];
  sim?: Record<string, number>;
  confidence?: Confidence;
  /** Why this pairing is what it is. Recorded when the row was decided. */
  decision?: string;
  /** Context the reader needs to read the row honestly. */
  note?: string;
};

type Spine = {
  docs: Record<DocId, string>;
  groups: { id: string; label: string; note?: string }[];
  rows: SpineRow[];
};

const spine = spineJson as unknown as Spine;

export type CompareCell = {
  doc: DocId;
  /** "11.3" style references this cell covers, in document order. */
  refs: string[];
  /** Empty when the document has no counterpart here. */
  text: string;
  proofs: string[];
};

export type CompareRow = {
  id: string;
  kind: RowKind;
  confidence: Confidence;
  /** Why this pairing is what it is. */
  decision?: string;
  /** Context the reader needs to read the row honestly. */
  note?: string;
  cells: Partial<Record<DocId, CompareCell>>;
  /** Word-level alignment, already projected onto the selected documents. */
  segments: Segment[];
  /**
   * 0-1, how much of the row the selected documents share. `words` ignores
   * punctuation, `all` counts it — the reader's punctuation toggle picks which
   * one is displayed.
   */
  agreement: { words: number; all: number };
};

export type CompareGroup = {
  id: string;
  label: string;
  note?: string;
  /** Chapter numbers this group covers, per selected document. */
  chapters: Partial<Record<DocId, number[]>>;
  rows: CompareRow[];
};

export type CompareOptions = FoldOptions & {
  /** Drop rows where every selected document reads identically. */
  differencesOnly?: boolean;
  /**
   * Count punctuation-only differences as differences. Default false: a comma
   * against a semicolon is not something most readers came here to see, and
   * these account for a third of all marks on the page.
   */
  showPunctuation?: boolean;
};

const paragraphCache = new Map<string, { text: string; proofs: string[] }>();

function paragraph(doc: DocId, ref: string) {
  const cacheKey = `${doc}:${ref}`;
  const cached = paragraphCache.get(cacheKey);
  if (cached) return cached;

  const confession = findConfession(DOC_SLUGS[doc]);
  if (!confession) throw new Error(`missing confession for ${doc} (${DOC_SLUGS[doc]})`);

  const [chapter, index] = ref.split(".").map(Number);
  const unit = confession.units.find((candidate) => candidate.number === chapter);
  const raw = unit?.content[index - 1];
  if (raw === undefined) throw new Error(`${doc} has no paragraph ${ref}`);

  const stripped = stripParagraph(raw);
  paragraphCache.set(cacheKey, stripped);
  return stripped;
}

/**
 * A row's text for one document. Multiple refs are joined into one block: the
 * spine pairs n paragraphs against m, and the word diff does not care where the
 * paragraph boundaries fell.
 */
function cellFor(doc: DocId, refs: string[]): CompareCell | null {
  if (refs.length === 0) return null;
  const parts = refs.map((ref) => paragraph(doc, ref));
  return {
    doc,
    refs,
    text: parts.map((part) => part.text).join(" "),
    proofs: parts.flatMap((part) => part.proofs),
  };
}

/**
 * How much of the row the documents hold in common, 0-1, computed from the
 * segments themselves rather than from a separate similarity pass. That
 * guarantees the percentage can never disagree with the highlighting on screen.
 *
 * Two figures, because the reader can toggle punctuation:
 *   words  — punctuation ignored entirely, so a row differing only in pointing
 *            reads 100%
 *   all    — punctuation counted, so the same row reads 93% or so
 */
function agreementOf(
  segments: Segment[],
  docs: DocId[]
): { words: number; all: number } {
  let wordsCommon = 0;
  let wordsVariant = 0;
  let allCommon = 0;
  let allVariant = 0;

  for (const segment of segments) {
    const texts = docs.map((doc) => segment.text[doc] ?? "");
    const words = Math.max(...texts.map(countWords));
    const tokens = Math.max(...texts.map(countTokens));
    if (segment.kind === "common") {
      wordsCommon += words;
      allCommon += tokens;
    } else {
      wordsVariant += words;
      allVariant += tokens;
    }
  }

  const wordTotal = wordsCommon + wordsVariant;
  const allTotal = allCommon + allVariant;
  return {
    words: wordTotal ? wordsCommon / wordTotal : 0,
    all: allTotal ? allCommon / allTotal : 0,
  };
}

export function buildComparison(docs: DocId[], options: CompareOptions = {}): CompareGroup[] {
  const selected = DOC_IDS.filter((doc) => docs.includes(doc));
  const groups = new Map<string, CompareGroup>();

  for (const meta of spine.groups) {
    groups.set(meta.id, {
      id: meta.id,
      label: meta.label,
      note: meta.note,
      chapters: {},
      rows: [],
    });
  }

  for (const row of spine.rows) {
    const group = groups.get(row.group);
    if (!group) continue;

    const cells: Partial<Record<DocId, CompareCell>> = {};
    for (const doc of selected) {
      const cell = cellFor(doc, row[doc] ?? []);
      if (!cell) continue;
      cells[doc] = cell;

      const chapters = group.chapters[doc] ?? [];
      for (const ref of cell.refs) {
        const chapter = Number(ref.split(".")[0]);
        if (!chapters.includes(chapter)) chapters.push(chapter);
      }
      group.chapters[doc] = chapters.sort((a, b) => a - b);
    }

    // A row that only exists in documents the reader deselected is not a gap,
    // it is simply out of scope — drop it rather than render an empty band.
    if (Object.keys(cells).length === 0) continue;

    const texts: Partial<Record<DocId, string>> = {};
    for (const doc of selected) if (cells[doc]) texts[doc] = cells[doc]!.text;

    const segments = projectSegments(alignTexts(texts, options), selected);
    const identical = segments.every(
      (segment) =>
        segment.kind === "common" ||
        (options.showPunctuation !== true && isPunctuationOnly(segment))
    );
    if (options.differencesOnly && identical && Object.keys(cells).length === selected.length) {
      continue;
    }

    group.rows.push({
      id: row.id,
      kind: rowKindFor(row, cells, selected),
      confidence: row.confidence ?? "high",
      decision: row.decision,
      note: row.note,
      cells,
      segments,
      agreement: agreementOf(segments, selected),
    });
  }

  return [...groups.values()].filter((group) => group.rows.length > 0);
}

/**
 * The spine's `kind` describes the three-way picture. Narrowing to two
 * documents can turn an omission into a plain parallel row, so recompute it.
 */
function rowKindFor(
  row: SpineRow,
  cells: Partial<Record<DocId, CompareCell>>,
  selected: DocId[]
): RowKind {
  const present = selected.filter((doc) => cells[doc]);
  if (present.length === selected.length) {
    return row.kind === "recast" ? "recast" : "parallel";
  }
  return present.includes("wcf") ? "omission" : "insertion";
}

/** URL slug <-> document set, e.g. "wcf-savoy-lbcf" or "wcf-lbcf". */
export function parseCombo(combo: string): DocId[] | null {
  const parts = combo.split("-").filter(Boolean) as DocId[];
  const valid = parts.every((part) => DOC_IDS.includes(part));
  const unique = new Set(parts).size === parts.length;
  if (!valid || !unique || parts.length < 2) return null;
  return DOC_IDS.filter((doc) => parts.includes(doc));
}

/** Every comparison the site publishes: the three pairs and the full three-way. */
export function allCombos(): DocId[][] {
  return [
    ["wcf", "savoy"],
    ["wcf", "lbcf"],
    ["savoy", "lbcf"],
    ["wcf", "savoy", "lbcf"],
  ];
}

export function comboSlug(docs: DocId[]): string {
  return DOC_IDS.filter((doc) => docs.includes(doc)).join("-");
}

export const DOC_LABELS: Record<DocId, { short: string; full: string; slug: string }> = {
  wcf: { short: "WCF", full: "Westminster Confession (1646)", slug: DOC_SLUGS.wcf },
  savoy: { short: "Savoy", full: "Savoy Declaration (1658)", slug: DOC_SLUGS.savoy },
  lbcf: { short: "2LBCF", full: "Second London Baptist Confession (1689)", slug: DOC_SLUGS.lbcf },
};
