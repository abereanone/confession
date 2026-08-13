import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { getBibleSearchIndex, listBibleBooks } from "../lib/bible/bibleData";
import { listConfessions } from "../lib/confessions";

const fingerprint = (value: string): string =>
  createHash("sha1").update(value).digest("hex").slice(0, 16);

// Lists the pages each offline-download group should cache, plus a content
// fingerprint per group so the client can tell when a saved copy is out of date.
export const GET: APIRoute = async () => {
  const books = await listBibleBooks();
  const bibleOt: string[] = [];
  const bibleNt: string[] = [];
  for (const book of books) {
    const target = book.testament === "nt" ? bibleNt : bibleOt;
    for (let chapter = 1; chapter <= book.chapterCount; chapter += 1) {
      target.push(`/bible/${book.code}/${chapter}`);
    }
  }

  // The list page is the site root now, so it is already in the app shell.
  const confessions: string[] = [];
  for (const confession of listConfessions()) {
    confessions.push(`/confessions/${confession.slug}`);
    confessions.push(`/confessions/${confession.slug}/about`);
  }

  // Fingerprint from the underlying content so any text/reference edit changes it.
  const searchIndex = await getBibleSearchIndex();
  const otParts: string[] = [];
  const ntParts: string[] = [];
  for (const verse of searchIndex) {
    (verse.testament === "nt" ? ntParts : otParts).push(`${verse.reference}\t${verse.text}`);
  }

  const versions = {
    confessions: fingerprint(JSON.stringify(listConfessions())),
    bibleOt: fingerprint(otParts.join("\n")),
    bibleNt: fingerprint(ntParts.join("\n")),
  };

  return new Response(JSON.stringify({ confessions, bibleOt, bibleNt, versions }), {
    headers: {
      "content-type": "application/json",
      // Always revalidate so the update check sees fresh fingerprints.
      "cache-control": "no-cache",
    },
  });
};
