// Drafts the question -> paragraph mapping between a catechism (catechize.ing)
// and the 1689 Baptist Confession.
//
//   node ./scripts/draft-catechism-links.mjs                  # write the draft
//   node ./scripts/draft-catechism-links.mjs --report         # print it, write nothing
//   node ./scripts/draft-catechism-links.mjs --catechism=../catechize.ing
//   node ./scripts/draft-catechism-links.mjs --prefix=wsc     # a different catechism
//
// Output: shared/data/catechism/<prefix>-1689.draft.json
//
// The draft is NOT the source of truth. Review it, fix the rows it flags, and
// save the result as <prefix>-1689.json — that curated file is what the site
// reads. Same discipline as the comparison spine: machine drafts, human
// confirms, and the reasoning goes on the row so a later session does not
// re-litigate it.
//
// Why proof overlap rather than text similarity: catechisms are Q&A and
// confessions are declarative prose, so the two argue the same doctrine in
// almost entirely different words. But both cite scripture at clause level, and
// two statements defending the same doctrine reach for the same verses. Proof
// overlap alone settles about a third of the Baptist Catechism outright; the
// monotonic alignment pass below is what rescues most of the rest.
//
// Three results are all first-class, and the third is the most interesting one:
//   - a paragraph in the 1689 that the question expounds
//   - no counterpart, because the question expounds the Decalogue or the Lord's
//     Prayer and the 1689 does neither
//   - no counterpart in the 1689, but Westminster covers it — which marks a
//     place where the Baptists departed. Do not tune those away.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const REPORT_ONLY = argv.includes("--report");
const PREFIX = flag("prefix", "");
const catechismRoot = path.resolve(root, flag("catechism", path.join("..", "catechize.ing")));
const questionsDir = path.join(catechismRoot, "src", "content", "questions");
const catechismDir = path.join(root, "shared", "data", "catechism");

// Tuning.
//
// COVERAGE_FLOOR / MARGIN_FLOOR are the "confident" bar from the probe: a third
// of the question's own proof texts landing on one paragraph, and a clear lead
// over the runner-up. TIE_BAND is how close the runner-up has to be before the
// sequence alignment is allowed to break the tie.
//
// MATCH_FLOOR is the alignment's own bar. A pair contributes coverage minus the
// floor and a gap contributes nothing, so the alignment matches a question to a
// paragraph only where the overlap beats the floor, and stays monotonic while
// it does. Raise it to leave more questions unpaired for a human.
// PUBLISH_FLOOR is the bar for showing a link at all. SECONDARY_RATIO decides
// when a runner-up is close enough to the pick to be worth offering as a second
// reading, rather than a weaker guess dressed up as an alternative.
const COVERAGE_FLOOR = 0.3;
const MARGIN_FLOOR = 0.15;
const TIE_BAND = 0.15;
const MATCH_FLOOR = 0.15;
const PUBLISH_FLOOR = 0.2;
const SECONDARY_RATIO = 0.8;
const GAP = 0;
const CANDIDATES = 3;

// Reporting only — this never touches scoring. 39% of the Baptist Catechism
// expounds the Ten Commandments one at a time and the Lord's Prayer petition by
// petition, and the 1689 does neither, so those questions mostly have no
// counterpart to find. Judging the tool on the whole 118 would be measuring it
// against a corpus where two fifths of the questions have no right answer.
//
// Deliberately NOT a "these never match" rule: seven of them scored confident
// and legitimately so — bc-46 on where the moral law is summarily comprehended
// belongs against chapter 19, and the fourth-commandment questions against
// chapter 22 on the Sabbath. The scorer decides; this only splits the report.
const COHORTS = {
  bc: [
    { label: "Decalogue / Lord's Prayer", ranges: [[46, 87], [108, 113]] },
  ],
};

/* ------------------------------------------------------------------ bible -- */

const bsb = JSON.parse(await readFile(path.join(root, "shared", "data", "bsb.json"), "utf8"));
const bookMap = JSON.parse(
  await readFile(path.join(root, "apps", "web", "src", "lib", "bible", "bookMap.json"), "utf8")
);

const SINGLE_CHAPTER = new Set(["oba", "phm", "2jn", "3jn", "jud"]);

function resolveBook(name) {
  const base = name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/^(?:first|1st|i)\s+/, "1 ")
    .replace(/^(?:second|2nd|ii)\s+/, "2 ")
    .replace(/^(?:third|3rd|iii)\s+/, "3 ")
    .replace(/\s+/g, " ")
    .trim();
  return bookMap[base] ?? bookMap[base.replace(/\s+/g, "")];
}

function chapterLength(book, chapter) {
  return bsb[book]?.[chapter - 1]?.length ?? 0;
}

function verseExists(book, chapter, verse) {
  const length = chapterLength(book, chapter);
  return verse >= 1 && verse <= length;
}

/* -------------------------------------------------------------- citations -- */

// A reference is one citation — "Romans 3:24-25" — carrying every verse it
// covers. Scoring counts references, not verses, so a long range and a single
// verse weigh the same. That is what keeps a chapter-wide citation from
// swamping a question that happens to sit next to one, and it is the measure
// the probe's percentages were taken on.

const unresolved = [];

/** Splits "Romans 3:24-25; 4:6-8" into references, inheriting the book after `;`. */
function parseCitation(group, source) {
  const cleaned = group
    .replace(/[‐-―]/g, "-")
    .replace(/’/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || !/\d/.test(cleaned)) return [];

  const refs = [];
  let book;

  for (const rawToken of cleaned.split(";")) {
    const token = rawToken.trim();
    if (!token) continue;

    // "Psalm 110 throughout", "Exodus 8:5ff", "Psalm 92:title" — the sources'
    // own shorthand. Strip the tail; the named chapter or verse still carries.
    const spec = token
      .replace(/\s*\|.*$/, "")
      .replace(/\s*,?\s*&c\.?\s*$/i, "")
      .replace(/\s*\b(?:throughout|following)\b\s*$/i, "")
      .replace(/\s*f{1,2}\.?\s*$/i, "")
      .replace(/:\s*title\s*$/i, "")
      .replace(/^ch\.?\s*/i, "")
      .trim();

    const match = /^((?:[1-3]\s*)?[A-Za-z][A-Za-z' ]*?)?\s*([\d:,\s-]+)$/.exec(spec);
    if (!match) {
      unresolved.push({ source, token, reason: "unparseable" });
      continue;
    }

    const [, bookPart, numbers] = match;
    if (bookPart) {
      const resolved = resolveBook(bookPart);
      if (!resolved) {
        unresolved.push({ source, token, reason: `unknown book "${bookPart.trim()}"` });
        continue;
      }
      book = resolved;
    }
    if (!book) {
      // A continuation with nothing to inherit from, or a bare number that was
      // a colon corrupted on import. Either way it cannot be resolved here.
      unresolved.push({ source, token, reason: "no book to inherit" });
      continue;
    }

    const verses = expandNumbers(book, numbers, source, token);
    if (verses.length) refs.push({ label: token, book, verses });
  }

  return refs;
}

/** Expands "3:24-25, 27" (and chapter-only, cross-chapter and single-chapter forms). */
function expandNumbers(book, numbers, source, token) {
  const single = SINGLE_CHAPTER.has(book);
  const parts = numbers
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const verses = new Set();
  let chapter;

  const addVerse = (ch, verse) => {
    if (verseExists(book, ch, verse)) verses.add(`${book} ${ch}:${verse}`);
    else unresolved.push({ source, token, reason: `${book} ${ch}:${verse} not in the corpus` });
  };
  const addChapter = (ch) => {
    const length = chapterLength(book, ch);
    if (!length) {
      unresolved.push({ source, token, reason: `${book} ${ch} not in the corpus` });
      return;
    }
    for (let verse = 1; verse <= length; verse += 1) verses.add(`${book} ${ch}:${verse}`);
  };

  for (const part of parts) {
    const cross = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(part);
    if (cross) {
      // The site's autolinker cannot render these, but the arithmetic is well
      // defined and matching should not lose a citation over a display limit.
      const [, fromCh, fromV, toCh, toV] = cross.map(Number);
      for (let ch = fromCh; ch <= toCh; ch += 1) {
        const start = ch === fromCh ? fromV : 1;
        const end = ch === toCh ? toV : chapterLength(book, ch);
        for (let verse = start; verse <= end; verse += 1) addVerse(ch, verse);
      }
      chapter = toCh;
      continue;
    }

    const ranged = /^(?:(\d+):)?(\d+)(?:-(\d+))?$/.exec(part);
    if (!ranged) {
      unresolved.push({ source, token, reason: `unparseable part "${part}"` });
      continue;
    }
    const [, chapterPart, from, to] = ranged;

    if (chapterPart) {
      chapter = Number(chapterPart);
      for (let verse = Number(from); verse <= Number(to ?? from); verse += 1) addVerse(chapter, verse);
      continue;
    }

    // No colon. In a single-chapter book ("Jude 5, 7") these are verses; after
    // a chapter:verse part they continue that chapter ("Hebrews 2:14, 17");
    // otherwise the citation names whole chapters ("Job 38-41").
    if (single) {
      chapter = 1;
      for (let verse = Number(from); verse <= Number(to ?? from); verse += 1) addVerse(1, verse);
    } else if (chapter !== undefined) {
      for (let verse = Number(from); verse <= Number(to ?? from); verse += 1) addVerse(chapter, verse);
    } else {
      for (let ch = Number(from); ch <= Number(to ?? from); ch += 1) addChapter(ch);
      chapter = Number(to ?? from);
    }
  }

  return [...verses];
}

/* --------------------------------------------------------------- catechism -- */

const PROOF_HEADING = /^##\s+Proofs\s*$/im;
const LONG_ANSWER = /<!--\s*LONG_ANSWER\s*-->/;

function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, body: raw };

  const data = {};
  let key;
  for (const line of match[1].split(/\r?\n/)) {
    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && key) {
      (data[key] ??= []).push(listItem[1].trim());
      continue;
    }
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    key = pair[1];
    const value = pair[2].trim();
    if (!value) data[key] = [];
    else if (value.startsWith("[")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    } else data[key] = value;
  }
  return { data, body: match[2] };
}

/**
 * Only the `## Proofs` block holds the catechism's own citations. Everything
 * after <!-- LONG_ANSWER --> is a later expositor's commentary — Beddome alone
 * roughly quadruples bc-36's reference count and drags matches toward whatever
 * he happened to quote. Scraping the rendered page swallows both; parse the
 * markdown instead.
 */
function proofsBlock(body) {
  const short = body.split(LONG_ANSWER)[0];
  const heading = PROOF_HEADING.exec(short);
  if (!heading) return "";
  const after = short.slice(heading.index + heading[0].length);
  const next = /^##\s+/m.exec(after);
  return next ? after.slice(0, next.index) : after;
}

/** Every question in the corpus, all catechisms, indexed by slug. */
let allQuestions;

async function readAllQuestions() {
  if (allQuestions) return allQuestions;

  const files = (await readdir(questionsDir)).filter((name) => /^[a-z]+-\d+\.md$/.test(name));
  allQuestions = new Map();

  for (const file of files) {
    const { data, body } = parseFrontmatter(await readFile(path.join(questionsDir, file), "utf8"));
    const slug = data.slug ?? path.basename(file, ".md");
    const refs = [];
    for (const line of proofsBlock(body).split(/\r?\n/)) {
      if (!/^\s*[-*]\s+/.test(line)) continue;
      for (const group of line.matchAll(/\(([^()]*)\)/g)) {
        refs.push(...parseCitation(group[1], slug));
      }
    }
    allQuestions.set(slug, {
      slug,
      prefix: slug.split("-")[0],
      number: Number(data.id ?? /\d+/.exec(file)[0]),
      title: data.title ?? "",
      related: data.relatedAnswers ?? [],
      refs,
    });
  }
  return allQuestions;
}

/**
 * Large stretches of the Shorter Catechism carry no `## Proofs` block at all in
 * catechize.ing — 67 of its 107 questions — which leaves nothing to match on and
 * is a gap in that corpus rather than anything this script can fix.
 *
 * The frontmatter's `relatedAnswers` is the way round it. These catechisms are
 * in direct textual descent (wsc-33 and bc-36 on justification are almost word
 * for word), so a sibling's proof texts are the same proof texts. Borrowing them
 * is recorded on the row, because a link resting on a sibling's citations is
 * weaker evidence than one resting on the question's own.
 */
function borrowProofs(question, byslug) {
  const seen = new Set();
  const refs = [];
  const sources = [];
  for (const slug of question.related) {
    const sibling = byslug.get(slug);
    if (!sibling?.refs.length) continue;
    sources.push(slug);
    for (const ref of sibling.refs) {
      if (seen.has(ref.label)) continue;
      seen.add(ref.label);
      refs.push(ref);
    }
  }
  return { refs, sources };
}

async function readQuestions(prefix) {
  const byslug = await readAllQuestions();
  const questions = [...byslug.values()]
    .filter((question) => question.prefix === prefix)
    .sort((a, b) => a.number - b.number);

  return questions.map((question) => {
    if (question.refs.length) return question;
    const { refs, sources } = borrowProofs(question, byslug);
    return refs.length ? { ...question, refs, borrowedFrom: sources } : question;
  });
}

/* -------------------------------------------------------------- confession -- */

const PROOF_TAG = /\{\{proofs:\s*([^}]+?)\s*\}\}/gi;

async function readConfession(slug) {
  const confession = JSON.parse(
    await readFile(path.join(root, "shared", "data", "confessions", `${slug}.json`), "utf8")
  );
  const paragraphs = [];
  for (const unit of confession.units) {
    unit.content.forEach((raw, index) => {
      const ref = `${unit.number}.${index + 1}`;
      const verses = new Set();
      for (const tag of raw.matchAll(PROOF_TAG)) {
        for (const parsed of parseCitation(tag[1], `${slug} ${ref}`)) {
          for (const verse of parsed.verses) verses.add(verse);
        }
      }
      paragraphs.push({ ref, chapter: unit.number, title: unit.title, verses });
    });
  }
  return { confession, paragraphs };
}

/* ----------------------------------------------------------------- scoring -- */

/** Fraction of the question's own proof references that the paragraph also cites. */
function coverage(question, paragraph) {
  if (!question.refs.length || !paragraph.verses.size) return 0;
  let hits = 0;
  for (const ref of question.refs) {
    if (ref.verses.some((verse) => paragraph.verses.has(verse))) hits += 1;
  }
  return hits / question.refs.length;
}

function scoreAll(questions, paragraphs) {
  return questions.map((question) =>
    Float64Array.from(paragraphs, (paragraph) => coverage(question, paragraph))
  );
}

function rank(scores, paragraphs) {
  return [...scores]
    .map((value, index) => ({ ref: paragraphs[index].ref, coverage: value }))
    .filter((candidate) => candidate.coverage > 0)
    .sort((a, b) => b.coverage - a.coverage || refOrder(a.ref) - refOrder(b.ref));
}

function refOrder(ref) {
  const [chapter, paragraph] = ref.split(".").map(Number);
  return chapter * 1000 + paragraph;
}

/* --------------------------------------------------------------- alignment -- */

/**
 * The second signal: monotonic sequence alignment, with proof overlap as the
 * similarity function. Both documents run in roughly the same doctrinal order —
 * God, decrees, creation, providence, fall, Christ, salvation, church, last
 * things — so ordering is real evidence, and it breaks ties the raw overlap
 * cannot. bc-13 "How did God create man?" ties 1689 4.2 and 4.3 on proofs
 * alone, but bc-12 lands on 4.1 and bc-15 on 4.3, so the sequence settles it.
 *
 * This is the same monotone DP as the Needleman-Wunsch in
 * scripts/draft-comparison-alignment.mjs, with one deliberate difference: it is
 * many-to-one rather than one-to-one. Aligning paragraphs to paragraphs, a
 * one-to-one assignment is right — each paragraph answers at most one. Aligning
 * questions to paragraphs it is not: the 1689 has 160 paragraphs against 118
 * questions, and a catechism routinely spends several consecutive questions on
 * one paragraph (bc-18 to bc-22 all expound chapter 6 on the fall). Forcing
 * one-to-one made the alignment displace correct matches onto their neighbours
 * — bc-36 was pushed off 11.1, which it covers at 67%, onto 11.3.
 *
 *   dp[i][j] = best total over the first i questions, using no paragraph later
 *              than j
 *            = max(dp[i][j-1],                        leave paragraph j unused
 *                  dp[i-1][j] + max(A[i][j], 0))      question i lands on j,
 *                                                     or goes unassigned
 *
 * A pair contributes coverage - MATCH_FLOOR and an unassigned question
 * contributes nothing, so weak pairings lose to leaving the question alone.
 * That matters more here than in the confession-to-confession case: two fifths
 * of this catechism has no counterpart to find, and forcing pairs onto it would
 * be inventing links.
 */
function align(scores, questionCount, paragraphCount) {
  const table = Array.from({ length: questionCount + 1 }, () => new Float64Array(paragraphCount + 1));
  const pairScore = (i, j) => Math.max(scores[i - 1][j - 1] - MATCH_FLOOR, GAP);

  for (let i = 1; i <= questionCount; i += 1) {
    for (let j = 1; j <= paragraphCount; j += 1) {
      table[i][j] = Math.max(table[i][j - 1], table[i - 1][j] + pairScore(i, j));
    }
  }

  // Walking j down before taking an assignment settles ties on the earliest
  // paragraph that reaches the optimum, rather than on wherever the traceback
  // happened to start. Where several paragraphs tie outright the choice is
  // still arbitrary, which is why a tie broken this way is reported as a
  // tie-break and never promoted to high confidence.
  const aligned = new Array(questionCount).fill(null);
  let i = questionCount;
  let j = paragraphCount;
  while (i > 0 && j > 0) {
    if (table[i][j] === table[i][j - 1]) {
      j -= 1;
    } else {
      if (scores[i - 1][j - 1] - MATCH_FLOOR > GAP) aligned[i - 1] = j - 1;
      i -= 1;
    }
  }
  return aligned;
}

/* ------------------------------------------------------------------- spine -- */

/**
 * Where the 1689 says nothing, the curated alignment spine already knows which
 * Westminster paragraph stands in that slot and whether the 1689 dropped it.
 * Routing catechism -> WCF -> spine is how bc-96 on sacramental efficacy finds
 * WCF 27.3: the 1689 has no such paragraph, and the spine records the gap.
 */
async function loadSpine(docId) {
  const spine = JSON.parse(
    await readFile(path.join(root, "shared", "data", "comparison", "alignment.json"), "utf8")
  );
  const byRef = new Map();
  for (const row of spine.rows) {
    for (const ref of row[docId] ?? []) byRef.set(ref, row);
  }
  return byRef;
}

/* ------------------------------------------------------------------- pairs -- */

// Everything catechism-specific lives here. Adding the Heidelberg, An Orthodox
// Catechism or the General Baptist catechism is a matter of adding a row.
//
// `cohorts` is reporting only and never touches scoring: these are the stretches
// that expound the Ten Commandments and the Lord's Prayer, which no confession
// walks through petition by petition, so most of them have no counterpart to
// find. Judged against the whole catechism the tool looks worse than it is.
//
// `fallback` is only meaningful where the alignment spine covers both documents.
const PAIRS = [
  {
    id: "bc-lbcf-1689",
    catechism: { prefix: "bc", label: "The Baptist Catechism", short: "BC" },
    confession: "lbcf-1689",
    fallback: { slug: "westminster-confession", docId: "wcf", target: "lbcf", short: "WCF" },
    cohorts: [{ label: "Decalogue / Lord's Prayer", ranges: [[46, 87], [108, 113]] }],
  },
  {
    id: "wsc-westminster-confession",
    catechism: { prefix: "wsc", label: "Westminster Shorter Catechism", short: "WSC" },
    confession: "westminster-confession",
    cohorts: [{ label: "Decalogue / Lord's Prayer", ranges: [[41, 81], [99, 107]] }],
  },
  {
    id: "wlc-westminster-confession",
    catechism: { prefix: "wlc", label: "Westminster Larger Catechism", short: "WLC" },
    confession: "westminster-confession",
    cohorts: [{ label: "Decalogue / Lord's Prayer", ranges: [[98, 148], [186, 196]] }],
  },
];

/* -------------------------------------------------------------------- main -- */

async function buildPair(pair) {
  const questions = await readQuestions(pair.catechism.prefix);
  if (!questions.length) {
    throw new Error(
      `no ${pair.catechism.prefix}-*.md questions under ${questionsDir} (pass --catechism=<dir>)`
    );
  }

  const { confession, paragraphs } = await readConfession(pair.confession);
  const scores = scoreAll(questions, paragraphs);
  const aligned = align(scores, questions.length, paragraphs.length);

  let fallback;
  if (pair.fallback) {
    const loaded = await readConfession(pair.fallback.slug);
    fallback = {
      ...pair.fallback,
      paragraphs: loaded.paragraphs,
      scores: scoreAll(questions, loaded.paragraphs),
      spine: await loadSpine(pair.fallback.docId),
    };
  }

  const cohortOf = (number) =>
    (pair.cohorts ?? []).find((cohort) =>
      cohort.ranges.some(([from, to]) => number >= from && number <= to)
    )?.label ?? "Expounds a confession topic";

  const rows = questions.map((question, index) =>
    buildRow({ pair, question, index, paragraphs, scores, aligned, fallback, cohortOf })
  );

  return { pair, confession, paragraphs, rows };
}

function buildRow({ pair, question, index, paragraphs, scores, aligned, fallback, cohortOf }) {
  const candidates = rank(scores[index], paragraphs).slice(0, CANDIDATES);
  const alignedRef = aligned[index] === null ? null : paragraphs[aligned[index]].ref;

  const row = {
    id: question.slug,
    n: question.number,
    title: question.title,
    cohort: cohortOf(question.number),
    proofs: question.refs.length,
    links: [],
  };
  if (question.borrowedFrom) row.proofsFrom = question.borrowedFrom;

  if (!question.refs.length) {
    row.confidence = "none";
    row.decision = "The question cites no proof texts, so there is nothing to match on.";
    return row;
  }

  if (!candidates.length) {
    row.confidence = "none";
    row.decision = `No proof text shared with ${confessionShort(pair)}.`;
    addFallback(row, index, fallback, pair, alignedRef);
    return row;
  }

  let best = candidates[0];
  let margin = best.coverage - (candidates[1]?.coverage ?? 0);
  let tieBreak = null;

  // Sequence context may overrule the top candidate only while the two are
  // genuinely close — the gap that matters is between the top candidate and the
  // one the alignment wants, not between the top two. Comparing the wrong pair
  // let a 100% match be traded for a 50% one whenever the runner-up tied.
  if (alignedRef && alignedRef !== best.ref) {
    const swapped = candidates.find((candidate) => candidate.ref === alignedRef);
    if (swapped && best.coverage - swapped.coverage < TIE_BAND) {
      tieBreak = `${best.ref} scored the same on proof texts; the order both documents run in puts the question here.`;
      best = swapped;
      const next = candidates.find((candidate) => candidate.ref !== best.ref);
      margin = best.coverage - (next?.coverage ?? 0);
    }
  }

  const agrees = alignedRef === best.ref;

  // A clear coverage lead stands on its own. Short of that, the alignment
  // agreeing is independent corroboration — but only where the proofs had a
  // preference of their own to corroborate. On an outright tie both signals
  // break toward the earlier paragraph, so they agree by construction.
  //
  // Ties are common because they are cheap: a question citing two proof texts
  // can only score 0, 50 or 100%, so a 15pt margin is not even expressible.
  const decisive = margin >= MARGIN_FLOOR || (agrees && margin > 0 && !tieBreak);
  let confidence =
    best.coverage >= COVERAGE_FLOOR && decisive
      ? "high"
      : best.coverage >= PUBLISH_FLOOR || agrees
        ? "medium"
        : "low";
  // A link resting on a sibling's proof texts never counts as high confidence:
  // the question itself said nothing about which verses it stands on.
  if (question.borrowedFrom && confidence === "high") confidence = "medium";

  // Publish the pick, plus any near-equal runner-up worth offering as a second
  // reading. A question that genuinely straddles two paragraphs should say so.
  // Publish the pick plus any near-equal runner-up. Where a question genuinely
  // straddles two or three paragraphs, saying so is more useful than forcing a
  // single answer — a reader can follow both and judge. PUBLISH_FLOOR keeps the
  // weakest guesses out; everything above it is offered.
  const links = [{ ...best, confidence }];
  for (const candidate of candidates) {
    if (links.length >= CANDIDATES) break;
    if (candidate.ref === best.ref) continue;
    if (candidate.coverage < PUBLISH_FLOOR) continue;
    if (candidate.coverage < best.coverage * SECONDARY_RATIO) continue;
    links.push({ ...candidate, confidence: "medium" });
  }

  row.links = links.map((link) => ({ ref: link.ref, coverage: round(link.coverage) }));
  row.confidence = confidence;
  row.margin = round(margin);
  const borrowed = question.borrowedFrom
    ? ` The question cites no proofs of its own; these come from ${question.borrowedFrom.join(", ")}.`
    : "";
  row.decision =
    tieBreak ??
    (confidence === "high"
      ? `${pct(best.coverage)} of the question's proof texts land on ${best.ref}, ${pct(margin)} clear of the next paragraph.`
      : `${pct(best.coverage)} of the question's proof texts land on ${best.ref}${margin > 0 ? "" : ", tied with the next paragraph"}.`) + borrowed;

  if (confidence !== "high") addFallback(row, index, fallback, pair, alignedRef);
  return row;
}

/**
 * Note where Westminster carries what the 1689 does not. A "no counterpart in
 * the 1689, but WCF 27.3 covers it" result is the most useful thing this script
 * produces — it marks where the Baptists departed — so it is recorded as a
 * finding rather than tuned away.
 */
function addFallback(row, index, fallback, pair, alignedRef) {
  if (!fallback) return;
  const best = rank(fallback.scores[index], fallback.paragraphs)[0];
  if (!best || best.coverage < COVERAGE_FLOOR) return;

  const spineRow = fallback.spine.get(best.ref);
  row.elsewhere = {
    doc: fallback.docId,
    short: fallback.short,
    refs: [best.ref],
    coverage: round(best.coverage),
  };
  if (!spineRow) return;

  if (!spineRow[fallback.target]?.length) {
    row.elsewhere.gap = spineRow.id;
    // The spine says the 1689 has nothing in this slot, so a weak direct hit is
    // usually noise — bc-96 on sacramental efficacy was landing on 2.3, in the
    // chapter on the Trinity, at 20%.
    //
    // Unless the sequence alignment picked the same paragraph. Two independent
    // signals agreeing outweighs the spine's evidence of a gap, and dropping
    // those cost real links: bc-104 on worthy receiving of the Lord's supper
    // was losing 30.5 and 30.8 — chapter 30 being Of the Lord's Supper.
    const corroborated = row.links.length > 0 && row.links[0].ref === alignedRef;
    if (!corroborated) {
      if (row.links.length) row.rejected = row.links.map((link) => link.ref);
      row.links = [];
      row.confidence = "none";
    }
    row.decision = `${confessionShort(pair)} has no paragraph here — the spine records the gap as ${spineRow.id} — but ${fallback.short} ${best.ref} covers it at ${pct(best.coverage)}.`;
  } else if (!row.links.length) {
    // Keach's catechism inherits the Shorter Catechism's proof selections, so
    // its citations track Westminster's more closely than the 1689's. Where the
    // direct search found nothing, the spine can still route the question home.
    row.links = spineRow[fallback.target].map((ref) => ({ ref, coverage: null }));
    row.confidence = "medium";
    row.decision = `No direct overlap, but ${fallback.short} ${best.ref} matches at ${pct(best.coverage)} and the spine puts ${spineRow[fallback.target].join(", ")} opposite it (${spineRow.id}).`;
  }
}

function confessionShort(pair) {
  return pair.confession === "lbcf-1689" ? "The 1689" : "The confession";
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

/* ------------------------------------------------------------------ output -- */

const selected = PAIRS.filter((pair) => !PREFIX || pair.catechism.prefix === PREFIX);
if (!selected.length) throw new Error(`no pair for --prefix=${PREFIX}`);

const manifest = [];

for (const pair of selected) {
  const { confession, paragraphs, rows } = await buildPair(pair);

  const linked = rows.filter((row) => row.links.length).length;
  const byConfidence = rows.reduce(
    (acc, row) => ({ ...acc, [row.confidence]: (acc[row.confidence] ?? 0) + 1 }),
    {}
  );

  const mapping = {
    $comment:
      "Generated by scripts/draft-catechism-links.mjs. Every row carries `confidence` and `decision`. Correct a row by editing it here; re-running the script overwrites the file, so record anything worth keeping in the plan doc too.",
    generatedAt: new Date().toISOString().slice(0, 10),
    id: pair.id,
    catechism: pair.catechism,
    confession: { slug: confession.slug, title: confession.title, unitLabel: confession.unitLabel },
    rows,
  };

  console.log(pair.id);
  console.log(
    `  ${rows.length} questions, ${linked} linked (${Math.round((linked / rows.length) * 100)}%)`,
    byConfidence
  );
  for (const cohort of [...new Set(rows.map((row) => row.cohort))]) {
    const inCohort = rows.filter((row) => row.cohort === cohort);
    const hit = inCohort.filter((row) => row.links.length).length;
    console.log(
      `    ${cohort.padEnd(28)} ${String(inCohort.length).padStart(3)}  linked ${String(hit).padStart(3)}  (${Math.round((hit / inCohort.length) * 100)}%)`
    );
  }
  const gaps = rows.filter((row) => row.elsewhere?.gap);
  if (gaps.length) console.log(`    gaps covered by ${pair.fallback.short}: ${gaps.length}`);

  manifest.push({
    id: pair.id,
    catechism: pair.catechism,
    confession: confession.slug,
    questions: rows.length,
    linked,
    paragraphs: paragraphs.length,
  });

  if (!REPORT_ONLY) {
    await mkdir(catechismDir, { recursive: true });
    await writeFile(
      path.join(catechismDir, `${pair.id}.json`),
      `${JSON.stringify(mapping, null, 2)}\n`,
      "utf8"
    );
  }
}

if (unresolved.length) {
  const shown = new Map();
  for (const entry of unresolved) shown.set(`${entry.source} ${entry.token} ${entry.reason}`, entry);
  console.log(`\nunresolved citations: ${shown.size}`);
  for (const entry of shown.values()) {
    console.log(`  ${entry.source.padEnd(18)} ${entry.token.padEnd(24)} ${entry.reason}`);
  }
}

if (!REPORT_ONLY) {
  await writeFile(
    path.join(catechismDir, "manifest.json"),
    `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), mappings: manifest }, null, 2)}\n`,
    "utf8"
  );
  console.log(`\nwrote ${manifest.length + 1} files to ${path.relative(root, catechismDir)}`);
}
