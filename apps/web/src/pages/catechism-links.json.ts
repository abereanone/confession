import { findConfession, usesParagraphNumbers } from "../lib/confessions";
import { listMappings } from "../lib/catechism";

export const prerender = true;

const SITE = "https://confess.catechize.ing";

/**
 * The mapping, published for catechize.ing to read at build time and render the
 * reverse links on each question page.
 *
 * This repo owns the mapping, so the feed carries everything a consumer needs to
 * render a link without holding a copy of the confessions: the paragraph
 * reference, its title, a resolved URL, and the confidence. Consumers should
 * respect `confidence` — a medium link is a suggestion and should not be
 * presented as though the confession claimed it.
 */
export async function GET() {
  const mappings = listMappings().map((mapping) => {
    const confession = findConfession(mapping.confession.slug);
    const numbered = usesParagraphNumbers(mapping.confession.slug);

    const paragraphUrl = (ref: string) => {
      const [unit, paragraph] = ref.split(".");
      const anchor = numbered ? `para-${unit}-${paragraph}` : `unit-${unit}`;
      return `${SITE}/confessions/${mapping.confession.slug}/#${anchor}`;
    };

    const chapterTitle = (ref: string) =>
      confession?.units.find((unit) => unit.number === Number(ref.split(".")[0]))?.title ?? "";

    return {
      id: mapping.id,
      catechism: mapping.catechism,
      confession: {
        slug: mapping.confession.slug,
        title: mapping.confession.title,
        unitLabel: mapping.confession.unitLabel,
        url: `${SITE}/confessions/${mapping.confession.slug}/`,
      },
      questions: mapping.rows
        .filter((row) => row.links.length > 0)
        .map((row) => ({
          question: row.id,
          n: row.n,
          confidence: row.confidence,
          decision: row.decision,
          links: row.links.map((link) => ({
            ref: link.ref,
            citation: `${mapping.confession.unitLabel} ${link.ref.split(".")[0]}${
              numbered ? `, Paragraph ${link.ref.split(".")[1]}` : ""
            }`,
            title: chapterTitle(link.ref),
            coverage: link.coverage,
            url: paragraphUrl(link.ref),
          })),
        })),
      /** Questions this confession has no paragraph for, with the one that does. */
      elsewhere: mapping.rows
        .filter((row) => row.elsewhere?.gap)
        .map((row) => ({
          question: row.id,
          n: row.n,
          doc: row.elsewhere?.short,
          refs: row.elsewhere?.refs,
          note: row.decision,
        })),
    };
  });

  return new Response(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString().slice(0, 10),
        source: SITE,
        license: `${SITE}/copyright/`,
        mappings,
      },
      null,
      2
    ),
    { headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
}
