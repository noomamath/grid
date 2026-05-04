"use client";

// Future: optional freehand draw mode (e.g. canvas layer or embedded vector editor).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  CELL_GRID_COLS,
  CELL_GRID_ROWS,
  CELL_SIZE_PX,
} from "@/core/constants";
import {
  loadGuestDocument,
  saveGuestCellGrid,
  type CellGridDocument,
} from "@/core/db";

const MAX_HISTORY = 80;
const SAVE_DEBOUNCE_MS = 350;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
/** Horizontal padding budget when comparing text width to cell columns (matches symmetric padding + focus ring). */
const CELL_TEXT_HPAD = 8;

const MEASURE_FONT =
  '16px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace';

let measureCtx: CanvasRenderingContext2D | null = null;

function measureTextWidth(text: string): number {
  if (typeof window === "undefined") return text.length * (CELL_SIZE_PX * 0.55);
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
    if (!measureCtx) return text.length * 9;
    measureCtx.font = MEASURE_FONT;
  }
  return measureCtx.measureText(text).width;
}

function columnSpanFor(
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

function isCoveredByMergeLeft(
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
function reflowRow(
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

function emptyCells(rows: number, cols: number): string[] {
  return Array.from({ length: rows * cols }, () => "");
}

function cloneCells(cells: string[]): string[] {
  return cells.slice();
}

function toDoc(rows: number, cols: number, cells: string[]): CellGridDocument {
  return { version: 1, rows, cols, cells: cloneCells(cells) };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Column index of the segment start immediately to the left of column `c` (same row), or null. */
function segmentStartBeforeColumn(
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
function focusIndexForColumn(r: number, c: number, cells: string[], cols: number): number {
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

export function CellGridEditor() {
  const rows = CELL_GRID_ROWS;
  const cols = CELL_GRID_COLS;
  const total = rows * cols;

  const [hydrated, setHydrated] = useState(false);
  const [cells, setCells] = useState<string[]>(() => emptyCells(rows, cols));
  const [scale, setScale] = useState(1);
  const [stackUi, setStackUi] = useState({ past: 0, future: 0 });
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  const cellsRef = useRef(cells);

  useLayoutEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  const pastRef = useRef<string[][]>([]);
  const futureRef = useRef<string[][]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const focusCell = useCallback(
    (idx: number) => {
      const i = clamp(idx, 0, total - 1);
      requestAnimationFrame(() => {
        inputRefs.current[i]?.focus();
        inputRefs.current[i]?.select();
      });
    },
    [total]
  );

  const scheduleSave = useCallback(
    (next: string[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveGuestCellGrid(toDoc(rows, cols, next));
      }, SAVE_DEBOUNCE_MS);
    },
    [rows, cols]
  );

  const refreshStackUi = useCallback(() => {
    setStackUi({
      past: pastRef.current.length,
      future: futureRef.current.length,
    });
  }, []);

  const pushPast = useCallback(() => {
    pastRef.current.push(cloneCells(cellsRef.current));
    if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
    futureRef.current = [];
    refreshStackUi();
  }, [refreshStackUi]);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const prev = past.pop()!;
    futureRef.current.push(cloneCells(cellsRef.current));
    setCells(prev);
    refreshStackUi();
  }, [refreshStackUi]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future.pop()!;
    pastRef.current.push(cloneCells(cellsRef.current));
    setCells(next);
    refreshStackUi();
  }, [refreshStackUi]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await loadGuestDocument();
      if (cancelled) return;
      const g = row?.cellGrid;
      if (
        g &&
        g.version === 1 &&
        g.rows === rows &&
        g.cols === cols &&
        g.cells.length === total
      ) {
        setCells(cloneCells(g.cells));
      } else {
        setCells(emptyCells(rows, cols));
      }
      pastRef.current = [];
      futureRef.current = [];
      setStackUi({ past: 0, future: 0 });
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, cols, total]);

  useEffect(() => {
    if (!hydrated) return;
    scheduleSave(cells);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [cells, hydrated, scheduleSave]);

  const applyUserCells = useCallback(
    (next: string[]) => {
      pushPast();
      setCells(next);
    },
    [pushPast]
  );

  const onCellChange = useCallback(
    (r: number, c: number, raw: string) => {
      const line = raw.replace(/\r?\n/g, "");
      const next = cellsRef.current.slice();
      reflowRow(next, r, cols, c, line);
      applyUserCells(next);
    },
    [applyUserCells, cols]
  );

  const onCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
      const idx = r * cols + c;
      const el = e.currentTarget;
      const selStart = el.selectionStart ?? 0;
      const selEnd = el.selectionEnd ?? 0;
      const len = (cellsRef.current[idx] ?? "").length;
      const caretAtStart = selStart === 0 && selEnd === 0;
      const caretAtEnd = selStart === len && selEnd === len;
      const allSelected = selStart === 0 && selEnd === len && len > 0;
      const snap = cellsRef.current;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      const curVal = snap[idx] ?? "";
      const curSpan = curVal.length > 0 ? columnSpanFor(curVal, c, cols) : 1;

      if (e.key === "ArrowRight") {
        if (!caretAtEnd && !allSelected) return;
        e.preventDefault();
        const nc = c + curSpan;
        if (nc < cols) focusCell(r * cols + nc);
        else if (r < rows - 1) focusCell(focusIndexForColumn(r + 1, 0, snap, cols));
        return;
      }
      if (e.key === "ArrowLeft") {
        if (!caretAtStart && !allSelected) return;
        e.preventDefault();
        const prevStart = segmentStartBeforeColumn(r, c, snap, cols);
        if (prevStart !== null) focusCell(r * cols + prevStart);
        else if (r > 0) {
          let cc = cols - 1;
          while (cc >= 0 && !(snap[(r - 1) * cols + cc] ?? "").length) cc--;
          if (cc < 0) focusCell((r - 1) * cols);
          else {
            let start = cc;
            while (start > 0 && isCoveredByMergeLeft(r - 1, start, snap, cols))
              start--;
            focusCell((r - 1) * cols + start);
          }
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (r < rows - 1)
          focusCell(focusIndexForColumn(r + 1, c, snap, cols));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (r > 0) focusCell(focusIndexForColumn(r - 1, c, snap, cols));
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          const prevStart = segmentStartBeforeColumn(r, c, snap, cols);
          if (prevStart !== null) focusCell(r * cols + prevStart);
          else if (r > 0) {
            let cc = cols - 1;
            while (cc >= 0 && !(snap[(r - 1) * cols + cc] ?? "").length) cc--;
            if (cc < 0) focusCell((r - 1) * cols);
            else {
              let start = cc;
              while (
                start > 0 &&
                isCoveredByMergeLeft(r - 1, start, snap, cols)
              )
                start--;
              focusCell((r - 1) * cols + start);
            }
          }
        } else {
          const nc = c + curSpan;
          if (nc < cols) focusCell(r * cols + nc);
          else if (r < rows - 1)
            focusCell(focusIndexForColumn(r + 1, 0, snap, cols));
        }
        return;
      }

      if (e.key === "Backspace") {
        const cur = snap[idx] ?? "";
        if (cur.length > 0) return;
        e.preventDefault();
        const prevStart = segmentStartBeforeColumn(r, c, snap, cols);
        if (prevStart !== null) {
          const p = r * cols + prevStart;
          const prevVal = snap[p] ?? "";
          const next = snap.slice();
          next[p] = prevVal.slice(0, -1);
          reflowRow(next, r, cols, prevStart, next[p] ?? "");
          applyUserCells(next);
          requestAnimationFrame(() => {
            const inp = inputRefs.current[p];
            if (inp) {
              inp.focus();
              const pos = (next[p] ?? "").length;
              inp.setSelectionRange(pos, pos);
            }
          });
        } else if (r > 0) {
          let cc = cols - 1;
          while (cc >= 0 && !(snap[(r - 1) * cols + cc] ?? "").length) cc--;
          if (cc >= 0) {
            let start = cc;
            while (start > 0 && isCoveredByMergeLeft(r - 1, start, snap, cols))
              start--;
            const p = (r - 1) * cols + start;
            const prevVal = snap[p] ?? "";
            const next = snap.slice();
            next[p] = prevVal.slice(0, -1);
            reflowRow(next, r - 1, cols, start, next[p] ?? "");
            applyUserCells(next);
            requestAnimationFrame(() => {
              const inp = inputRefs.current[p];
              if (inp) {
                inp.focus();
                const pos = (next[p] ?? "").length;
                inp.setSelectionRange(pos, pos);
              }
            });
          }
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (r < rows - 1)
          focusCell(focusIndexForColumn(r + 1, c, snap, cols));
        return;
      }
    },
    [applyUserCells, cols, focusCell, redo, rows, undo]
  );

  const onWheelZoom = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setScale((s) =>
      clamp(s - e.deltaY * 0.0015, MIN_SCALE, MAX_SCALE)
    );
  }, []);

  useLayoutEffect(() => {
    inputRefs.current = inputRefs.current.slice(0, total);
  }, [total]);

  if (!hydrated) {
    return (
      <div
        className="flex h-[100dvh] w-full items-center justify-center bg-[var(--background)] text-[var(--foreground)]"
        role="status"
        aria-live="polite"
      >
        Loading grid…
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="text-sm text-[var(--muted-foreground)]">
          Nooma grid
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-sm disabled:opacity-40"
            onClick={undo}
            disabled={stackUi.past === 0}
            title="Undo (⌘Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-1 text-sm disabled:opacity-40"
            onClick={redo}
            disabled={stackUi.future === 0}
            title="Redo (⌘⇧Z)"
          >
            Redo
          </button>
          <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
            {Math.round(scale * 100)}%
          </span>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-auto p-4"
        onWheel={onWheelZoom}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: "fit-content",
          }}
        >
          <div
            className="flex flex-col gap-0 rounded-md border border-sky-300/80 bg-white shadow-sm"
            role="grid"
            aria-label="Math cell grid"
            aria-rowcount={rows}
            aria-colcount={cols}
          >
            {Array.from({ length: rows }, (_, r) => (
              <div
                key={r}
                className="grid gap-0"
                style={{
                  gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE_PX}px)`,
                  gridTemplateRows: `${CELL_SIZE_PX}px`,
                }}
                role="row"
                aria-rowindex={r + 1}
              >
                {(() => {
                  const frag: ReactNode[] = [];
                  let c = 0;
                  while (c < cols) {
                    const col = c;
                    const i = r * cols + col;
                    const v = cells[i] ?? "";
                    if (!v.length) {
                      const zStack =
                        focusedIdx === i ? 30 : 1;
                      frag.push(
                        <div
                          key={`cell-${r}-${col}`}
                          className="relative box-border border border-sky-200/90 bg-white"
                          style={{
                            gridColumn: `${col + 1} / span 1`,
                            gridRow: 1,
                            zIndex: zStack,
                          }}
                          role="presentation"
                        >
                          <input
                            ref={(el) => {
                              inputRefs.current[i] = el;
                            }}
                            aria-colindex={col + 1}
                            aria-rowindex={r + 1}
                            role="gridcell"
                            inputMode="text"
                            autoComplete="off"
                            spellCheck={false}
                            className="absolute inset-0 box-border w-full border-0 bg-transparent p-0 text-center font-mono text-base leading-none text-neutral-900 outline-none focus:ring-2 focus:ring-sky-500 focus:ring-inset"
                            value=""
                            onChange={(e) =>
                              onCellChange(r, col, e.target.value)
                            }
                            onKeyDown={(e) => onCellKeyDown(e, r, col)}
                            onFocus={() => setFocusedIdx(i)}
                            onBlur={() => {
                              requestAnimationFrame(() => {
                                const active = document.activeElement;
                                const still = inputRefs.current.some(
                                  (el) => el === active
                                );
                                if (!still) setFocusedIdx(null);
                              });
                            }}
                          />
                        </div>
                      );
                      c += 1;
                      continue;
                    }
                    const span = columnSpanFor(v, col, cols);
                    const zStack =
                      focusedIdx === i ? 30 : 8;
                    frag.push(
                      <div
                        key={`cell-${r}-${col}`}
                        className="relative box-border border border-sky-200/90 bg-white"
                        style={{
                          gridColumn: `${col + 1} / span ${span}`,
                          gridRow: 1,
                          zIndex: zStack,
                          minWidth: 0,
                        }}
                        role="presentation"
                      >
                        <input
                          ref={(el) => {
                            inputRefs.current[i] = el;
                          }}
                          aria-colindex={col + 1}
                          aria-colspan={span}
                          aria-rowindex={r + 1}
                          role="gridcell"
                          inputMode="text"
                          autoComplete="off"
                          spellCheck={false}
                          className="absolute inset-0 box-border min-h-0 w-full min-w-0 border-0 bg-transparent p-0 text-center font-mono text-base leading-none text-neutral-900 outline-none focus:ring-2 focus:ring-sky-500 focus:ring-inset"
                          value={v}
                          onChange={(e) =>
                            onCellChange(r, col, e.target.value)
                          }
                          onKeyDown={(e) => onCellKeyDown(e, r, col)}
                          onFocus={() => setFocusedIdx(i)}
                          onBlur={() => {
                            requestAnimationFrame(() => {
                              const active = document.activeElement;
                              const still = inputRefs.current.some(
                                (el) => el === active
                              );
                              if (!still) setFocusedIdx(null);
                            });
                          }}
                        />
                      </div>
                    );
                    c += span;
                  }
                  return frag;
                })()}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 max-w-xl text-xs text-[var(--muted-foreground)]">
          Text wider than one column spans extra columns (like merged cells). If
          that would cover other text, everything to the right reflows. Arrow
          keys at text edges move between segments; Tab / Enter move across /
          down. Backspace on an empty cell trims the previous segment. Ctrl (or
          ⌘) + scroll zooms. Undo / redo: header or ⌘Z / ⌘⇧Z.
        </p>
      </div>
    </div>
  );
}
