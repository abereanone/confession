import type { ScriptureEntry } from "./scriptures";

export type VerseRange = {
  startVerse: number;
  endVerse: number;
};

const SINGLE_CHAPTER_BOOK_CODES = new Set(["oba", "phm", "2jn", "3jn", "jud"]);

export function isSingleChapterBook(bookCode: string): boolean {
  return SINGLE_CHAPTER_BOOK_CODES.has(bookCode);
}

function normalizeReferencePart(referencePart: string): string {
  return referencePart
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, "")
    .replace(/[.]+$/g, "");
}

function expandVerseBySuffix(verse: number, suffix: string, chapterMaxVerse: number): number {
  if (suffix === "f") {
    return Math.min(verse + 1, chapterMaxVerse);
  }

  if (suffix === "ff") {
    return chapterMaxVerse;
  }

  return verse;
}

function createRange(startVerse: number, endVerse: number, chapterMaxVerse: number): VerseRange | null {
  const start = Math.max(1, Math.min(startVerse, chapterMaxVerse));
  const end = Math.max(1, Math.min(endVerse, chapterMaxVerse));
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }

  if (end < start) {
    return null;
  }

  return { startVerse: start, endVerse: end };
}

export function parseRangesForChapter(
  referencePart: string,
  chapterNumber: number,
  chapterMaxVerse: number,
  isSingleChapterBook: boolean
): VerseRange[] {
  const normalized = normalizeReferencePart(referencePart);
  if (!normalized || chapterMaxVerse < 1) {
    return [];
  }

  const segments = normalized
    .split(/[;,]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const ranges: VerseRange[] = [];
  let activeVerseChapter: number | null = null;

  for (const segment of segments) {
    const verseWithChapterMatch = segment.match(/^(\d+):(\d+)(ff?|)?$/);
    if (verseWithChapterMatch) {
      const chapter = Number.parseInt(String(verseWithChapterMatch[1] ?? ""), 10);
      const verse = Number.parseInt(String(verseWithChapterMatch[2] ?? ""), 10);
      const suffix = String(verseWithChapterMatch[3] ?? "");
      activeVerseChapter = chapter;

      if (chapter === chapterNumber) {
        const range = createRange(
          verse,
          expandVerseBySuffix(verse, suffix, chapterMaxVerse),
          chapterMaxVerse
        );
        if (range) {
          ranges.push(range);
        }
      }

      continue;
    }

    const verseRangeWithChapterMatch = segment.match(/^(\d+):(\d+)-(\d+)(ff?|)?$/);
    if (verseRangeWithChapterMatch) {
      const chapter = Number.parseInt(String(verseRangeWithChapterMatch[1] ?? ""), 10);
      const startVerse = Number.parseInt(String(verseRangeWithChapterMatch[2] ?? ""), 10);
      const endVerseValue = Number.parseInt(String(verseRangeWithChapterMatch[3] ?? ""), 10);
      const suffix = String(verseRangeWithChapterMatch[4] ?? "");
      activeVerseChapter = chapter;

      if (chapter === chapterNumber) {
        const range = createRange(
          startVerse,
          expandVerseBySuffix(endVerseValue, suffix, chapterMaxVerse),
          chapterMaxVerse
        );
        if (range) {
          ranges.push(range);
        }
      }

      continue;
    }

    const crossChapterMatch = segment.match(/^(\d+):(\d+)-(\d+):(\d+)$/);
    if (crossChapterMatch) {
      const startChapter = Number.parseInt(String(crossChapterMatch[1] ?? ""), 10);
      const startVerse = Number.parseInt(String(crossChapterMatch[2] ?? ""), 10);
      const endChapter = Number.parseInt(String(crossChapterMatch[3] ?? ""), 10);
      const endVerse = Number.parseInt(String(crossChapterMatch[4] ?? ""), 10);
      activeVerseChapter = null;

      if (chapterNumber < startChapter || chapterNumber > endChapter) {
        continue;
      }

      if (startChapter === endChapter && chapterNumber === startChapter) {
        const range = createRange(startVerse, endVerse, chapterMaxVerse);
        if (range) {
          ranges.push(range);
        }
        continue;
      }

      if (chapterNumber === startChapter) {
        const range = createRange(startVerse, chapterMaxVerse, chapterMaxVerse);
        if (range) {
          ranges.push(range);
        }
        continue;
      }

      if (chapterNumber === endChapter) {
        const range = createRange(1, endVerse, chapterMaxVerse);
        if (range) {
          ranges.push(range);
        }
        continue;
      }

      const range = createRange(1, chapterMaxVerse, chapterMaxVerse);
      if (range) {
        ranges.push(range);
      }
      continue;
    }

    const bareVerseMatch = segment.match(/^(\d+)(ff?|)?$/);
    if (bareVerseMatch) {
      const value = Number.parseInt(String(bareVerseMatch[1] ?? ""), 10);
      const suffix = String(bareVerseMatch[2] ?? "");

      if (activeVerseChapter !== null || isSingleChapterBook) {
        const verseChapter = activeVerseChapter ?? (isSingleChapterBook ? 1 : null);
        if (verseChapter !== null && verseChapter === chapterNumber) {
          const range = createRange(
            value,
            expandVerseBySuffix(value, suffix, chapterMaxVerse),
            chapterMaxVerse
          );
          if (range) {
            ranges.push(range);
          }
        }
      } else if (value === chapterNumber) {
        const range = createRange(1, chapterMaxVerse, chapterMaxVerse);
        if (range) {
          ranges.push(range);
        }
      }

      continue;
    }

    const ambiguousRangeMatch = segment.match(/^(\d+)-(\d+)$/);
    if (ambiguousRangeMatch) {
      const startValue = Number.parseInt(String(ambiguousRangeMatch[1] ?? ""), 10);
      const endValue = Number.parseInt(String(ambiguousRangeMatch[2] ?? ""), 10);

      if (activeVerseChapter !== null || isSingleChapterBook) {
        const verseChapter = activeVerseChapter ?? (isSingleChapterBook ? 1 : null);
        if (verseChapter !== null && verseChapter === chapterNumber) {
          const range = createRange(startValue, endValue, chapterMaxVerse);
          if (range) {
            ranges.push(range);
          }
        }
      } else if (chapterNumber >= startValue && chapterNumber <= endValue) {
        const range = createRange(1, chapterMaxVerse, chapterMaxVerse);
        if (range) {
          ranges.push(range);
        }
      }

      continue;
    }
  }

  const dedupe = new Map<string, VerseRange>();
  ranges.forEach((range) => {
    dedupe.set(`${range.startVerse}:${range.endVerse}`, range);
  });

  return [...dedupe.values()].sort((a, b) => {
    if (a.startVerse !== b.startVerse) {
      return a.startVerse - b.startVerse;
    }
    return a.endVerse - b.endVerse;
  });
}

export function buildChapterVerseScriptureMap(
  scriptureEntries: ScriptureEntry[],
  bookCode: string,
  chapterNumber: number,
  chapterMaxVerse: number
): Map<number, ScriptureEntry[]> {
  const isSingleChapter = isSingleChapterBook(bookCode);
  const verseMap = new Map<number, ScriptureEntry[]>();

  scriptureEntries.forEach((entry) => {
    if (entry.bookCode !== bookCode) {
      return;
    }

    const ranges = parseRangesForChapter(
      entry.referencePart,
      chapterNumber,
      chapterMaxVerse,
      isSingleChapter
    );

    ranges.forEach((range) => {
      for (let verse = range.startVerse; verse <= range.endVerse; verse += 1) {
        const existing = verseMap.get(verse) ?? [];
        if (!existing.some((item) => item.slug === entry.slug)) {
          existing.push(entry);
          verseMap.set(verse, existing);
        }
      }
    });
  });

  verseMap.forEach((entries) => {
    entries.sort((left, right) =>
      left.reference.localeCompare(right.reference, undefined, { numeric: true })
    );
  });

  return verseMap;
}
