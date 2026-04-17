import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(projectRoot, "..", "..", "symbolics-data", "confessions");
const outputFile = path.join(projectRoot, "shared", "data", "confessions.json");

const confessionConfigs = [
  {
    sourceDir: "wcf1646",
    slug: "westminster-confession",
    shortCode: "WCF",
    title: "Westminster Confession of Faith (1646)",
    unitLabel: "Chapter",
  },
  {
    sourceDir: "lbcf1689",
    slug: "lbcf-1689",
    shortCode: "LBCF",
    title: "London Baptist Confession of Faith (1689)",
    unitLabel: "Chapter",
  },
];

const placeholders = [
  {
    slug: "savoy-declaration",
    shortCode: "SAV",
    title: "Savoy Declaration",
    unitLabel: "Chapter",
    sourceUrl: "TODO",
    units: [
      {
        number: 1,
        title: "Of the Holy Scripture",
        content: ["TODO: Add Savoy Declaration text."],
      },
    ],
  },
  {
    slug: "belgic-confession",
    shortCode: "BC",
    title: "Belgic Confession",
    unitLabel: "Article",
    sourceUrl: "TODO",
    units: [
      {
        number: 1,
        title: "That There Is One Only God",
        content: ["TODO: Add Belgic Confession text."],
      },
    ],
  },
];

const imported = [];

for (const config of confessionConfigs) {
  imported.push(await importConfession(config));
}

const result = {
  updatedAt: new Date().toISOString().slice(0, 10),
  items: [...imported, ...placeholders],
};

await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
console.log(`wrote ${path.relative(projectRoot, outputFile)}`);

async function importConfession(config) {
  const base = path.join(sourceRoot, config.sourceDir);
  const chaptersDir = path.join(base, "chapters");
  const paragraphsDir = path.join(base, "paragraphs");

  const chapterFiles = (await readdir(chaptersDir))
    .filter((file) => file.endsWith(".yml"))
    .sort((a, b) => numericPrefix(a) - numericPrefix(b));

  const paragraphFiles = (await readdir(paragraphsDir))
    .filter((file) => file.endsWith(".yml"))
    .sort((a, b) => {
      const [aParent, aChild] = numericPair(a);
      const [bParent, bChild] = numericPair(b);
      if (aParent !== bParent) {
        return aParent - bParent;
      }
      return aChild - bChild;
    });

  const paragraphsByChapter = new Map();

  for (const file of paragraphFiles) {
    const full = path.join(paragraphsDir, file);
    const raw = await readFile(full, "utf-8");
    const doc = parseYaml(raw) ?? {};
    const parent = Number(doc.parent ?? numericPair(file)[0]);
    const id = normalizeText(String(doc.id ?? ""));
    const segments = Array.isArray(doc.segments) ? doc.segments : [];

    const paragraphBody = segments
      .map((segment) => {
        const text = normalizeText(String(segment?.text ?? ""));
        const proofs = normalizeProofs(segment?.proofs);
        return proofs ? `${text} (${proofs})` : text;
      })
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const paragraph = `${id} ${paragraphBody}`.trim();
    const bucket = paragraphsByChapter.get(parent) ?? [];
    bucket.push(paragraph);
    paragraphsByChapter.set(parent, bucket);
  }

  const units = [];

  for (const file of chapterFiles) {
    const full = path.join(chaptersDir, file);
    const raw = await readFile(full, "utf-8");
    const doc = parseYaml(raw) ?? {};
    const number = Number(doc.id ?? numericPrefix(file));
    const title = normalizeText(String(doc.title ?? `${config.unitLabel} ${number}`));
    const content = paragraphsByChapter.get(number) ?? [];

    units.push({
      number,
      title,
      content,
    });
  }

  return {
    slug: config.slug,
    shortCode: config.shortCode,
    title: config.title,
    unitLabel: config.unitLabel,
    sourceUrl: "TODO",
    units,
  };
}

function numericPrefix(fileName) {
  return Number(fileName.split(".")[0]);
}

function numericPair(fileName) {
  const [parent, child] = fileName.replace(".yml", "").split("_");
  return [Number(parent), Number(child)];
}

function normalizeProofs(value) {
  if (!value) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(String(item))).filter(Boolean).join("; ");
  }

  return normalizeText(String(value));
}

function normalizeText(text) {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/â€“/g, "-")
    .replace(/â€”/g, "-")
    .replace(/â€˜/g, "'")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€¦/g, "...")
    .replace(/Â /g, " ")
    .replace(/Â/g, "")
    .replace(/Ã¢â‚¬â€œ/g, "-")
    .replace(/Ã¢â‚¬â€/g, "-")
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Å“/g, '"')
    .replace(/Ã¢â‚¬/g, '"')
    .replace(/Ã¢â‚¬Â¦/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

