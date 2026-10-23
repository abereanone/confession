# Confessions Hub

A fast lookup for the Reformed confessions with Bible references, published at [confess.catechize.ing](https://confess.catechize.ing). It is an npm workspace with a web app and a mobile shell over one shared corpus.

Confessions in the corpus: Westminster, London Baptist (1644 and 1689), Savoy Declaration, Belgic, Canons of Dordt and Second Helvetic. Scripture text is the Berean Standard Bible (BSB). Catechism questions from catechize.ing are linked to confession paragraphs.

Working notes for editing the corpus (schema, proof-tag rules, auditing) are in [`CLAUDE.md`](CLAUDE.md).

## Structure

- `shared/data/` - the only source of truth for data. See [`shared/data/README.md`](shared/data/README.md).
  - `confessions/*.json` - one file per confession, plus `manifest.json`.
  - `catechism/` - question-to-paragraph mappings for the Baptist Catechism, WSC and WLC.
  - `comparison/` - the paragraph alignment between the Westminster, Savoy and 1689 texts.
  - `bsb.json`, `bible-cited.json`, `bible-source.json` - the Bible text and cited-verse overrides.
  - `scripts/` - BSB data tools.
- `apps/web/` - Astro 7 site (static, Cloudflare Pages). `src/data/` inside it is a generated copy.
- `apps/mobile/` - Expo React Native shell. Its `src/data/` is also a generated copy.
- `scripts/` - corpus tooling (below).
- `docs/catechism-linking-plan.md` - the plan for linking catechize.ing questions to confession paragraphs.

## Quick start

```bash
npm install
npm run dev:web        # syncs the shared data, then starts the web app
npm run dev:mobile     # in a second terminal, for the mobile shell
```

Never edit `apps/*/src/data/confessions/` by hand: `npm run sync:confessions` deletes and recopies them from `shared/data/` (it runs automatically before `dev:web`, `build:web`, `dev:mobile`, `android` and `ios`). Requires Node.js 22.22.0+.

## npm scripts

| Script | What it does |
|---|---|
| `dev`, `dev:web` | Sync data, then run the Astro dev server. |
| `build`, `build:web` | Sync data, then build the web app to `apps/web/dist/`. |
| `dev:mobile`, `android`, `ios` | Sync data, then start the Expo app (or open the Android / iOS build). |
| `sync:confessions` | Run `scripts/sync-shared-data.mjs`. |
| `data:prepare-bsb`, `seed:bsb` | Normalise `shared/data/bsb.json` (`scripts/prepare-bsb.mjs`). |
| `data:fix-bsb-text` | Rebuild `bsb.json` from `bsb.txt` and `mods.json`, writing `bsb.changes.json`. |
| `data:find-gaps` | List verses missing from `bsb.json`. |

## Corpus scripts (`scripts/`)

Run from the repo root. Most take a confession slug and print a report.

| Script | What it does |
|---|---|
| `sync-shared-data.mjs` | Copies `shared/data/confessions`, `comparison` and `catechism` into the apps (the comparison and catechism data go to web only), and removes legacy aggregate files. |
| `audit-confession-refs.py` | Audits every scripture citation in every confession: broken (does not resolve in the BSB), unlinked (a form the autolinker cannot link), mismatch (quote does not match the cited verse). |
| `audit-confession-continuations.py` | Finds book-less continuations (`Rom 1; 11:7-8`, `Heb 11; 6`) that cannot inherit a book and so are never linked. |
| `normalize-confession-proofs.mjs` | Tidies the proof tags in all confession files and mirrors the result to the app copies. Back up or commit first. |
| `scan-confession-typos.mjs <slug>` | Finds scan or OCR damage in one confession: unknown words, stray punctuation, doubled words. Read-only. |
| `draft-catechism-links.mjs` | Drafts the catechism question to confession paragraph mapping. `--report` prints without writing; `--catechism=../catechize.ing`; `--prefix=wsc`. |
| `draft-comparison-alignment.mjs` | Drafts `shared/data/comparison/alignment.draft.json`, the paragraph alignment for the WCF / Savoy / 1689 comparison view. `--report` prints only. |
| `import-symbolics-confessions.mjs` | Legacy one-time import from the sibling `symbolics-data` repo into `shared/data/confessions.json` (the old aggregate file). Not part of the normal workflow. |
| `build-confession-files.mjs` | Legacy one-time splitter: turns the aggregate `confessions.json` into the per-confession files and `manifest.json`. Overwrites them, so do not run it on the current corpus. |
| `apps/web/scripts/gen-logo.cjs` | Regenerates the logo and icon set in `apps/web/public/` (`npm run gen:logo --workspace @confessions-hub/web`). |

## Deployment

The web app is a static Cloudflare Pages site built from GitHub (Pages runs `npm run build`; output is `apps/web/dist/`). Pushing to `main` is what makes a change live. It also publishes `/catechism-links.json`, which catechize.ing reads with `npm run sync:confession-links`.
