import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sharedConfessionsDir = path.join(root, "shared", "data", "confessions");
const bookMapPath = path.join(root, "apps", "web", "src", "lib", "bible", "bookMap.json");
const mirrorDirs = [
  path.join(root, "apps", "web", "src", "data", "confessions"),
  path.join(root, "apps", "mobile", "src", "data", "confessions"),
];

const bookMapRaw = JSON.parse(await readFile(bookMapPath, "utf-8"));
const aliasMap = buildAliasMap(bookMapRaw);
const aliasKeys = [...aliasMap.keys()].sort((a, b) => b.length - a.length);
const aliasPattern = aliasKeys.map((key) => escapeRegex(key).replace(/\s+/g, "\\s+")).join("|");
const hasBookPattern = new RegExp(
  `(?:^|[^A-Za-z0-9])(?:${aliasPattern})(?:\\.)?\\s*(?:,\\s*)?(?:ch\\.?\\s*)?\\d`,
  "i"
);
const bookRefPattern = new RegExp(
  `(^|[^A-Za-z0-9])(${aliasPattern})(?:\\.)?(?=\\s*(?:,\\s*)?(?:ch\\.?\\s*)?\\d)`,
  "gi"
);
const bookTokenPattern = new RegExp(
  `(^|[^A-Za-z0-9])(${aliasPattern})(?:\\.)?(?=$|[^A-Za-z0-9])`,
  "gi"
);

const confessionFiles = (await readdir(sharedConfessionsDir))
  .filter((name) => name.endsWith(".json") && name !== "manifest.json")
  .sort((a, b) => a.localeCompare(b));

for (const fileName of confessionFiles) {
  const fullPath = path.join(sharedConfessionsDir, fileName);
  const raw = await readFile(fullPath, "utf-8");
  const parsed = JSON.parse(raw);

  const units = Array.isArray(parsed?.units) ? parsed.units : [];
  for (const unit of units) {
    if (!Array.isArray(unit?.content)) {
      continue;
    }

    unit.content = unit.content.map((paragraph) => {
      if (typeof paragraph !== "string") {
        return paragraph;
      }
      return convertParagraph(paragraph);
    });
  }

  await writeFile(fullPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  for (const mirrorDir of mirrorDirs) {
    await copyFile(fullPath, path.join(mirrorDir, fileName));
  }
}

console.log(`normalized proof tags in ${confessionFiles.length} confession files`);

function convertParagraph(paragraph) {
  let out = String(paragraph ?? "");

  // Known source typo in one Belgic paragraph that embeds a brace reference in parentheses.
  out = out.replace(/\(Rev\.?\s*22:\s*\{Matt\.?\s*10:32\}\)/gi, "(Rev. 22:20)");

  out = out.replace(/\{+\s*proofs:\s*((?:proofs:\s*)*[^{}]+?)\s*\}+/gi, (_match, inner) => {
    const value = stripProofLabels(inner);
    if (!isLikelyProofList(value)) {
      return `(${normalizeWhitespace(value)})`;
    }
    return `{{proofs: ${normalizeProofList(value)}}}`;
  });

  out = out.replace(/\{\{proofs:\s*([^}]+?)\s*\}\}/gi, (_match, inner) => {
    const value = stripProofLabels(inner);
    if (!isLikelyProofList(value)) {
      return `(${normalizeWhitespace(value)})`;
    }
    return `{{proofs: ${normalizeProofList(value)}}}`;
  });

  out = out.replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, (match, inner) => {
    return convertDelimitedGroup(match, inner);
  });

  out = out.replace(/\(([^()]+)\)/g, (match, inner) => {
    return convertDelimitedGroup(match, inner);
  });

  out = out.replace(/\{\{proofs:\s*([^}]+?)\s*\}\}/gi, (_match, inner) => {
    return `{{proofs: ${normalizeProofList(inner)}}}`;
  });

  return out;
}

function convertDelimitedGroup(original, inner) {
  const value = normalizeWhitespace(inner);
  if (!isLikelyProofList(value)) {
    return original;
  }
  return `{{proofs: ${normalizeProofList(value)}}}`;
}

function isLikelyProofList(value) {
  const normalized = normalizeWhitespace(stripProofLabels(value));
  if (!normalized || normalized.length > 2000) {
    return false;
  }
  if (!hasBookPattern.test(normalized)) {
    return false;
  }

  let probe = ` ${normalized} `;
  probe = probe.replace(bookTokenPattern, "$1 ");
  probe = probe.replace(/\d+\s*f{1,2}\.?/gi, " ");
  probe = probe.replace(/\b(?:ch|chs|chapter|cap|v|vs|verse|verses|f|ff|etc|and|to)\b\.?/gi, " ");
  probe = probe.replace(/[0-9:;,\-().[\]/\s]/g, " ");

  return !/[A-Za-z]/.test(probe);
}

function normalizeProofList(value) {
  return normalizeWhitespace(stripProofLabels(value))
    .replace(/\u2013|\u2014/g, "-")
    .replace(bookRefPattern, (match, prefix, book) => {
      const mappedCode = aliasMap.get(normalizeBookToken(book));
      if (!mappedCode) {
        return match;
      }
      return `${prefix}${toDisplayCode(mappedCode)}`;
    })
    .replace(/\s*:\s*/g, ":")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stripProofLabels(value) {
  return String(value ?? "").replace(/^(?:\s*proofs:\s*)+/i, "").trim();
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAliasMap(source) {
  const aliases = new Map();
  for (const [alias, code] of Object.entries(source)) {
    const normalizedAlias = normalizeBookToken(alias);
    if (!normalizedAlias) {
      continue;
    }
    aliases.set(normalizedAlias, String(code ?? "").trim().toLowerCase());
  }

  const manualAliases = {
    matt: "mat",
    phil: "php",
    eccl: "ecc",
    deut: "deu",
    ezek: "ezk",
    "1 thess": "1th",
    "2 thess": "2th",
    "1 chron": "1ch",
    "2 chron": "2ch",
  };

  for (const [alias, code] of Object.entries(manualAliases)) {
    aliases.set(normalizeBookToken(alias), code);
  }

  return aliases;
}

function toDisplayCode(code) {
  const normalized = String(code ?? "").trim().toLowerCase();
  if (!normalized) {
    return normalized;
  }

  const numberedMatch = normalized.match(/^([1-3])([a-z]{2,})$/);
  if (numberedMatch) {
    const ordinal = numberedMatch[1] ?? "";
    const letters = numberedMatch[2] ?? "";
    return `${ordinal}${letters.charAt(0).toUpperCase()}${letters.slice(1)}`;
  }

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function normalizeBookToken(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
