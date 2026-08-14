// Normalization and tokenization for confession-to-confession comparison.
//
// Two ideas drive this file:
//
//   1. What we *compare* is not what we *display*. Comparison runs on a folded
//      key (lowercased, archaic verb endings normalized); the original text is
//      kept for rendering. Without folding, the 1689's wholesale modernization
//      of "calleth" to "calls" lights up every third word and buries the
//      handful of places where the doctrine actually changed.
//
//   2. Paragraph text in this corpus carries two kinds of noise that must come
//      off before diffing: the embedded "11.1 " label, and the inline
//      {{proofs: ...}} tags. The chapter numbers diverge between documents
//      (WCF 20.1 is Savoy 21.1), so leaving the label in guarantees a spurious
//      difference at the head of most paragraphs.

const PROOF_TAG = /\{\{proofs:\s*([^}]+?)\s*\}\}/gi;
const LEADING_LABEL = /^\d+\.\d+\s+/;

export type ParagraphRef = {
  /** Confession slug key used across the comparison layer: "wcf" | "savoy" | "lbcf". */
  doc: DocId;
  /** Chapter number as printed in that confession. */
  chapter: number;
  /** 1-based paragraph number within the chapter. */
  paragraph: number;
};

export type DocId = "wcf" | "savoy" | "lbcf";

export const DOC_IDS: DocId[] = ["wcf", "savoy", "lbcf"];

export const DOC_SLUGS: Record<DocId, string> = {
  wcf: "westminster-confession",
  savoy: "savoy-declaration",
  lbcf: "lbcf-1689",
};

/**
 * Naming for the three comparable confessions. Kept here rather than in
 * compare.ts so pages that only need to link to the comparison — the home page,
 * the confession pages — do not pull in the alignment spine to do it.
 */
export const DOC_LABELS: Record<DocId, { short: string; full: string; slug: string }> = {
  wcf: { short: "WCF", full: "Westminster Confession (1646)", slug: DOC_SLUGS.wcf },
  savoy: { short: "Savoy", full: "Savoy Declaration (1658)", slug: DOC_SLUGS.savoy },
  lbcf: { short: "2LBCF", full: "Second London Baptist Confession (1689)", slug: DOC_SLUGS.lbcf },
};

/** The comparison view's canonical URL — all three side by side. */
export const COMPARE_URL = "/compare/wcf-savoy-lbcf/";

/** Which DocId a confession slug corresponds to, or null if it is not compared. */
export function docIdForSlug(slug: string): DocId | null {
  return DOC_IDS.find((doc) => DOC_SLUGS[doc] === slug) ?? null;
}

export type StrippedParagraph = {
  /** Display text: label and proof tags removed, whitespace collapsed. */
  text: string;
  /** Proof references pulled out of the paragraph, in document order. */
  proofs: string[];
};

/**
 * Remove the "N.M " label and the inline proof tags, then tidy the whitespace
 * the tags leave behind. Mirrors the reader-mode behaviour in
 * pages/confessions/[slug].astro: a tag sitting before punctuation must not
 * leave a space stranded in front of it.
 */
export function stripParagraph(raw: string): StrippedParagraph {
  const proofs: string[] = [];
  const withoutProofs = raw.replace(PROOF_TAG, (_match, refs: string) => {
    proofs.push(refs.trim());
    return "";
  });

  const text = withoutProofs
    .replace(LEADING_LABEL, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,;:.!?])/g, "$1")
    .trim();

  return { text, proofs };
}

export type TokenKind = "word" | "punct" | "space";

export type Token = {
  /** Original text, rendered verbatim. */
  text: string;
  kind: TokenKind;
  /** Comparison key; empty string for whitespace, which never anchors a match. */
  key: string;
};

const WORD_CHARS = /[\p{L}\p{N}]/u;

/**
 * Split into words, punctuation and whitespace, keeping every character so the
 * token stream can be re-joined into the original string. Apostrophes and
 * hyphens stay inside words ("Christ's", "self-same").
 */
export function tokenize(text: string, options: FoldOptions = {}): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (/\s/.test(char)) {
      let end = index;
      while (end < text.length && /\s/.test(text[end])) end += 1;
      tokens.push({ text: text.slice(index, end), kind: "space", key: "" });
      index = end;
      continue;
    }

    if (WORD_CHARS.test(char)) {
      let end = index;
      while (end < text.length) {
        const next = text[end];
        const isInnerPunct =
          (next === "'" || next === "’" || next === "-") &&
          end + 1 < text.length &&
          WORD_CHARS.test(text[end + 1]);
        if (!WORD_CHARS.test(next) && !isInnerPunct) break;
        end += 1;
      }
      const word = text.slice(index, end);
      tokens.push({ text: word, kind: "word", key: foldWord(word, options) });
      index = end;
      continue;
    }

    tokens.push({ text: char, kind: "punct", key: normalizePunct(char) });
    index += 1;
  }

  return tokens;
}

export type FoldOptions = {
  /**
   * Treat archaic and modern forms of the same word as equal
   * (calleth/calls, hath/has, doth/does, shew/show). Default true — the 1689's
   * modernization is a copy-editing decision, not a doctrinal one, and folding
   * it away is what makes the real changes visible. Expose it as a UI toggle:
   * a reader studying the 1689's editorial hand wants it off.
   */
  foldArchaic?: boolean;
};

const ARCHAIC_EXACT = new Map<string, string>([
  ["hath", "has"],
  ["doth", "does"],
  ["saith", "says"],
  ["shew", "show"],
  ["shewed", "showed"],
  ["shewing", "showing"],
  ["shewn", "shown"],
  ["sheweth", "shows"],
  ["unto", "to"],
  ["upon", "on"],
  ["whilst", "while"],
  ["amongst", "among"],
  ["betwixt", "between"],
  ["hereunto", "hereto"],
  ["thereunto", "thereto"],
  ["whereunto", "whereto"],
]);

/**
 * Fold a word to its comparison key. The -eth/-th verb endings are the bulk of
 * the difference between Westminster's text and the 1689's, so they are handled
 * by rule rather than by table.
 */
export function foldWord(word: string, { foldArchaic = true }: FoldOptions = {}): string {
  let key = word
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');

  if (!foldArchaic) return key;

  const exact = ARCHAIC_EXACT.get(key);
  if (exact) return exact;

  // calleth -> calls, worketh -> works, but leave "beneath", "death", "faith".
  if (/[a-z]{3,}eth$/.test(key) && !/(^|[^a-z])(be|de|te|w)eath$/.test(key)) {
    key = `${key.slice(0, -3)}s`;
  }

  // -ise/-ize and -our/-or spellings.
  key = key.replace(/ise(s|d|th)?$/, "ize$1").replace(/our$/, "or");

  return key;
}

function normalizePunct(char: string): string {
  if (char === "‘" || char === "’") return "'";
  if (char === "“" || char === "”") return '"';
  if (char === "–" || char === "—") return "-";
  return char;
}

/** Words only, folded — the unit of similarity scoring during alignment. */
export function wordKeys(text: string, options: FoldOptions = {}): string[] {
  return tokenize(text, options)
    .filter((token) => token.kind === "word")
    .map((token) => token.key);
}
