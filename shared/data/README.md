# BSB Data Pipeline

This folder owns the local BSB corpus used by the site.

## Files

- `bsb.json`: canonical local BSB data used by all downstream build steps.
- `bible-cited.json` (optional): cited-reference overrides loaded by the web app
  when `bible-source.json` points `citedDatasetPath` at it, or when the file
  exists at `shared/data/bible-cited.json`.
- `scripts/prepare-bsb.mjs`: one-time or on-demand normalizer that:
  - applies the existing Yahweh/LORD rewrites directly in the corpus,
  - stores each verse with explicit metadata: `{ chapter, verse, text }`.

## Cited Overrides

Use a plain string or `{ "text": "...", "version": "KJV" }` when one whole
reference uses the same translation. For a combined reference that mixes
translations by verse, use `parts`; the tooltip will label each part instead of
tagging the whole citation as one translation.

```json
{
  "verses": {
    "1jn 5:7-8": {
      "parts": [
        {
          "reference": "1 John 5:7",
          "text": "For there are three that bear record in heaven...",
          "version": "KJV"
        },
        {
          "reference": "1 John 5:8",
          "text": "And there are three that testify on earth...",
          "version": "BSB"
        }
      ]
    }
  }
}
```

## Commands

- `npm run seed:bsb`
  - normalizes `bsb-data-pipeline/bsb.json` in place.

- `npm run build:bible`
  - reads `src/generated/questions.json`,
  - extracts cited references,
  - writes `src/generated/bible-cited.json` for runtime `getVerse()` lookups.
