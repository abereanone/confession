# Confessions Hub Scaffold

Scaffold for a fast lookup project with:

- BSB Bible references
- Westminster Confession
- London Baptist Confession (1689)
- Savoy Declaration
- Belgic Confession
- Web app + mobile app (iOS/Android)

## Structure

- `shared/data/confessions.json`: canonical confession metadata/content
- `apps/web`: Astro web app scaffold
- `apps/mobile`: Expo React Native scaffold
- `scripts/sync-shared-data.mjs`: copies shared data into each app

## Quick Start

From `confessions-hub/`:

```bash
npm install
npm run sync:data
npm run dev:web
```

In a second terminal:

```bash
npm run dev:mobile
```

## Notes

- This is scaffold-only. Confession bodies are placeholder text.
- Replace `TODO` entries in `shared/data/confessions.json`.
- Wire Bible lookup to your BSB dataset path in `shared/data/bible-source.json`.

