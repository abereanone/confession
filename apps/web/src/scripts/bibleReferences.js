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

function getTooltipText(verse) {
  if (!verse) {
    return "Verse not found.";
  }
  return `${verse.text} (${formatVersionLabel(verse.version)})`;
}

function ensureTooltip(element) {
  if (element.__tooltipElement) {
    const tooltip = element.__tooltipElement;
    positionTooltip(element, tooltip);
    tooltip.style.display = element.__tooltipActive ? "block" : "none";
    return;
  }

  const verse = getVerseFromLookup(element.dataset.ref);
  const tooltip = document.createElement("div");
  tooltip.className = "bible-tooltip";
  tooltip.textContent = getTooltipText(verse);
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
