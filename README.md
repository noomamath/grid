# Nooma Grid

Keyboard-first fixed cell grid for math-style entry (graph-paper workflow): one character per cell with local persistence (IndexedDB via Dexie). Built with Next.js, Tailwind, and shadcn/ui.

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

- Type in the focused cell; each character advances to the next cell (row-major).
- Move with arrow keys, Tab, or Enter (moves down).
- Backspace on an empty cell clears the previous cell.
- Undo / redo from the header or ⌘Z / ⌘⇧Z (Ctrl on Windows).
- Hold Ctrl (or ⌘) and scroll to zoom the grid.
- Work saves automatically to this browser’s IndexedDB (guest document).

## Project layout

- `src/core` — Dexie database, guest document, and cell grid types.
- `src/editors/cell-grid` — Cell grid editor (primary UI).
- `src/components/ui` — shadcn components.
