import { CELL_SIZE_PX } from "@/core/constants";

const MEASURE_FONT =
  '16px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace';

/** Horizontal padding budget when comparing text width to cell columns (matches symmetric padding + focus ring). */
export const CELL_TEXT_HPAD = 8;

let measureCtx: CanvasRenderingContext2D | null = null;

export function measureTextWidth(text: string): number {
  if (typeof window === "undefined") return text.length * (CELL_SIZE_PX * 0.55);
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
    if (!measureCtx) return text.length * 9;
    measureCtx.font = MEASURE_FONT;
  }
  return measureCtx.measureText(text).width;
}

export function columnSpanFor(
  text: string,
  startCol: number,
  cols: number
): number {
  if (!text) return 1;
  const maxS = cols - startCol;
  const w = measureTextWidth(text) + CELL_TEXT_HPAD;
  const s = Math.max(1, Math.ceil(w / CELL_SIZE_PX));
  return Math.min(s, maxS);
}

export function isCoveredByMergeLeft(
  r: number,
  c: number,
  cells: string[],
  cols: number
): boolean {
  for (let cc = 0; cc < c; cc++) {
    const left = cells[r * cols + cc] ?? "";
    if (!left) continue;
    const sp = columnSpanFor(left, cc, cols);
    if (cc + sp > c) return true;
  }
  return false;
}

/** Repack row after editing `editedCol`: clear from edited col onward, write new value, then place former tail cells to the right using measured spans. */
export function reflowRow(
  cells: string[],
  row: number,
  cols: number,
  editedCol: number,
  newValue: string
): void {
  const base = row * cols;
  const tail: string[] = [];
  for (let col = editedCol + 1; col < cols; col++) {
    const v = cells[base + col];
    if (v && v.length > 0) tail.push(v);
  }
  for (let col = editedCol; col < cols; col++) {
    cells[base + col] = "";
  }
  const span = columnSpanFor(newValue, editedCol, cols);
  cells[base + editedCol] = newValue;
  let writeCol = editedCol + span;
  for (const piece of tail) {
    if (writeCol >= cols) break;
    const ps = columnSpanFor(piece, writeCol, cols);
    cells[base + writeCol] = piece;
    writeCol += ps;
  }
}

export function emptyCells(rows: number, cols: number): string[] {
  return Array.from({ length: rows * cols }, () => "");
}

export function cloneCells(cells: string[]): string[] {
  return cells.slice();
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Column index of the segment start immediately to the left of column `c` (same row), or null. */
export function segmentStartBeforeColumn(
  r: number,
  c: number,
  cells: string[],
  cols: number
): number | null {
  if (c <= 0) return null;
  let cc = c - 1;
  while (cc >= 0 && !(cells[r * cols + cc] ?? "").length) cc--;
  if (cc < 0) return null;
  let start = cc;
  while (start > 0 && isCoveredByMergeLeft(r, start, cells, cols)) start--;
  return start;
}

/** Focus index for vertical move to same logical column, adjusting if target is under a merge. */
export function focusIndexForColumn(
  r: number,
  c: number,
  cells: string[],
  cols: number
): number {
  if (isCoveredByMergeLeft(r, c, cells, cols)) {
    for (let cc = c - 1; cc >= 0; cc--) {
      const left = cells[r * cols + cc] ?? "";
      if (!left) continue;
      const sp = columnSpanFor(left, cc, cols);
      if (cc + sp > c) return r * cols + cc;
    }
  }
  return r * cols + c;
}
