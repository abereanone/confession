import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOOKS_BY_CODE, BIBLE_BOOKS } from "./books";
import { normalizeReference } from "./normalizeRef";

type RawVerse = {
  chapter?: number;
  verse?: number;
  text?: string;
};

type RawBibleData = Record<string, RawVerse[][]>;

type BibleSourceConfig = {
  provider?: string;
  datasetPath?: string;
  citedDatasetPath?: string;
};

export type BibleBookSummary = {
  code: string;
  name: string;
  testament: "ot" | "nt";
  chapterCount: number;
};

export type BibleVerse = {
  key: string;
  reference: string;
  bookCode: string;
  bookName: string;
  testament: "ot" | "nt";
  chapter: number;
  verse: number;
  text: string;
  searchText: string;
};

export type VerseData = {
  reference: string;
  text: string;
  version: string;
};

export type ResolvedReference = {
  normalized: string;
  bookCode: string;
  chapter: number;
  verse: number | null;
};

type LoadedBibleData = {
  books: BibleBookSummary[];
  chapterMap: Map<string, BibleVerse[]>;
  verseMap: Map<string, BibleVerse>;
  verses: BibleVerse[];
  provider: string;
  sourcePath: string;
};

type CitedVerseEntry =
  | string
  | {
      text?: string;
      version?: string;
    };

type CitedBibleData = {
  verses?: Record<string, CitedVerseEntry>;
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootCandidates = [
  path.resolve(moduleDir, "../../../../.."),
  path.resolve(moduleDir, "../../../.."),
];
const projectRoot =
  projectRootCandidates.find((candidate) =>
    existsSync(path.join(candidate, "shared", "data", "bible-source.json"))
  ) ?? projectRootCandidates[0];
const sourceConfigPath = path.join(projectRoot, "shared", "data", "bible-source.json");

let bibleDataPromise: Promise<LoadedBibleData> | null = null;
let citedLookupPromise: Promise<Map<string, CitedVerseEntry>> | null = null;

function normalizeLookupKey(reference: string): string {
  return normalizeReference(reference)
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[;,]\s*$/g, "")
    .trim();
}

function normalizeCitedLookupKey(reference: string): string {
  return normalizeReference(reference)
    .replace(/\|.*$/g, "")
    .replace(/(\d+)\s+and\s+(\d+)/gi, "$1, $2")
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVersionLabel(version: string): string {
  const trimmed = String(version ?? "").trim();
  if (!trimmed) {
    return "BSB";
  }

  const lower = trimmed.toLowerCase();
  if (lower === "bsb" || lower === "berean standard bible") {
    return "BSB";
  }
  if (lower === "kjv" || lower === "king james version") {
    return "KJV";
  }

  return trimmed;
}

function toCitedVerseData(entry: CitedVerseEntry | undefined): { text: string; version: string } | null {
  if (typeof entry === "string") {
    const text = entry.trim();
    return text ? { text, version: "BSB" } : null;
  }

  if (!entry || typeof entry !== "object" || typeof entry.text !== "string") {
    return null;
  }

  const text = entry.text.trim();
  if (!text) {
    return null;
  }

  const version = normalizeVersionLabel(typeof entry.version === "string" ? entry.version : "BSB");
  return { text, version };
}

function normalizeBookCode(value: string): string | null {
  const code = String(value ?? "").trim().toLowerCase();
  return BOOKS_BY_CODE.has(code) ? code : null;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readBibleSourceConfig(): Promise<BibleSourceConfig> {
  try {
    const raw = await readFile(sourceConfigPath, "utf-8");
    const parsed = JSON.parse(raw) as BibleSourceConfig;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function resolveBiblePath(config: BibleSourceConfig): Promise<string> {
  const configPath =
    typeof config.datasetPath === "string" && config.datasetPath.trim()
      ? path.resolve(path.dirname(sourceConfigPath), config.datasetPath)
      : "";

  const fallbackPaths = [
    configPath,
    path.join(projectRoot, "bsb-data-pipeline", "bsb.json"),
    path.resolve(projectRoot, "..", "catechize.ing", "bsb-data-pipeline", "bsb.json"),
  ].filter(Boolean);

  for (const targetPath of fallbackPaths) {
    if (await fileExists(targetPath)) {
      return targetPath;
    }
  }

  throw new Error(
    `Unable to locate bsb.json. Checked: ${fallbackPaths.join(", ")}`
  );
}

async function resolveCitedBiblePath(config: BibleSourceConfig): Promise<string | null> {
  const configPath =
    typeof config.citedDatasetPath === "string" && config.citedDatasetPath.trim()
      ? path.resolve(path.dirname(sourceConfigPath), config.citedDatasetPath)
      : "";

  const fallbackPaths = [
    configPath,
    path.join(projectRoot, "shared", "data", "bible-cited.json"),
    path.resolve(projectRoot, "..", "catechize.ing", "src", "generated", "bible-cited.json"),
  ].filter(Boolean);

  for (const targetPath of fallbackPaths) {
    if (await fileExists(targetPath)) {
      return targetPath;
    }
  }

  return null;
}

async function getCitedLookup(): Promise<Map<string, CitedVerseEntry>> {
  if (!citedLookupPromise) {
    citedLookupPromise = (async () => {
      const sourceConfig = await readBibleSourceConfig();
      const citedPath = await resolveCitedBiblePath(sourceConfig);
      if (!citedPath) {
        return new Map<string, CitedVerseEntry>();
      }

      try {
        const raw = await readFile(citedPath, "utf-8");
        const parsed = JSON.parse(raw) as CitedBibleData;
        return new Map<string, CitedVerseEntry>(Object.entries(parsed?.verses ?? {}));
      } catch {
        return new Map<string, CitedVerseEntry>();
      }
    })();
  }

  return citedLookupPromise;
}

async function loadBibleData(): Promise<LoadedBibleData> {
  const sourceConfig = await readBibleSourceConfig();
  const biblePath = await resolveBiblePath(sourceConfig);
  const raw = await readFile(biblePath, "utf-8");
  const parsed = JSON.parse(raw) as RawBibleData;

  const books: BibleBookSummary[] = [];
  const chapterMap = new Map<string, BibleVerse[]>();
  const verseMap = new Map<string, BibleVerse>();
  const verses: BibleVerse[] = [];

  for (const book of BIBLE_BOOKS) {
    const chaptersRaw = parsed[book.bsbCode];
    if (!Array.isArray(chaptersRaw) || chaptersRaw.length === 0) {
      continue;
    }

    books.push({
      code: book.code,
      name: book.name,
      testament: book.testament,
      chapterCount: chaptersRaw.length,
    });

    chaptersRaw.forEach((chapterRaw, chapterIndex) => {
      const chapterNumber = chapterIndex + 1;
      const chapterVerses: BibleVerse[] = [];

      if (!Array.isArray(chapterRaw)) {
        chapterMap.set(`${book.code}:${chapterNumber}`, chapterVerses);
        return;
      }

      chapterRaw.forEach((rawVerse, verseIndex) => {
        const text = String(rawVerse?.text ?? "").trim();
        if (!text) {
          return;
        }

        const chapter = Number(rawVerse?.chapter ?? chapterNumber);
        const verse = Number(rawVerse?.verse ?? verseIndex + 1);
        if (!Number.isFinite(chapter) || !Number.isFinite(verse)) {
          return;
        }

        const reference = `${book.name} ${chapter}:${verse}`;
        const key = `${book.code} ${chapter}:${verse}`;
        const verseEntry: BibleVerse = {
          key,
          reference,
          bookCode: book.code,
          bookName: book.name,
          testament: book.testament,
          chapter,
          verse,
          text,
          searchText: `${reference} ${text}`.toLowerCase(),
        };

        verses.push(verseEntry);
        chapterVerses.push(verseEntry);
        verseMap.set(key, verseEntry);
      });

      chapterMap.set(`${book.code}:${chapterNumber}`, chapterVerses);
    });
  }

  return {
    books,
    chapterMap,
    verseMap,
    verses,
    provider: sourceConfig.provider?.trim() || "BSB",
    sourcePath: biblePath,
  };
}

async function getLoadedBibleData(): Promise<LoadedBibleData> {
  if (!bibleDataPromise) {
    bibleDataPromise = loadBibleData();
  }
  return bibleDataPromise;
}

export async function getBibleProviderName(): Promise<string> {
  const data = await getLoadedBibleData();
  return data.provider;
}

export async function getBibleSourcePath(): Promise<string> {
  const data = await getLoadedBibleData();
  return data.sourcePath;
}

export async function listBibleBooks(): Promise<BibleBookSummary[]> {
  const data = await getLoadedBibleData();
  return data.books;
}

export async function getBibleChapter(
  bookCode: string,
  chapter: number
): Promise<BibleVerse[]> {
  const code = normalizeBookCode(bookCode);
  if (!code || !Number.isFinite(chapter) || chapter < 1) {
    return [];
  }

  const data = await getLoadedBibleData();
  return data.chapterMap.get(`${code}:${chapter}`) ?? [];
}

export async function resolveBibleReference(
  rawReference: string
): Promise<ResolvedReference | null> {
  const normalized = normalizeLookupKey(rawReference).replace(/[;,].*$/g, "").trim();
  const match = normalized.match(/^([1-3]?[a-z]{2,3})\s+(\d+)(?::(\d+(?:-\d+)?))?$/i);

  if (!match) {
    return null;
  }

  const bookCode = normalizeBookCode(match[1] ?? "");
  const chapter = Number.parseInt(String(match[2] ?? ""), 10);
  const verseChunk = String(match[3] ?? "").trim();
  const verse = verseChunk ? Number.parseInt(verseChunk.split("-")[0] ?? "", 10) : null;

  if (!bookCode || !Number.isFinite(chapter) || chapter < 1) {
    return null;
  }

  if (verse !== null && (!Number.isFinite(verse) || verse < 1)) {
    return null;
  }

  return {
    normalized,
    bookCode,
    chapter,
    verse,
  };
}

export async function getVerseByReference(
  rawReference: string
): Promise<VerseData | null> {
  const citedLookup = await getCitedLookup();
  const citedVerse = toCitedVerseData(citedLookup.get(normalizeCitedLookupKey(rawReference)));
  if (citedVerse) {
    return {
      reference: String(rawReference ?? "").trim(),
      text: citedVerse.text,
      version: citedVerse.version,
    };
  }

  const resolved = await resolveBibleReference(rawReference);
  if (!resolved || resolved.verse === null) {
    return null;
  }

  const data = await getLoadedBibleData();
  const key = `${resolved.bookCode} ${resolved.chapter}:${resolved.verse}`;
  const verse = data.verseMap.get(key);
  if (!verse) {
    return null;
  }

  return {
    reference: verse.reference,
    text: verse.text,
    version: normalizeVersionLabel(data.provider || "BSB"),
  };
}

export async function getVerseLookup(
  references: string[]
): Promise<Record<string, { text: string; version: string }>> {
  const lookup: Record<string, { text: string; version: string }> = {};

  for (const reference of references) {
    const key = normalizeLookupKey(reference);
    if (!key || lookup[key]) {
      continue;
    }

    const verse = await getVerseByReference(reference);
    if (verse) {
      lookup[key] = {
        text: verse.text,
        version: verse.version,
      };
    }
  }

  return lookup;
}

export async function searchBible(
  query: string,
  limit = 200,
  options?: { testament?: "ot" | "nt" }
): Promise<BibleVerse[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const data = await getLoadedBibleData();
  const normalizedQuery = normalizeLookupKey(trimmed);
  const tokens = normalizedQuery
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const seenKeys = new Set<string>();
  const results: BibleVerse[] = [];
  const scopedTestament = options?.testament;

  const directMatch = await getVerseByReference(trimmed);
  if (directMatch) {
    const resolved = await resolveBibleReference(directMatch.reference);
    if (resolved?.verse !== null) {
      const key = `${resolved.bookCode} ${resolved.chapter}:${resolved.verse}`;
      const verse = data.verseMap.get(key);
      if (verse && (!scopedTestament || verse.testament === scopedTestament)) {
        results.push(verse);
        seenKeys.add(verse.key);
      }
    }
  }

  for (const verse of data.verses) {
    if (seenKeys.has(verse.key)) {
      continue;
    }
    if (scopedTestament && verse.testament !== scopedTestament) {
      continue;
    }

    if (tokens.every((token) => verse.searchText.includes(token))) {
      results.push(verse);
      seenKeys.add(verse.key);
      if (results.length >= limit) {
        break;
      }
    }
  }

  return results.slice(0, limit);
}
