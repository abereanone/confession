# Linking catechism questions to confession paragraphs

Working plan for cross-linking **catechize.ing** (`c:\code\catechize.ing`) and
**confess.catechize.ing** (`c:\code\confession`). Written 2026-08-14, after a
measured probe rather than a guess — the numbers below are real.

Open `c:\code` rather than either repo alone: the work spans both.

## Scope

**Task 1** — Baptist Catechism ⇄ 1689 Confession.
**Task 2** — catechism question ⇄ question, improving the existing
`relatedAnswers` frontmatter field.

## Decisions already made

| Question | Decision |
| --- | --- |
| Granularity | Link to a **paragraph**; where the signal genuinely ties, link both |
| When the 1689 is silent | Say so, and point at the Westminster paragraph that covers it, via the alignment spine |
| Ownership | **This repo** owns the mapping and publishes a JSON that catechize.ing reads at build |
| Direction and volume | Both directions, up to 3 links each, ranked |

## The data on both sides

**catechize.ing** — `src/content/questions/<slug>.md`, one file per question:

```markdown
---
id: 36
title: What is justification?
slug: bc-36
categories: [bc]
relatedAnswers: [wlc-70, wsc-33]
---

Justification is an act of God's free grace, wherein he pardoneth all our sins…

## Proofs
- Justification is an act of God's free grace… (Romans 3:24–25; 4:6–8)
- and accepteth us as righteous in his sight, (2 Corinthians 5:19, 21)

<!-- LONG_ANSWER -->
## Additional Exposition
…Beddome, with many more citations…
```

Counts: bc 118, wsc 107, wlc 196, hc 129, aoc 152, gc 373 — **1,075 questions**.

**Trap, already hit once:** only the `## Proofs` block holds the catechism's own
citations. Everything after `<!-- LONG_ANSWER -->` is commentary. Scraping the
rendered page swallows both and roughly quadruples the reference count for
bc-36, dragging matches toward whatever the expositor happened to quote. Parse
the markdown, split on `<!-- LONG_ANSWER -->`, and take only what follows
`## Proofs`.

**confession** — `shared/data/confessions/*.json`, with inline
`{{proofs: Rom 3:24; 8:30}}` tags. Coverage: WCF 582 tags, 1689 497, 1644 383,
Belgic 313, 2HC 280, **Dordt 13, Savoy 0**.

Savoy and Dordt cannot take part in proof-based matching. Savoy has a way round
it: `shared/data/comparison/alignment.json` already maps Savoy to Westminster,
so route catechism → WCF → Savoy transitively.

## Why proof overlap is the right primary signal

Catechisms are Q&A, confessions are declarative prose; they argue the same
doctrine in almost entirely different words, so text similarity is weak between
them. But both cite scripture at clause level, and two statements defending the
same doctrine reach for the same verses.

Measured, whole Baptist Catechism against the 1689, using clean proofs:

| Outcome | Count |
| --- | --- |
| Confident (≥30% coverage, ≥15pt margin over runner-up) | 36 |
| Weak (matched, but low coverage or ambiguous) | 54 |
| No shared proof texts at all | 28 |

The confident third is genuinely right — spot-checked: bc-4 "What is the word of
God?" → 1689 1.1 at 100%; bc-8 "Are there more gods than one?" → 2.1; bc-9 "How
many persons are there in the Godhead?" → 2.3; bc-24 "Who is the Redeemer?" →
8.2; bc-36 "What is justification?" → 11.1 at 67% with a 42pt margin.

**So proof overlap alone is not enough.** Two-thirds need help.

### Judge the tool on the right cohort

39% of the Baptist Catechism — 48 of 118 questions — expounds the Ten
Commandments one at a time (bc-46 to bc-87) and the Lord's Prayer petition by
petition (bc-108 to bc-113). The 1689 does neither. Those questions have no
confession counterpart to find, and that is not a defect in either document.

Split the same run by cohort:

| Cohort | Confident | Weak | No match |
| --- | --- | --- | --- |
| Expounds a confession topic (70) | 29 (41%) | 35 (50%) | **6 (9%)** |
| Decalogue / Lord's Prayer (48) | 7 (15%) | 19 (40%) | **22 (46%)** |

A 9% no-match rate where a counterpart should exist against 46% where it should
not is the signal behaving correctly. Measuring the tool against the whole 118
would be measuring it on a corpus where two fifths of the questions have no
right answer.

Do **not** hardcode "bc-46 to bc-87 never match". Seven of those scored
confident, and legitimately: bc-46 "Where is the moral law summarily
comprehended?" belongs against chapter 19, and the fourth-commandment questions
against chapter 22 on the Sabbath. Let the scorer decide, and treat "no
counterpart" as a first-class result rather than a failure to tune away.

The six no-match cases inside the core cohort are the ones worth inspecting —
those are candidate tool failures rather than genuine gaps.

### The second signal: monotonic sequence alignment

Both documents run in roughly the same doctrinal order — God, decrees, creation,
providence, fall, Christ, salvation, church, last things. That makes this the
same problem as the confession-to-confession paragraph alignment already solved
in `scripts/draft-comparison-alignment.mjs`: a global alignment where proof
overlap is the similarity function and monotonic ordering does the rest.

It should resolve exactly the failures seen. bc-13 "How did God create man?"
ties 1689 4.2 and 4.3 at 40% each on proofs alone — but bc-12 lands on 4.1 and
bc-15 on 4.3, so sequence context breaks the tie.

Reuse the Needleman–Wunsch implementation already in that script.

### Expect genuine absences, and treat them as findings

bc-96 "How do baptism and the Lord's supper become effectual means of
salvation?" scores nothing above 17% against the 1689 — correctly. It asks about
sacramental *efficacy*, and the 1689 dropped Westminster's paragraph on it. The
alignment spine already records this as a real gap (`sacraments-3`), and letting
the search see Westminster finds **WCF 27.3** at 33%: the exact paragraph.

A "no counterpart in the 1689, but Westminster 27.3 covers it" result is the
most interesting output the tool can produce — it marks where the Baptists
departed. Do not tune it away.

### One systematic skew

Keach's Baptist Catechism inherits the **Westminster Shorter Catechism's** proof
selections, so BC citations track *Westminster's* more closely than the 1689's.
bc-36 scores 74% against WCF 11.1 but 67% against 1689 11.1. Rank **within** the
1689 and use relative margins; absolute thresholds tuned on WCF will mislead.

## Task 1 steps

1. `scripts/draft-catechism-links.mjs` — read the catechism markdown, parse the
   `## Proofs` block only, score against 1689 paragraphs by verse overlap, then
   run the monotonic alignment pass. Emit a draft with coverage, margin and a
   confidence, in the shape of `alignment.draft.json`.
2. `shared/data/catechism/bc-1689.json` — the curated mapping. Same
   machine-drafts / human-confirms discipline as the alignment spine: rows carry
   `confidence` and `decision`.
3. Extend `scripts/sync-shared-data.mjs` to copy it web-side.
4. A review page at `/compare/review`-style, listing only medium and low
   confidence rows with the question and candidate paragraphs side by side.
5. Confession side: on each 1689 paragraph, list the questions that map to it.
6. Publish `/catechism-links.json` from this site for catechize.ing to read at
   build, and add the reverse links there.

Ship BC⇄1689 end to end before extending to the other five catechisms.

## Task 2 — question ⇄ question

Different problem, and an easier one. `relatedAnswers` already exists in the
frontmatter (bc-36 → wlc-70, wsc-33), so this is improving an existing field.

Catechisms share Q&A form and often direct textual descent — Keach's BC adapts
the WSC, An Orthodox Catechism adapts the Heidelberg — so **text similarity
works here**, unlike catechism-to-confession. Combine it with proof overlap:

- near-duplicates (bc-36 / wsc-33 are almost word for word) fall out of text
  similarity alone
- the interesting pairs are across traditions, where the Heidelberg's thematic
  order diverges from the Westminster's — there, proof overlap carries more

The Dice and LCS helpers in `apps/web/src/lib/compare/` apply directly.

Scale: 1,075 questions. All-pairs is 577k comparisons — fine at build time, but
restrict to cross-catechism pairs and cap suggestions per question.

## Verification habit

The same rule as the corpus work in `CLAUDE.md`: machine drafts, human confirms,
and the reasoning gets recorded on the row so a later session does not
re-litigate it. Reference expansion must handle the gotchas already documented
there — no cross-chapter ranges, book-less continuations after a semicolon
(`Romans 3:24–25; 4:6–8` inherits Romans), verse-part letters.
