import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const modsFile = path.join(currentDir, "..", "mods.json");
const sourceFile = path.join(currentDir, "..", "bsb.txt");
const outputFile = path.join(currentDir, "..", "bsb.json");
const changeLogFile = path.join(currentDir, "..", "bsb.changes.json");

// -----------------------------
// BOOK MAP
// -----------------------------
const bookMap = {
  "Genesis": "gen", "Exodus": "exo", "Leviticus": "lev", "Numbers": "num",
  "Deuteronomy": "deu", "Joshua": "jos", "Judges": "jdg", "Ruth": "rut",
  "1 Samuel": "1sa", "2 Samuel": "2sa", "1 Kings": "1ki", "2 Kings": "2ki",
  "1 Chronicles": "1ch", "2 Chronicles": "2ch", "Ezra": "ezr", "Nehemiah": "neh",
  "Esther": "est", "Job": "job", "Psalm": "psa", "Proverbs": "pro",
  "Ecclesiastes": "ecc", "Song of Solomon": "sng", "Isaiah": "isa",
  "Jeremiah": "jer", "Lamentations": "lam", "Ezekiel": "ezk", "Daniel": "dan",
  "Hosea": "hos", "Joel": "jol", "Amos": "amo", "Obadiah": "oba",
  "Jonah": "jon", "Micah": "mic", "Nahum": "nah", "Habakkuk": "hab",
  "Zephaniah": "zep", "Haggai": "hag", "Zechariah": "zec", "Malachi": "mal",
  "Matthew": "mat", "Mark": "mrk", "Luke": "luk", "John": "jhn",
  "Acts": "act", "Romans": "rom", "1 Corinthians": "1co", "2 Corinthians": "2co",
  "Galatians": "gal", "Ephesians": "eph", "Philippians": "php",
  "Colossians": "col", "1 Thessalonians": "1th", "2 Thessalonians": "2th",
  "1 Timothy": "1ti", "2 Timothy": "2ti", "Titus": "tit", "Philemon": "phm",
  "Hebrews": "heb", "James": "jas", "1 Peter": "1pe", "2 Peter": "2pe",
  "1 John": "1jn", "2 John": "2jn", "3 John": "3jn", "Jude": "jud",
  "Revelation": "rev"
};

// Prebuild regex for performance
const bookNames = Object.keys(bookMap).sort((a, b) => b.length - a.length);
// The verse text is optional: bsb.txt gives the verses omitted by the critical
// text (Acts 24:7, Mark 9:44, …) as a reference line with nothing after it.
// Requiring text there made those lines fall through to the continuation branch,
// which glued "Acts 24:7" onto the end of verse 24:6.
const bookRegex = new RegExp(`^(${bookNames.join("|")})\\s+(\\d+):(\\d+)(?:\\s+(.*))?$`);

// -----------------------------
// PARSER (LINE-DRIVEN)
// -----------------------------
function parseBsbTxt(text) {
  const lines = text.split(/\r?\n/);
  const result = {};

  let currentEntry = null;
  let verseCount = 0;

  const issues = {
    unmatchedLines: [],
    appendedLines: 0
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    const match = line.match(bookRegex);

    if (match) {
      const [, bookName, chapterStr, verseStr, verseText] = match;

      const bookCode = bookMap[bookName];
      const chapter = Number(chapterStr);
      const verse = Number(verseStr);

      if (!result[bookCode]) result[bookCode] = [];
      if (!result[bookCode][chapter - 1]) result[bookCode][chapter - 1] = [];

      const entry = {
        chapter,
        verse,
        text: (verseText ?? "").trim()
      };

      result[bookCode][chapter - 1].push(entry);

      currentEntry = entry;
      verseCount++;
    } else {
      // Continuation line
      if (currentEntry) {
        currentEntry.text += " " + line;
        issues.appendedLines++;
      } else {
        issues.unmatchedLines.push({ lineNumber: i, line: raw });
      }
    }
  }

  return { result, verseCount, issues };
}

function buildModsLookup(modsList) {
  const map = new Map();
  for (const v of modsList) {
    const key = `${v.book}:${v.chapter}:${v.verse}`;
    map.set(key, v);
  }
  return map;
}

// -----------------------------
// CHANGE TRACKER
// -----------------------------
function createChangeTracker() {
  const changes = [];

  function track(before, after, context) {
    if (before !== after) {
      changes.push({
              book: context.book,
              chapter: context.chapter,
              verse: context.verse,
              type: context.type,
              version: context.version,
              reason: context.reason,
              before,
              after
            });
    }
    return after;
  }

  return {
    track,
    getChanges: () => changes
  };
}

// -----------------------------
// TRANSFORMS
// -----------------------------
function applyTransformations(text, context, tracker) {
  let result = text;

  result = tracker.track(
    result,
    result.replace(/\b(the LORD GOD|GOD the LORD)\b/g, "Yah\u2014Yaweh himself\u2014"),
    { type: "divine_name1", ...context }
  );

  result = tracker.track(
    result,
    result.replace(/\bTHE LORD\b/g, "YAHWEH"),
    { type: "divine_name2", ...context }
  );

  result = tracker.track(
    result,
    result.replace(/(\b[Tt]he )?\bLORD\b(?! OF LORDS)/g, "Yahweh"),
    { type: "divine_name3", ...context }
  );

  result = tracker.track(
    result,
    result.replace(/(?<!UNKNOWN )\bGOD\b/g, "Yahweh"),
    { type: "divine_name4", ...context }
  );

  result = tracker.track(
    result,
    result.replace(/\s{2,}/g, " "),
    { type: "whitespace", ...context }
  );

  result = tracker.track(
    result,
    result.replace(/\s—\s/g, "—"),
    { type: "emdash_spacing", ...context }
  );

  return result.trim();
}

// -----------------------------
// MAIN
// -----------------------------
async function run() {
  const raw = await fs.readFile(sourceFile, "utf8");

  const { result: parsed, verseCount, issues } = parseBsbTxt(raw);
  const tracker = createChangeTracker();

  // LOAD KJV
  const modsRaw = await fs.readFile(modsFile, "utf8");
  const modsList = JSON.parse(modsRaw);

  const modsLookup = new Map();
  for (const m of modsList) {
    const key = `${m.book}:${m.chapter}:${m.verse}`;
    modsLookup.set(key, m);
  }

  let modsInserted = 0;

  const transformed = {};

  for (const [bookCode, chapters] of Object.entries(parsed)) {
    transformed[bookCode] = chapters.map((chapterEntries, chapterIndex) => {
      const chapterNumber = chapterIndex + 1;

      // Map existing BSB verses
      const existing = new Map();
      for (const entry of chapterEntries) {
        existing.set(entry.verse, entry);
      }

      // Collect all verse numbers (BSB + KJV)
      const verseNumbers = new Set();

      for (const entry of chapterEntries) {
        verseNumbers.add(entry.verse);
      }

      for (const [key, value] of modsLookup.entries()) {
        const [b, c, v] = key.split(":");
        if (b === bookCode && Number(c) === chapterNumber) {
          verseNumbers.add(Number(v));
        }
      }

      // Sort verses
      const sorted = [...verseNumbers].sort((a, b) => a - b);

      return sorted.map((verseNum) => {
        const context = {
          book: bookCode,
          chapter: chapterNumber,
          verse: verseNum
        };

        const existingEntry = existing.get(verseNum);

        const key = `${bookCode}:${chapterNumber}:${verseNum}`;
        const modsEntry = modsLookup.get(key);

        // CASE 1: MOD OVERRIDE or INSERT
        if (modsEntry) {
          const before = existingEntry ? existingEntry.text : "";

          const after = tracker.track(
            before,
            modsEntry.text,
            {
              type: existingEntry ? "override" : "insert",
              version: modsEntry.version,
              reason: modsEntry.reason,
              ...context
            }
          );

          if (!existingEntry) {
            modsInserted++;
          }

          return {
            chapter: chapterNumber,
            verse: verseNum,
            text: after,
            version: modsEntry.version
          };
        }

        // CASE 2: NORMAL BSB. A text-less placeholder that mods.json does not
        // supply is dropped rather than emitted as an empty verse.
        if (existingEntry && existingEntry.text) {
          return {
            chapter: chapterNumber,
            verse: verseNum,
            text: applyTransformations(existingEntry.text, context, tracker)
          };
        }

        return null;
      }).filter(Boolean);
    });
  }

  await fs.writeFile(outputFile, JSON.stringify(transformed, null, 2) + "\n");
  await fs.writeFile(changeLogFile, JSON.stringify(tracker.getChanges(), null, 2) + "\n");

  console.log("\n=== SUMMARY ===");
  console.log(`Verses parsed (BSB): ${verseCount}`);
  console.log(`MODS verses inserted: ${modsInserted}`);
  console.log(`Continuation lines appended: ${issues.appendedLines}`);
  console.log(`Unmatched lines: ${issues.unmatchedLines.length}`);
  console.log(`Transformations: ${tracker.getChanges().length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
