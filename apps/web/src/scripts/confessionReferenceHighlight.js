import { normalizeReference } from "../lib/bible/normalizeRef";
import { isSingleChapterBook } from "../lib/scriptureRanges";

function normalizeLookupKey(reference) {
  return normalizeReference(reference || "")
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[;,]\s*$/g, "")
    .trim();
}

function parseReferenceRange(reference) {
  const normalized = normalizeLookupKey(reference);
  const match =
    normalized.match(/^([1-3]?[a-z]{2,3})\s+(\d+):(\d+)(?:-(\d+))?$/i) ??
    normalized.match(/^([1-3]?[a-z]{2,3})\s+(\d+)(?:-(\d+))?$/i);
  if (!match) {
    return null;
  }

  const bookCode = String(match[1] || "");
  const isBareSingleChapterReference = !String(match[0] || "").includes(":");
  if (isBareSingleChapterReference && !isSingleChapterBook(bookCode)) {
    return null;
  }

  const chapter = isBareSingleChapterReference ? 1 : Number.parseInt(String(match[2] || ""), 10);
  const verseStart = Number.parseInt(
    isBareSingleChapterReference ? String(match[2] || "") : String(match[3] || ""),
    10
  );
  const verseEnd = Number.parseInt(
    isBareSingleChapterReference
      ? String(match[3] || match[2] || "")
      : String(match[4] || match[3] || ""),
    10
  );
  if (
    !bookCode ||
    !Number.isFinite(chapter) ||
    !Number.isFinite(verseStart) ||
    !Number.isFinite(verseEnd) ||
    chapter < 1 ||
    verseStart < 1 ||
    verseEnd < verseStart
  ) {
    return null;
  }

  return {
    key: normalized,
    bookCode,
    chapter,
    verseStart,
    verseEnd,
  };
}

function parseChapterReference(reference) {
  const normalized = normalizeLookupKey(reference);
  const match = normalized.match(/^([1-3]?[a-z]{2,3})\s+(\d+)(?:-(\d+))?$/i);
  if (!match) {
    return null;
  }

  const bookCode = String(match[1] || "");
  if (isSingleChapterBook(bookCode)) {
    return null;
  }

  const chapter = Number.parseInt(String(match[2] || ""), 10);
  const chapterEnd = Number.parseInt(String(match[3] || match[2] || ""), 10);
  if (
    !bookCode ||
    !Number.isFinite(chapter) ||
    !Number.isFinite(chapterEnd) ||
    chapter < 1 ||
    chapterEnd < chapter
  ) {
    return null;
  }

  return { bookCode, chapter, chapterEnd };
}

function rangesOverlap(left, right) {
  return (
    left.bookCode === right.bookCode &&
    left.chapter === right.chapter &&
    left.verseStart <= right.verseEnd &&
    right.verseStart <= left.verseEnd
  );
}

function referencesMatch(targetReference, candidateReference) {
  const targetKey = normalizeLookupKey(targetReference);
  const candidateKey = normalizeLookupKey(candidateReference);
  if (!targetKey || !candidateKey) {
    return false;
  }

  if (targetKey === candidateKey) {
    return true;
  }

  const targetChapter = parseChapterReference(targetKey);
  const candidateChapter = parseChapterReference(candidateKey);
  const targetRange = parseReferenceRange(targetKey);
  const candidateRange = parseReferenceRange(candidateKey);

  if (targetRange && candidateRange) {
    return rangesOverlap(targetRange, candidateRange);
  }

  if (targetChapter && candidateRange) {
    return (
      targetChapter.bookCode === candidateRange.bookCode &&
      targetChapter.chapter <= candidateRange.chapter &&
      candidateRange.chapter <= targetChapter.chapterEnd
    );
  }

  if (candidateChapter && targetRange) {
    return (
      candidateChapter.bookCode === targetRange.bookCode &&
      candidateChapter.chapter <= targetRange.chapter &&
      targetRange.chapter <= candidateChapter.chapterEnd
    );
  }

  if (targetChapter && candidateChapter) {
    return (
      targetChapter.bookCode === candidateChapter.bookCode &&
      targetChapter.chapter <= candidateChapter.chapterEnd &&
      candidateChapter.chapter <= targetChapter.chapterEnd
    );
  }

  return false;
}

function scrollToTarget(target) {
  const header = document.querySelector(".top");
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  const targetTop = window.scrollY + target.getBoundingClientRect().top - headerHeight - 32;

  window.scrollTo({
    top: Math.max(targetTop, 0),
    behavior: "smooth",
  });
}

function getHashTarget() {
  const match = window.location.hash.match(/^#((?:unit-\d+)|(?:para-\d+-\d+))$/i);
  if (!match) {
    return null;
  }

  const target = document.getElementById(String(match[1] || ""));
  return target instanceof HTMLElement ? target : null;
}

function applyHighlight() {
  const params = new URLSearchParams(window.location.search);
  const rawReference = params.get("ref");
  if (!rawReference) {
    return false;
  }

  const targetReference = normalizeLookupKey(rawReference);
  const refs = [...document.querySelectorAll(".bible-ref")];
  if (refs.length === 0) {
    return false;
  }

  let firstMatch = null;
  const units = [...document.querySelectorAll(".unit")];
  const paragraphCards = [...document.querySelectorAll("[data-paragraph-card]")];
  units.forEach((unit) => unit.classList.remove("is-linked-unit"));
  paragraphCards.forEach((card) => card.classList.remove("is-linked-paragraph"));

  refs.forEach((element) => {
    element.classList.remove("is-linked-reference");
    const ref = element.getAttribute("data-ref");
    if (!ref) {
      return;
    }

    if (referencesMatch(targetReference, ref)) {
      element.classList.add("is-linked-reference");
      if (!firstMatch) {
        firstMatch = element;
      }
    }
  });

  if (firstMatch) {
    const parentParagraph = firstMatch.closest("[data-paragraph-card]");
    const parentUnit = firstMatch.closest(".unit");
    if (parentParagraph) {
      parentParagraph.classList.add("is-linked-paragraph");
    }
    if (parentUnit) {
      parentUnit.classList.add("is-linked-unit");
    }

    // If the URL already targets a chapter/article/paragraph anchor, keep that visible.
    const hashTarget = getHashTarget();
    const scrollTarget = hashTarget ?? parentParagraph ?? firstMatch;
    window.setTimeout(() => scrollToTarget(scrollTarget), 0);
    return true;
  }

  return false;
}

function applyHighlightWithRetry(attempt = 0) {
  const applied = applyHighlight();
  if (applied || attempt >= 20) {
    return;
  }

  window.setTimeout(() => applyHighlightWithRetry(attempt + 1), 50);
}

export function initConfessionReferenceHighlight() {
  const run = () => {
    // Run after auto-linking has had a chance to render bible-ref spans.
    window.setTimeout(() => applyHighlightWithRetry(0), 0);
  };

  document.addEventListener("astro:page-load", run);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
