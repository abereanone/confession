import bookMap from "./bookMap.json";

const singleChapterBooks = new Set([
  "obadiah",
  "oba",
  "philemon",
  "phm",
  "2jn",
  "3jn",
  "jude",
  "jud",
]);

function normalizeBookName(book: string): string | undefined {
  const normalizeOrdinalPrefix = (value: string): string =>
    value
      .replace(/^(?:first|1st|i)\s+/i, "1 ")
      .replace(/^(?:second|2nd|ii)\s+/i, "2 ")
      .replace(/^(?:third|3rd|iii)\s+/i, "3 ");

  const candidates = new Set<string>();
  const addCandidate = (value: string) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return;
    }
    candidates.add(normalized);
    candidates.add(normalized.toLowerCase());
    candidates.add(normalized.charAt(0).toUpperCase() + normalized.slice(1));
    candidates.add(normalized.replace(/^([1-3])\s+(.+)$/, "$1$2"));
  };

  const base = book.replace(/\s+/g, " ").trim();
  const cleaned = base.replace(/\./g, "");

  addCandidate(base);
  addCandidate(cleaned);
  addCandidate(normalizeOrdinalPrefix(base));
  addCandidate(normalizeOrdinalPrefix(cleaned));

  for (const candidate of candidates) {
    const mapped = bookMap[candidate as keyof typeof bookMap];
    if (mapped) {
      return mapped;
    }
  }

  return undefined;
}

export function normalizeReference(reference: string): string {
  const lower = reference
    .trim()
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
  const parts = lower.split(/\s+/);

  if (parts.length < 2) {
    return reference;
  }

  const book = parts.slice(0, -1).join(" ");
  let chapterAndVerse = parts[parts.length - 1];

  if (/^\d+$/.test(chapterAndVerse) && singleChapterBooks.has(book)) {
    chapterAndVerse = `1:${chapterAndVerse}`;
  }

  const normalizedBook = normalizeBookName(book);
  if (!normalizedBook) {
    return reference;
  }

  if (/^\d+$/.test(chapterAndVerse) && singleChapterBooks.has(normalizedBook)) {
    chapterAndVerse = `1:${chapterAndVerse}`;
  }

  return `${normalizedBook} ${chapterAndVerse}`;
}
