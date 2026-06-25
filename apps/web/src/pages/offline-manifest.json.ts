import type { APIRoute } from "astro";
import { listBibleBooks } from "../lib/bible/bibleData";
import { listConfessions } from "../lib/confessions";

// Lists the pages each offline-download group should cache. Kept small (URLs only)
// so the client can fetch it cheaply before bulk-caching via the Cache API.
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

  const confessions: string[] = ["/confessions"];
  for (const confession of listConfessions()) {
    confessions.push(`/confessions/${confession.slug}`);
    confessions.push(`/confessions/${confession.slug}/about`);
  }

  return new Response(JSON.stringify({ confessions, bibleOt, bibleNt }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=3600",
    },
  });
};
