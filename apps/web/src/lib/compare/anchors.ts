// Paragraph -> comparison-row lookup.
//
// Reading 1689 16.4 and wondering what Westminster says at the same point is the
// commonest reason to reach for the comparison, so every paragraph on a
// confession page links straight to its own row rather than to the top of the
// comparison.
//
// This module deliberately imports nothing but the spine and the doc naming, so
// a page can resolve an anchor without pulling in the corpus or the diff engine.

import { DOC_SLUGS, type DocId } from "./text";
import spineJson from "../../data/comparison/alignment.json";

type SpineRow = {
  id: string;
  wcf: string[];
  savoy: string[];
  lbcf: string[];
};

const spine = spineJson as unknown as { rows: SpineRow[] };

/**
 * `${doc}:${chapter}.${paragraph}` -> row id. A paragraph appears in exactly one
 * row, but a row may hold several paragraphs of the same document, so every
 * reference in the row maps back to it.
 */
const rowByRef = new Map<string, string>();
for (const row of spine.rows) {
  for (const doc of ["wcf", "savoy", "lbcf"] as DocId[]) {
    for (const ref of row[doc] ?? []) rowByRef.set(`${doc}:${ref}`, row.id);
  }
}

const docBySlug = new Map<string, DocId>(
  (Object.entries(DOC_SLUGS) as [DocId, string][]).map(([doc, slug]) => [slug, doc])
);

/**
 * Link from a confession paragraph to the row comparing it with the other two.
 * Null when the confession is not part of the comparison, or when the paragraph
 * has no row — which should not happen, but a missing link beats a broken one.
 */
export function compareHrefFor(
  confessionSlug: string,
  chapter: number,
  paragraph: number
): string | null {
  const doc = docBySlug.get(confessionSlug);
  if (!doc) return null;

  const rowId = rowByRef.get(`${doc}:${chapter}.${paragraph}`);
  if (!rowId) return null;

  return `/compare/wcf-savoy-lbcf/#${rowId}`;
}
