import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BIBLE_BOOKS, BOOKS_BY_CODE } from "./books";

type RawBsbChange = {
  book?: string;
  chapter?: number;
  verse?: number;
  type?: string;
  version?: string;
  reason?: string;
  before?: string;
  after?: string;
};

export type BsbChange = {
  id: string;
  bookCode: string;
  bookName: string;
  chapter: number;
  verse: number;
  reference: string;
  type: string;
  typeLabel: string;
  typeDescription: string;
  isDivineNameChange: boolean;
  version: string;
  reason: string;
  before: string;
  after: string;
  beforeHtml: string;
  afterHtml: string;
};

export type BsbChangeSummary = {
  total: number;
  byType: Array<{ type: string; label: string; count: number }>;
  byBook: Array<{ code: string; name: string; count: number }>;
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootCandidates = [
  path.resolve(moduleDir, "../../../../.."),
  path.resolve(moduleDir, "../../../.."),
];
const projectRoot =
  projectRootCandidates.find((candidate) =>
    existsSync(path.join(candidate, "shared", "data", "bsb.changes.json"))
  ) ?? projectRootCandidates[0];
const changesPath = path.join(projectRoot, "shared", "data", "bsb.changes.json");

let changesPromise: Promise<BsbChange[]> | null = null;

const changeTypeDetails: Record<string, { label: string; description: string }> = {
  divine_name1: {
    label: "LORD GOD -> Yahweh",
    description: "the LORD GOD or GOD the LORD -> Yahweh-centered rendering",
  },
  divine_name2: {
    label: "THE LORD -> YAHWEH",
    description: "All-caps THE LORD -> YAHWEH",
  },
  divine_name3: {
    label: "LORD -> Yahweh",
    description: "LORD or the LORD -> Yahweh, excluding LORD OF LORDS",
  },
  divine_name4: {
    label: "GOD -> Yahweh",
    description: "All-caps GOD -> Yahweh, excluding UNKNOWN GOD",
  },
  insert: {
    label: "Inserted Verse",
    description: "Verse supplied by the local mods file",
  },
  override: {
    label: "Override",
    description: "Verse text replaced by the local mods file",
  },
  whitespace: {
    label: "Whitespace",
    description: "Repeated whitespace normalized",
  },
  emdash_spacing: {
    label: "Em Dash Spacing",
    description: "Spacing around encoded em dashes normalized",
  },
};

const divineNameHighlightPatterns: Record<string, { before: RegExp; after: RegExp }> = {
  divine_name1: {
    before: /\b(the LORD GOD|GOD the LORD)\b/g,
    after: /\bYah\u2014Yaweh himself\u2014/g,
  },
  divine_name2: {
    before: /\bTHE LORD\b/g,
    after: /\bYAHWEH\b/g,
  },
  divine_name3: {
    before: /(\b[Tt]he )?\bLORD\b(?! OF LORDS)/g,
    after: /\bYahweh\b/g,
  },
  divine_name4: {
    before: /(?<!UNKNOWN )\bGOD\b/g,
    after: /\bYahweh\b/g,
  },
};

function formatType(value: string): string {
  const type = value.trim();
  if (!type) {
    return "Change";
  }

  const knownLabel = changeTypeDetails[type]?.label;
  if (knownLabel) {
    return knownLabel;
  }

  return type
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getTypeDescription(type: string): string {
  return changeTypeDetails[type]?.description ?? "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightMatches(value: string, pattern: RegExp): string {
  let lastIndex = 0;
  let html = "";

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    const matchedText = match[0] ?? "";
    html += escapeHtml(value.slice(lastIndex, index));
    html += `<mark class="change-highlight">${escapeHtml(matchedText)}</mark>`;
    lastIndex = index + matchedText.length;
  }

  html += escapeHtml(value.slice(lastIndex));
  return html;
}

function renderChangeHtml(value: string, type: string, side: "before" | "after"): string {
  const pattern = divineNameHighlightPatterns[type]?.[side];
  return pattern ? highlightMatches(value, pattern) : escapeHtml(value);
}

function normalizeChange(change: RawBsbChange, index: number): BsbChange | null {
  const bookCode = String(change.book ?? "").trim().toLowerCase();
  const book = BOOKS_BY_CODE.get(bookCode);
  const chapter = Number(change.chapter);
  const verse = Number(change.verse);
  const before = String(change.before ?? "").trim();
  const after = String(change.after ?? "").trim();

  if (!book || !Number.isFinite(chapter) || !Number.isFinite(verse) || !before || !after) {
    return null;
  }

  const type = String(change.type ?? "change").trim() || "change";
  const reference = `${book.name} ${chapter}:${verse}`;
  const isDivineNameChange = Boolean(divineNameHighlightPatterns[type]);

  return {
    id: `${bookCode}-${chapter}-${verse}-${type}-${index}`,
    bookCode,
    bookName: book.name,
    chapter,
    verse,
    reference,
    type,
    typeLabel: formatType(type),
    typeDescription: getTypeDescription(type),
    isDivineNameChange,
    version: String(change.version ?? "").trim(),
    reason: String(change.reason ?? "").trim(),
    before,
    after,
    beforeHtml: renderChangeHtml(before, type, "before"),
    afterHtml: renderChangeHtml(after, type, "after"),
  };
}

async function readBsbChanges(): Promise<BsbChange[]> {
  const raw = await readFile(changesPath, "utf-8");
  const parsed = JSON.parse(raw) as RawBsbChange[];

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((change, index) => normalizeChange(change, index))
    .filter((change): change is BsbChange => Boolean(change));
}

export async function listBsbChanges(): Promise<BsbChange[]> {
  if (!changesPromise) {
    changesPromise = readBsbChanges();
  }

  return changesPromise;
}

export async function getBsbChangeSummary(): Promise<BsbChangeSummary> {
  const changes = await listBsbChanges();
  const typeCounts = new Map<string, number>();
  const bookCounts = new Map<string, number>();

  for (const change of changes) {
    typeCounts.set(change.type, (typeCounts.get(change.type) ?? 0) + 1);
    bookCounts.set(change.bookCode, (bookCounts.get(change.bookCode) ?? 0) + 1);
  }

  return {
    total: changes.length,
    byType: Array.from(typeCounts.entries())
      .map(([type, count]) => ({ type, label: formatType(type), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    byBook: BIBLE_BOOKS
      .map((book) => ({ code: book.code, name: book.name, count: bookCounts.get(book.code) ?? 0 }))
      .filter((book) => book.count > 0),
  };
}
