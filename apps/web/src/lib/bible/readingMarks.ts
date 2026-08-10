/**
 * Client-side reading position + bookmarks for the Bible reader.
 *
 * There is no account system, so both live in localStorage on the device.
 * Every access is wrapped like the other stored preferences (`site-theme`,
 * `bible-copy-include-link`): storage throws in private-mode Safari and a
 * bookmark is never important enough to break the page over.
 *
 * Two distinct things share this module:
 *   - the *position*, written automatically as you read (one per device), and
 *   - *bookmarks*, created deliberately by the reader (many).
 * They differ in how they are opened — see `markHref`.
 */

export type ReadingMark = {
  /** Lowercase book code as used in the URL, e.g. `jhn`. */
  book: string;
  chapter: number;
  /** 0 means the mark is for the whole chapter rather than a verse. */
  verse: number;
  /**
   * Display reference ("John 3:16"). Stored rather than derived so pages that
   * do not ship the book catalog — the home page, `/bible` — can render it.
   */
  label: string;
  /** Epoch ms of the last write. */
  at: number;
};

export type Bookmark = ReadingMark & { id: string };

/** Superseded by RECENT_KEY; still read once so an existing place is not lost. */
const POSITION_KEY = "bible-reading-position";
const RECENT_KEY = "bible-recent-chapters";
const BOOKMARKS_KEY = "bible-bookmarks";

/** Plenty for a reader; keeps the panel and the stored blob bounded. */
const MAX_BOOKMARKS = 100;

/** How many places "continue reading" offers. */
const MAX_RECENT = 3;

const readRaw = (key: string): string => {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};

const writeRaw = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // best-effort; the in-page state stays correct for this session
  }
};

const removeRaw = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

const toMark = (value: unknown): ReadingMark | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const book = String(record.book || "").trim().toLowerCase();
  const chapter = Number(record.chapter);
  const verse = Number(record.verse);
  const label = String(record.label || "").trim();
  const at = Number(record.at);

  if (!book || !Number.isFinite(chapter) || chapter < 1) {
    return null;
  }

  return {
    book,
    chapter: Math.floor(chapter),
    verse: Number.isFinite(verse) && verse > 0 ? Math.floor(verse) : 0,
    label: label || `${book} ${chapter}`,
    at: Number.isFinite(at) ? at : 0,
  };
};

/** Identity of a location, so the same verse is never bookmarked twice. */
export const markKey = (mark: Pick<ReadingMark, "book" | "chapter" | "verse">): string =>
  `${mark.book}:${mark.chapter}:${mark.verse}`;

export const isSameLocation = (
  a: Pick<ReadingMark, "book" | "chapter" | "verse"> | null,
  b: Pick<ReadingMark, "book" | "chapter" | "verse"> | null
): boolean => Boolean(a && b && markKey(a) === markKey(b));

/**
 * Where a mark opens.
 *
 * Bookmarks land on `#verse-N`, which reuses the reader's existing target
 * highlight — the reader chose that verse, so calling it out is right. The
 * resumed position instead passes `?resume=1` and is scrolled to silently:
 * the yellow highlight means "someone linked you here", and reusing it for an
 * automatic position would misrepresent it.
 */
export const markHref = (mark: ReadingMark, kind: "bookmark" | "resume" = "bookmark"): string => {
  const base = `/bible/${encodeURIComponent(mark.book)}/${mark.chapter}`;
  if (kind === "resume") {
    return mark.verse > 1 ? `${base}?resume=1` : base;
  }
  return mark.verse > 0 ? `${base}#verse-${mark.verse}` : base;
};

const isSameChapter = (
  a: Pick<ReadingMark, "book" | "chapter">,
  b: Pick<ReadingMark, "book" | "chapter">
): boolean => a.book === b.book && a.chapter === b.chapter;

/**
 * The chapters to offer as "continue reading", newest first.
 *
 * A run of chapters read in sequence collapses to the last one reached, so
 * Matthew 1-3, then Revelation 4-6, then Isaiah 2 reads back as Isaiah 2,
 * Revelation 6, Matthew 3 rather than filling the list with Matthew.
 */
export const listRecentChapters = (): ReadingMark[] => {
  const raw = readRaw(RECENT_KEY);

  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }

  if (Array.isArray(parsed)) {
    const marks: ReadingMark[] = [];
    for (const entry of parsed) {
      const mark = toMark(entry);
      if (mark && !marks.some((existing) => isSameChapter(existing, mark))) {
        marks.push(mark);
      }
    }
    if (marks.length > 0) {
      return marks.slice(0, MAX_RECENT);
    }
  }

  // Readers who saved a place before the recents list existed.
  const legacy = readRaw(POSITION_KEY);
  if (legacy) {
    try {
      const mark = toMark(JSON.parse(legacy));
      if (mark) {
        return [mark];
      }
    } catch {
      // fall through
    }
  }

  return [];
};

/** The most recent chapter — what a bare /bible resumes to. */
export const readPosition = (): ReadingMark | null => listRecentChapters()[0] || null;

/** The stored entry for one chapter, so opening it can restore its own verse. */
export const findRecentChapter = (book: string, chapter: number): ReadingMark | null =>
  listRecentChapters().find((mark) => mark.book === book && mark.chapter === chapter) || null;

/**
 * Records where the reader is.
 *
 * `neighbors` are the chapters immediately before and after this one (which the
 * reader already computes for Previous/Next, so book boundaries are handled).
 * If the newest entry is one of them, this chapter continues that run and
 * replaces it instead of adding a row.
 */
export const writePosition = (
  mark: Omit<ReadingMark, "at">,
  neighbors: ReadonlyArray<{ book: string; chapter: number }> = []
): void => {
  const next = toMark({ ...mark, at: Date.now() });
  if (!next) {
    return;
  }

  const existing = listRecentChapters();
  const top = existing[0] || null;
  const continuesRun =
    top !== null &&
    (isSameChapter(top, next) ||
      neighbors.some((neighbor) => isSameChapter(top, { book: neighbor.book, chapter: neighbor.chapter })));

  const rest = (continuesRun ? existing.slice(1) : existing).filter(
    (entry) => !isSameChapter(entry, next)
  );

  writeRaw(RECENT_KEY, JSON.stringify([next, ...rest].slice(0, MAX_RECENT)));
  // The old single-position key is no longer read except for migration; drop it
  // so a stale value can never resurface.
  removeRaw(POSITION_KEY);
};

export const listBookmarks = (): Bookmark[] => {
  const raw = readRaw(BOOKMARKS_KEY);
  if (!raw) {
    return [];
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const seen = new Set<string>();
  const bookmarks: Bookmark[] = [];

  for (const entry of parsed) {
    const mark = toMark(entry);
    if (!mark) {
      continue;
    }
    const key = markKey(mark);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const id = String((entry as Record<string, unknown>)?.id || "").trim() || key;
    bookmarks.push({ ...mark, id });
  }

  return bookmarks.sort((a, b) => b.at - a.at).slice(0, MAX_BOOKMARKS);
};

const saveBookmarks = (bookmarks: Bookmark[]): void => {
  writeRaw(BOOKMARKS_KEY, JSON.stringify(bookmarks.slice(0, MAX_BOOKMARKS)));
};

export const findBookmark = (
  target: Pick<ReadingMark, "book" | "chapter" | "verse">
): Bookmark | null => {
  const key = markKey(target);
  return listBookmarks().find((bookmark) => markKey(bookmark) === key) || null;
};

const createId = (): string => {
  try {
    if (typeof crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

/**
 * Adds the location if it is not bookmarked, removes it if it is.
 * Returns the resulting list and whether the mark now exists.
 */
export const toggleBookmark = (
  target: Omit<ReadingMark, "at">
): { added: boolean; bookmarks: Bookmark[] } => {
  const mark = toMark({ ...target, at: Date.now() });
  if (!mark) {
    return { added: false, bookmarks: listBookmarks() };
  }

  const key = markKey(mark);
  const existing = listBookmarks();
  const without = existing.filter((bookmark) => markKey(bookmark) !== key);

  if (without.length !== existing.length) {
    saveBookmarks(without);
    return { added: false, bookmarks: without };
  }

  const next = [{ ...mark, id: createId() }, ...without].slice(0, MAX_BOOKMARKS);
  saveBookmarks(next);
  return { added: true, bookmarks: next };
};

export const removeBookmarkById = (id: string): Bookmark[] => {
  const next = listBookmarks().filter((bookmark) => bookmark.id !== id);
  saveBookmarks(next);
  return next;
};
