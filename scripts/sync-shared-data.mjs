import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sharedConfessionsDir = path.join(root, "shared", "data", "confessions");
const sharedComparisonDir = path.join(root, "shared", "data", "comparison");

const targets = [
  path.join(root, "apps", "web", "src", "data", "confessions"),
  path.join(root, "apps", "mobile", "src", "data", "confessions"),
];

// The comparison spine is web-only: the mobile shell has no comparison view.
const comparisonTargets = [path.join(root, "apps", "web", "src", "data", "comparison")];

// Same for the catechism mappings — they feed the confession pages and the
// published /catechism-links.json, neither of which the mobile shell has.
const sharedCatechismDir = path.join(root, "shared", "data", "catechism");
const catechismTargets = [path.join(root, "apps", "web", "src", "data", "catechism")];
const legacyTargets = [
  path.join(root, "apps", "web", "src", "data", "confessions.json"),
  path.join(root, "apps", "mobile", "src", "data", "confessions.json"),
];

for (const target of targets) {
  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await cp(sharedConfessionsDir, target, { recursive: true });
  console.log(`synced ${path.relative(root, target)}`);
}

for (const target of comparisonTargets) {
  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await cp(sharedComparisonDir, target, {
    recursive: true,
    // The draft is a review artefact, not something the site should import.
    filter: (source) => !source.endsWith("alignment.draft.json"),
  });
  console.log(`synced ${path.relative(root, target)}`);
}

for (const target of catechismTargets) {
  await mkdir(path.dirname(target), { recursive: true });
  await rm(target, { recursive: true, force: true });
  await cp(sharedCatechismDir, target, { recursive: true });
  console.log(`synced ${path.relative(root, target)}`);
}

for (const target of legacyTargets) {
  await rm(target, { force: true });
}
