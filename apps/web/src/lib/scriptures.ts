import bookMap from "./bible/bookMap.json";
import { autoLinkBibleRefs } from "./bible/autoLinkBibleRefs";
import { normalizeReference } from "./bible/normalizeRef";
import { BOOKS_BY_CODE } from "./bible/books";
import { getConfessionDisplayUnits, listConfessions } from "./confessions";

export type ScriptureLocation = {
  confessionSlug: string;
  confessionTitle: string;
  confessionShortCode: string;
  unitLabel: string;
  unitNumber: number;
  paragraphNumber: number;
  unitTitle: string;
};

export type ScriptureEntry = {
  key: string;
  slug: string;
  reference: string;
  bookCode: string;
  bookName: string;
  referencePart: string;
  occurrenceCount: number;
  confessionCount: number;
  confessionCodes: string[];
  locations: ScriptureLocation[];
  searchText: string;
};

export type ScriptureBookGroup = {
  bookCode: string;
  bookName: string;
  count: number;
  entries: ScriptureEntry[];
};

type MutableScriptureEntry = {
  key: string;
  slug: string;
  reference: string;
  bookCode: string;
  bookName: string;
  referencePart: string;
  occurrenceCount: number;
  confessionCodes: Set<string>;
  locationKeys: Set<string>;
  locations: ScriptureLocation[];
  searchText: string;
};

const bookPattern = Object.keys(bookMap)
  .sort((a, b) => b.length - a.length)
  .map((book) => book.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

const referencePattern = new RegExp(`^(${bookPattern})\\s+(.+)$`, "i");
const scriptureEntries = buildScriptureIndex();
const scriptureMap = new Map(scriptureEntries.map((entry) => [entry.slug, entry]));
const scriptureBookGroups = buildScriptureBookGroups(scriptureEntries);

export function listScriptures(): ScriptureEntry[] {
  return scriptureEntries;
}

export function listScriptureBookGroups(): ScriptureBookGroup[] {
  return scriptureBookGroups;
}

export function findScripture(slug: string): ScriptureEntry | null {
  return scriptureMap.get(slug) ?? null;
}

function buildScriptureIndex(): ScriptureEntry[] {
  const entries = new Map<string, MutableScriptureEntry>();
  const confessions = listConfessions();

  confessions.forEach((confession) => {
    const displayUnits = getConfessionDisplayUnits(confession);
    displayUnits.forEach((unit) => {
      unit.content.forEach((paragraph, paragraphIndex) => {
        const references = new Set([
          ...extractParentheticalReferences(paragraph),
          ...extractInlineReferences(paragraph),
        ]);

        references.forEach((reference) => {
          const normalized = normalizeReferenceChunk(reference);
          if (!normalized) {
            return;
          }

          const location: ScriptureLocation = {
            confessionSlug: confession.slug,
            confessionTitle: confession.title,
            confessionShortCode: confession.shortCode,
            unitLabel: confession.unitLabel,
            unitNumber: unit.number,
            paragraphNumber: paragraphIndex + 1,
            unitTitle: unit.title,
          };

          const locationKey = `${location.confessionSlug}:${location.unitNumber}:${location.paragraphNumber}`;
          const existing = entries.get(normalized.key);
          if (existing) {
            existing.occurrenceCount += 1;
            existing.confessionCodes.add(location.confessionShortCode);
            if (!existing.locationKeys.has(locationKey)) {
              existing.locationKeys.add(locationKey);
              existing.locations.push(location);
            }
            return;
          }

          entries.set(normalized.key, {
            ...normalized,
            occurrenceCount: 1,
            confessionCodes: new Set([location.confessionShortCode]),
            locationKeys: new Set([locationKey]),
            locations: [location],
          });
        });
      });
    });
  });

  return [...entries.values()]
    .map((entry) => ({
      key: entry.key,
      slug: entry.slug,
      reference: entry.reference,
      bookCode: entry.bookCode,
      bookName: entry.bookName,
      referencePart: entry.referencePart,
      occurrenceCount: entry.occurrenceCount,
      confessionCount: entry.confessionCodes.size,
      confessionCodes: [...entry.confessionCodes].sort((a, b) => a.localeCompare(b)),
      locations: entry.locations.sort((a, b) => {
        const confessionSort = a.confessionTitle.localeCompare(b.confessionTitle);
        if (confessionSort !== 0) {
          return confessionSort;
        }
        if (a.unitNumber !== b.unitNumber) {
          return a.unitNumber - b.unitNumber;
        }
        return a.paragraphNumber - b.paragraphNumber;
      }),
      searchText: entry.searchText,
    }))
    .sort(compareScriptureEntries);
}

function buildScriptureBookGroups(entries: ScriptureEntry[]): ScriptureBookGroup[] {
  const groups = new Map<string, ScriptureBookGroup>();

  entries.forEach((entry) => {
    const existing = groups.get(entry.bookCode);
    if (existing) {
      existing.entries.push(entry);
      existing.count += entry.occurrenceCount;
      return;
    }

    groups.set(entry.bookCode, {
      bookCode: entry.bookCode,
      bookName: entry.bookName,
      count: entry.occurrenceCount,
      entries: [entry],
    });
  });

  return [...groups.values()].sort(
    (a, b) => getBookOrder(a.bookCode) - getBookOrder(b.bookCode)
  );
}

function extractInlineReferences(text: string): string[] {
  if (!text) {
    return [];
  }

  const linkedText = autoLinkBibleRefs(text);
  const matches = [...linkedText.matchAll(/data-ref="([^"]+)"/g)];
  return matches
    .map((match) => String(match[1] ?? "").trim())
    .filter(Boolean);
}

function extractParentheticalReferences(text: string): string[] {
  if (!text) {
    return [];
  }

  const matches = [...text.matchAll(/\(([^()]+)\)/g)];
  const references: string[] = [];

  matches.forEach((match) => {
    const content = String(match[1] ?? "");
    content
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => references.push(part));
  });

  return references;
}

function normalizeReferenceChunk(reference: string) {
  const cleaned = reference
    .replace(/\u2013|\u2014/g, "-")
    .replace(/(?:,\s*)?&c\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim()
    .replace(/[.,;:]+$/g, "")
    .trim();

  const normalizedReference = normalizeReference(cleaned);
  const match = normalizedReference.match(referencePattern);
  if (!match) {
    return null;
  }

  const rawBook = String(match[1] ?? "").toLowerCase();
  const referencePart = String(match[2] ?? "").trim();
  const bookCode = bookMap[rawBook as keyof typeof bookMap];
  if (!bookCode || !referencePart) {
    return null;
  }

  const bookName = BOOKS_BY_CODE.get(bookCode)?.name ?? bookCode.toUpperCase();
  const bookSearchText = buildBookSearchText(bookCode, bookName);
  const referenceText = `${bookName} ${referencePart}`;
  const key = `${bookCode} ${referencePart.toLowerCase()}`;
  const slug = key
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return {
    key,
    slug,
    reference: referenceText,
    bookCode,
    bookName,
    referencePart,
    searchText: buildSearchText(bookSearchText, referencePart),
  };
}

function buildBookSearchText(bookCode: string, bookName: string): string {
  const aliases = getBookAliases(bookCode);
  return [...new Set([bookName, ...aliases])]
    .map((value) => value.toLowerCase())
    .join(" | ");
}

function buildSearchText(bookSearchText: string, referencePart: string): string {
  const variants = new Set<string>(
    bookSearchText
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => `${value} ${referencePart}`)
  );

  return [...variants]
    .map((value) => value.toLowerCase())
    .join(" ");
}

function getBookAliases(bookCode: string): string[] {
  return [
    ...new Set(
      Object.entries(bookMap)
        .filter(([, value]) => value === bookCode)
        .map(([name]) => normalizeAlias(name))
        .filter(Boolean)
    ),
  ];
}

function normalizeAlias(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function compareScriptureEntries(a: ScriptureEntry, b: ScriptureEntry): number {
  const orderA = getBookOrder(a.bookCode);
  const orderB = getBookOrder(b.bookCode);
  if (orderA !== orderB) {
    return orderA - orderB;
  }

  return a.referencePart.localeCompare(b.referencePart, undefined, { numeric: true });
}

function getBookOrder(code: string): number {
  return BOOKS_BY_CODE.get(code)?.order ?? Number.MAX_SAFE_INTEGER;
}
