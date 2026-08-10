/**
 * Shared query parsing for the site's search boxes (Bible reader, confession
 * listing, per-confession filter) so they behave identically.
 *
 * Quoted text is one exact phrase; everything else is a separate term and all
 * terms must match.
 */

export type SearchTerm = {
  value: string;
  /** Came from "quotes": matched literally, never filtered as trivial. */
  phrase: boolean;
};

/**
 * Structural words dropped from unquoted queries.
 *
 * These narrow nothing on their own — "the" alone appears in 924 of the 936
 * confession paragraphs — and because matching is by substring they also
 * highlight the middle of real words (the "the" inside Matthew, whether, they).
 *
 * This is a hand-curated list, deliberately shorter than the general English
 * stop-word lists shipped by Lucene, NLTK or scikit-learn. Those discard words
 * this corpus turns on, so the following are kept searchable on purpose:
 *
 *   - negations — not, no, nor, never ("justified not by works")
 *   - one, two, three — "one substance", "three persons"
 *   - i, am — "I AM WHO I AM"
 *   - who, whom, which — the relative clauses of creedal formulas
 *   - in, into, on, upon, through, unto — sacramental language rests on them
 *     ("baptized into Christ", "through faith")
 *
 * Lucene's default English set contains not, no, in, into and on, which is why
 * it is not used directly here.
 */
export const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for",
  "from", "had", "has", "have", "he", "her", "him", "his", "is", "it", "its",
  "of", "or", "our", "she", "so", "such", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "those", "to", "was",
  "we", "were", "will", "with", "you", "your",
]);

const defaultNormalize = (value: string): string => String(value ?? "").toLowerCase().trim();

/**
 * Splits a raw query into terms.
 *
 * `normalize` lets a caller fold curly quotes, dashes and runs of whitespace
 * the same way it folds the text being searched.
 *
 * Returns the trivial words that were dropped as well, so the UI can say what
 * it did rather than silently changing the query.
 */
export function parseSearchTerms(
  rawQuery: string,
  normalize: (value: string) => string = defaultNormalize
): { terms: SearchTerm[]; ignored: string[] } {
  const query = String(rawQuery ?? "");
  const quoted: string[] = [];
  const bare: string[] = [];
  let remaining = query;

  for (const match of query.matchAll(/"([^"]+)"/g)) {
    const phrase = normalize(String(match[1] ?? ""));
    if (phrase) {
      quoted.push(phrase);
    }
    remaining = remaining.replace(String(match[0] ?? ""), " ");
  }

  remaining
    .trim()
    .split(/\s+/)
    .map((token) => normalize(token))
    .filter(Boolean)
    .forEach((token) => bare.push(token));

  const kept = bare.filter((token) => !STOP_WORDS.has(token));
  const ignored = bare.filter((token) => STOP_WORDS.has(token));

  // A query that is nothing but trivial words ("of the") is taken at face value
  // rather than searched as an empty query.
  const droppedEverything = kept.length === 0 && quoted.length === 0;
  const words = droppedEverything ? bare : kept;

  const terms: SearchTerm[] = [];
  const seen = new Set<string>();
  for (const value of quoted) {
    const key = `phrase:${value}`;
    if (!seen.has(key)) {
      seen.add(key);
      terms.push({ value, phrase: true });
    }
  }
  for (const value of words) {
    const key = `word:${value}`;
    if (!seen.has(key)) {
      seen.add(key);
      terms.push({ value, phrase: false });
    }
  }

  return { terms, ignored: droppedEverything ? [] : [...new Set(ignored)] };
}
