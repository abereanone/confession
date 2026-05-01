import { autoLinkBibleRefs } from "../lib/bible/autoLinkBibleRefs";
import { normalizeReference } from "../lib/bible/normalizeRef";

function normalizeLookupKey(reference) {
  return normalizeReference(reference || "")
    .toLowerCase()
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[;,]\s*$/g, "")
    .trim();
}

function getVerseFromLookup(reference) {
  const lookup = window.__bibleVerseLookup || {};
  return lookup[normalizeLookupKey(reference)] || null;
}

function parseChapterReference(reference) {
  const normalized = normalizeLookupKey(reference);
  const match = normalized.match(/^([1-3]?[a-z]{2,3})\s+(\d+)(?:-(\d+))?$/i);
  if (!match) {
    return null;
  }

  const bookCode = String(match[1] || "");
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

function getChapterLinkInfo(reference) {
  const parsed = parseChapterReference(reference);
  if (!parsed) {
    return null;
  }

  const cleanReference = String(reference || "").replace(/[;,]\s*$/g, "").trim();
  return {
    href: `/bible/${parsed.bookCode}/${parsed.chapter}`,
    label: cleanReference || `${parsed.bookCode} ${parsed.chapter}`,
  };
}

function formatVersionLabel(version) {
  const normalized = String(version || "").trim().toLowerCase();
  if (!normalized) {
    return "BSB";
  }
  if (normalized === "berean standard bible" || normalized === "bsb") {
    return "BSB";
  }
  if (normalized === "king james version" || normalized === "kjv") {
    return "KJV";
  }
  return String(version).trim();
}

function getTooltipText(reference, verse) {
  if (!verse) {
    return "Verse not found.";
  }
  return `${reference} - ${verse.text} (${formatVersionLabel(verse.version)})`;
}

function ensureTooltip(element) {
  if (element.__tooltipElement) {
    const tooltip = element.__tooltipElement;
    positionTooltip(element, tooltip);
    tooltip.style.display = element.__tooltipActive ? "block" : "none";
    return;
  }

  const reference = String(element.dataset.ref || "");
  const verse = getVerseFromLookup(reference);
  const chapterLink = verse ? null : getChapterLinkInfo(reference);
  const tooltip = document.createElement("div");
  tooltip.className = "bible-tooltip";
  if (chapterLink) {
    const chapterLinkElement = document.createElement("a");
    chapterLinkElement.className = "bible-tooltip-link";
    chapterLinkElement.href = chapterLink.href;
    chapterLinkElement.target = "_blank";
    chapterLinkElement.rel = "noopener noreferrer";
    chapterLinkElement.textContent = `Open ${chapterLink.label} in Bible Reader`;
    tooltip.append(chapterLinkElement);
  } else {
    tooltip.textContent = getTooltipText(reference, verse);
  }
  document.body.appendChild(tooltip);

  element.__tooltipElement = tooltip;
  positionTooltip(element, tooltip);
  tooltip.style.display = element.__tooltipActive ? "block" : "none";
}

function positionTooltip(anchor, tooltip) {
  const rect = anchor.getBoundingClientRect();

  tooltip.style.visibility = "hidden";
  tooltip.style.display = "block";

  const tooltipWidth = tooltip.offsetWidth;
  const viewportWidth = window.innerWidth;
  let left = rect.left + window.scrollX;

  if (left + tooltipWidth > viewportWidth - 16) {
    left = viewportWidth - tooltipWidth - 16;
  }
  if (left < 16) {
    left = 16;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${rect.bottom + window.scrollY + 8}px`;
  tooltip.style.display = "none";
  tooltip.style.visibility = "visible";
}

function hideTooltip(element) {
  if (element.__tooltipElement) {
    element.__tooltipElement.style.display = "none";
  }
}

function enhanceElement(element) {
  if (element.dataset.bibleTooltipState === "ready") {
    return;
  }

  const reference = String(element.dataset.ref || "");
  const verse = getVerseFromLookup(reference);
  const chapterLink = verse ? null : getChapterLinkInfo(reference);

  if (chapterLink) {
    const openChapterLink = () => {
      window.open(chapterLink.href, "_blank", "noopener,noreferrer");
    };

    element.setAttribute("role", "link");
    element.setAttribute("tabindex", "0");
    element.style.cursor = "pointer";
    element.addEventListener("click", (event) => {
      event.preventDefault();
      openChapterLink();
    });
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      openChapterLink();
    });
  }

  const handleEnter = () => {
    element.__tooltipActive = true;
    ensureTooltip(element);
  };

  const handleLeave = () => {
    element.__tooltipActive = false;
    hideTooltip(element);
  };

  element.addEventListener("mouseenter", handleEnter);
  element.addEventListener("focus", handleEnter);
  element.addEventListener("mouseleave", handleLeave);
  element.addEventListener("blur", handleLeave);
  element.dataset.bibleTooltipState = "ready";
}

function processScope(scope) {
  if (scope.dataset.bibleProcessed !== "true") {
    scope.innerHTML = autoLinkBibleRefs(scope.innerHTML);
    scope.dataset.bibleProcessed = "true";
  }

  scope.querySelectorAll(".bible-ref").forEach((element) => {
    enhanceElement(element);
  });
}

function scan() {
  document
    .querySelectorAll("[data-bible-autolink]")
    .forEach((scope) => processScope(scope));
}

export function initBibleReferences() {
  if (window.__bibleReferencesInitialized) {
    scan();
    return;
  }

  window.__bibleReferencesInitialized = true;
  document.addEventListener("astro:page-load", scan);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  } else {
    scan();
  }
}
