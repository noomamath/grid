# Nooma Grid

Standalone infinite canvas for math work — keyboard-first, 20px snap grid, KaTeX math blocks, and local persistence (IndexedDB via Dexie). Built with Next.js, [tldraw](https://tldraw.dev), Tailwind, and shadcn/ui.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com) and use the default Next.js preset (`npm run build` / `npm start`).
3. No extra environment variables are required for the MVP.

## Usage

- Choose **Math block** from the toolbar (shortcut **M**), then click-drag or tap on the canvas to place a math region.
- Select a math block and use the bottom **keypad** to append LaTeX snippets, or **Edit LaTeX** for the full expression.
- Work is saved automatically to this browser’s IndexedDB (guest document).

## Project layout

- `src/core` — Dexie database and guest document persistence.
- `src/editors/grid` — Tldraw shell, custom grid, KaTeX shape + tool.
- `src/components/shared` — Math keypad and shared chrome.
- `src/components/ui` — shadcn components.
