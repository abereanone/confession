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

## Corpus editions — keep them consistent

Westminster, Savoy and the 1689 are all held in their **traditional wording**:
`calleth`/`justifieth`, `hath`, `doth`, `shew`, British spellings (`honour`,
`endeavour`, `pretence`), and lowercase divine pronouns. Chapter titles are
sentence case (`Of the Holy Scriptures`, not `Of The Holy Scriptures`).

This matters beyond taste. The comparison view diffs these three against each
other word by word, so a modernized document lights up on every `calleth` and
buries the places where the doctrine actually changed. The 1689 arrived
lightly modernized and was converted back in August 2026; if a future import
reintroduces `has`/`does`/`calls`, the comparison degrades quietly.

Westminster is the **original 1646** text, not the 1788 American revision.
Do not "fix" it against the OPC or other American editions: they rewrite
chapter 23 on the civil magistrate, drop "that antichrist, that man of sin"
from 25.6, cut the synods chapter from five paragraphs to four, and remove the
kindred clause from 24.4. Savoy and the 1689 derive from the original, so
swapping it in would break every alignment that depends on it.

### Verifying text against an outside edition

Fetch the reference with `curl` and diff it locally. Do not use a
summarizing fetch tool — it paraphrases, which is useless for text comparison.
Compare on *folded* words (archaic/modern forms treated as equal) so edition
spelling does not drown real differences, and treat any online edition as
evidence rather than authority. Ones already checked:

| Document | Reference | Caveats found in the *reference* |
| --- | --- | --- |
| 1689 | reformedreader.org, per chapter | ch3 page truncated (3.6, 3.7 missing); typos `justifis`, `Solomen`, `righeousness`; drops words in 10.2 and 11.1 |
| WCF | opc.org/wcf.html | It is the 1788 American revision — expect ~14 legitimate divergences |
| Savoy | grace.org.uk, tfcchurch.co.uk | Both share the typo `consanguity`, so they likely descend from one transcription and are not independent witnesses |

The strongest internal check is cross-document: where the three confessions
share a paragraph, a reading present in two of them and absent from the third
is usually an error in the third. That is how Savoy 18.2 was caught carrying
Westminster's text verbatim, and how WCF 32.1 was found missing its closing
sentence.

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
Two lookalikes are not:

- **The seed must be a full `Book chapter:verse`.** After a chapter-only ref
  the continuation has no book to inherit, so `Rom 1; 11:7-8` links `Rom 1`
  and drops `11:7-8` entirely. Write the book out: `Rom 11:7-8`.
- **A bare number after a semicolon** (`Heb 11; 6`) is usually a colon that was
  corrupted into a semicolon on import, not a continuation at all.

Where a 1689 or Savoy citation looks mangled, check the parallel paragraph in
`westminster-confession.json` — they share proof texts, and Westminster's copy
is generally intact. That is how `Psa 1; 21` was identified as `Psa 50:21`.

### When the BSB reading does not carry the citation

The confessions cite the text their authors had. Where the BSB reading differs
enough that the citation stops making its point, override the displayed text in
`shared/data/bible-cited.json` rather than editing the confession or `bsb.json`.
Keys are normalized references — lowercase, canonical 3-letter book code
(`"1jn 5:7"`) — and the `version` label shows the reader where the wording came
from. The loader reads `shared/data/` directly, so no sync step is needed.

Most of the verses modern critical texts omit (Mat 17:21, Act 8:37, Mrk 9:44 …)
already carry KJV text inside `bsb.json`. The case that slips through is a verse
that *exists* in BSB but reads differently: `1 John 5:7` is "For there are three
that testify:" in BSB, which is useless to the four confessions that cite it as
a Trinity proof — Belgic 9 even quotes the Johannine Comma verbatim in its prose.
That one is overridden to the KJV reading.

Before adding an override, check that the divergence actually matters. `1Ti 3:16`
("He appeared in the flesh" vs "God was manifest in the flesh") looks like a
candidate but the 1644 cites it for Christ's *manhood*, which the BSB reading
states perfectly well. Same for `Rev 22:19`, `Rom 8:1` and `Jhn 1:18`.

### Chapter-only citations

A citation naming only a chapter is usually deliberate — the confession is
pointing at a whole argument (`Job 38-41`, `Rev 2-3`, `Psa 88`, `Heb 8-10`).
Leave those. It is only worth pinning to a verse when the paragraph **quotes**
scripture and then cites the chapter, because there the reader wants the line
that was quoted. Verify against the source edition before changing one:
2HC 16.12's odd-looking `Isa 4` is exactly what Cochrane's translation prints.

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
