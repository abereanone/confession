# Confessions Hub — working notes

Astro web app (`apps/web`) + Expo shell (`apps/mobile`) over a shared corpus of
Reformed confessions and the BSB text.

## Data flow — edit the right copy

`shared/data/confessions/*.json` is the **only** source of truth.

`apps/web/src/data/confessions/` and `apps/mobile/src/data/confessions/` are
generated copies. Never edit them by hand — they are deleted and recopied by
`npm run sync:confessions` (which also runs automatically via `predev:web` /
`prebuild:web`).

## Confession file schema

```jsonc
{
  "slug": "lbcf-1644",
  "shortCode": "1LBCF",              // badge text, keep short
  "title": "First London Baptist Confession of Faith (1644)",
  "unitLabel": "Article",            // or "Chapter"
  "units": [{ "number": 1, "title": "…", "content": ["…", "…"] }]
}
```

Each `content[]` string renders as one paragraph card, labelled
`{unitLabel} {number} - Paragraph {index+1}`.

**Only split a unit into multiple `content[]` entries when the source itself
numbers real paragraphs** (as Westminster, Savoy and the 1689 do — their
`29.3`-style divisions are part of the document). Clauses of a single running
sentence must stay in one string, even when the printed edition breaks them
onto numbered lines; splitting them produces a wall of one-line cards that
reads nothing like the confession. Belgic and the 1644 are stored as one
paragraph per article for exactly this reason.

For those single-paragraph confessions, add the slug to `singleParagraphSlugs`
in `confessions.ts`. `usesParagraphNumbers(slug)` then suppresses the
"Paragraph N" label on the confession page and makes scripture cross-references
link to `#unit-N` instead of `#para-N-M`. Use that helper — do not add new
per-slug checks in the page templates.

## Scripture proof tags

Inline, in the clause they support, **preceded by a space**:

```
…dipping or plunging the whole body under water {{proofs: Act 8:38; Mat 3:16}};
```

The space matters: reader mode deletes the tag and then collapses whitespace
sitting before punctuation, so `word {{…}};` reads back as `word;`. Without the
space you get `word(Act 8:38);` in normal mode.

Book codes are the title-cased three-character values in
`apps/web/src/lib/bible/bookMap.json` (`Jhn`, `Psa`, `Mrk`, `Ezk`, `1Co`, `Jud`…).
Separate references with `; `, verses within a reference with `, `, ranges with `-`.

### Reference gotchas — these silently break the tooltip/autolinker

- **No cross-chapter ranges.** `Isa 52:13-53:12` gets mangled into a bogus
  `Isa 52:13-53`. Split per chapter: `Isa 52:13-15; Isa 53:1-12`.
- **Single-chapter books need the explicit chapter**: `Jud 1:6-7`, `2Jn 1:9-11`.
  The bare form (`Jud 6-7`) only resolves for a *single* verse, because
  `normalizeReference` only prepends `1:` when the whole token is digits.
  (`lbcf-1689` still has a few bare-range entries that don't resolve.)
- **Strip verse-part letters**: `1Co 2:11b` → `1Co 2:11`.
- **Watch versification.** Sources using Hebrew psalm numbering count the
  superscription; e.g. `Ps. 42:6 & 12` is BSB `Psa 42:5, 11`.

### Always validate new proofs against the corpus

`shared/data/bsb.json` is `{ book: [ chapter ][ {chapter, verse, text} ] }` —
a list of 66 books, each a list of chapters, each a list of verse objects.
Walk every reference in a new file and confirm the book/chapter/verse exists
before committing. A bad reference fails silently at runtime.

`scripts/normalize-confession-proofs.mjs` can tidy existing tags, but it will
not catch the four gotchas above.

### Auditing the whole corpus

Worth re-running after any import. Three passes catch three different faults:

1. **Resolvable** — every reference parses and the verse exists in `bsb.json`.
   This catches misnumbering (`Isa 116:2`, `Jhn 7:56`) and Hebrew psalm
   versification (`Psa 62:13` where English has 12 verses).
2. **Linkable** — the reference is written in a form the autolinker matches.
   A verse hidden behind `and`, or behind `ff.,`, links the first verse and
   silently drops the second (`Jhn 10:1 and 7`, `Mat 13:24 ff., 47 ff.`).
3. **Correct** — where a paragraph quotes scripture and then cites it, compare
   the quoted wording against the verse text and flag near-zero overlap. This
   is the only pass that catches a reference that is well-formed, resolvable,
   and simply points at the wrong verse (`Rev 14:8` for "the Lamb slain from
   the foundation of the world", which is `Rev 13:8`).

Expect false positives in pass 3 wherever the confession quotes a translation
other than the BSB, and wherever the citation carries `f.`/`ff.` so the quote
runs past the named verse.

Note that a book-less continuation after a semicolon (`Mat 3:17; 17:5`) is
legal — `continuedVerseRegex` inherits the book from the previous reference.
A bare number after a semicolon (`Heb 11; 6`) is *not* the same thing and is
usually a colon that was corrupted into a semicolon on import.

`, etc.` and a trailing `ff.` are the sources' own shorthand; the named verse
still links, so leave them alone.

## Adding a confession — checklist

1. Write `shared/data/confessions/<slug>.json` in the schema above.
2. `shared/data/confessions/manifest.json` — add the slug (order here drives
   site order) and bump `updatedAt`.
3. `apps/web/src/lib/confessions.ts` — add the JSON import **and** an entry in
   the `confessionsBySlug` array; a slug in the manifest with no import is
   silently dropped.
4. Same file, `getConfessionAbout()` — add a `slug` branch, or the About page
   shows placeholder text. Add to `singleParagraphSlugs` too if it stores one
   paragraph per unit.
5. `apps/web/public/styles/theme.css` — add accent blocks in **both** the dark
   section and the `[data-theme="light"]` section.
6. `npm run sync:confessions`, then `npm run build:web`.

Nothing to wire in `apps/mobile` — it only consumes the synced JSON.

## Accent colors

Each confession gets `--confession-accent-border` / `-bg` / `-text`, keyed on
`[data-confession="<slug>"]`. Pick a hue that stays distinguishable from its
neighbours; current spacing:

| slug | hue |
| --- | --- |
| savoy-declaration | ~10° salmon |
| lbcf-1644 | ~28° amber |
| lbcf-1689 | ~43° gold |
| canons-of-dordt | ~139° green |
| belgic-confession | ~174° teal |
| westminster-confession | ~212° blue |
| second-helvetic-confession | ~261° violet |

Dark uses a light tinted `-text`; light uses a dark `-text` and slightly lower
alphas.
