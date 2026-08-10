import {
  getConfessionDisplayUnits,
  listConfessions,
  usesParagraphNumbers,
} from "../lib/confessions";

export const prerender = true;

const proofTagPattern = /\{\{proofs:\s*([^}]+?)\s*\}\}/gi;

/**
 * The same text a confession page shows in study mode, so a search for
 * "Act 8:38" finds the paragraph that cites it, exactly as the per-confession
 * filter does.
 */
function renderParagraph(value: string): string {
  return String(value ?? "").replace(proofTagPattern, "($1)");
}

export async function GET() {
  const paragraphs = listConfessions().flatMap((confession) => {
    const numbered = usesParagraphNumbers(confession.slug);

    return getConfessionDisplayUnits(confession).flatMap((unit) =>
      unit.content.map((paragraph, index) => {
        // Single-paragraph confessions anchor to the unit; see usesParagraphNumbers.
        const anchor = numbered ? `para-${unit.number}-${index + 1}` : `unit-${unit.number}`;
        const citation = `${confession.unitLabel} ${unit.number}${
          numbered ? `, Paragraph ${index + 1}` : ""
        }`;

        return {
          slug: confession.slug,
          shortCode: confession.shortCode,
          confession: confession.title,
          citation,
          unitTitle: unit.title,
          href: `/confessions/${confession.slug}#${anchor}`,
          text: renderParagraph(paragraph),
        };
      })
    );
  });

  return new Response(JSON.stringify({ paragraphs }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
