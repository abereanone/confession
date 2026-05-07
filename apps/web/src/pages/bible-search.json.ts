import { getBibleProviderName, getBibleSearchIndex } from "../lib/bible/bibleData";

export const prerender = true;

export async function GET() {
  const [provider, verses] = await Promise.all([
    getBibleProviderName(),
    getBibleSearchIndex(),
  ]);

  return new Response(
    JSON.stringify({
      provider,
      verses,
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
