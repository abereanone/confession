import { promises as fs } from "node:fs";

const bible = JSON.parse(await fs.readFile("./bsb.json", "utf8"));

const gaps = [];

for (const [bookCode, chapters] of Object.entries(bible)) {
  chapters.forEach((chapterEntries, chapterIndex) => {
    if (!Array.isArray(chapterEntries)) return;

    const chapterNumber = chapterIndex + 1;

    // Get all verse numbers present
    const verses = chapterEntries
      .map(v => v.verse)
      .filter(v => typeof v === "number")
      .sort((a, b) => a - b);

    for (let i = 0; i < verses.length - 1; i++) {
      const current = verses[i];
      const next = verses[i + 1];

      if (next !== current + 1) {
        for (let missing = current + 1; missing < next; missing++) {
          gaps.push(`${bookCode} ${chapterNumber}:${missing}`);
        }
      }
    }
  });
}

console.log(`\nMissing verses (${gaps.length}):\n`);
gaps.slice(0, 50).forEach(g => console.log(g));

if (gaps.length > 50) {
  console.log(`...and ${gaps.length - 50} more`);
}