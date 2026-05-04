"use client";

// Future: optional freehand draw mode (e.g. canvas layer or embedded vector editor).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
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

export function CellGridEditor() {
  const rows = CELL_GRID_ROWS;
  const cols = CELL_GRID_COLS;
  const total = rows * cols;

  const [hydrated, setHydrated] = useState(false);
  const [cells, setCells] = useState<string[]>(() => emptyCells(rows, cols));
  const [scale, setScale] = useState(1);
  const [stackUi, setStackUi] = useState({ past: 0, future: 0 });

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
      const idx = r * cols + c;
      const char =
        raw.length === 0 ? "" : (raw.slice(-1) as string).slice(0, 1);
      const next = cellsRef.current.slice();
      next[idx] = char;
      applyUserCells(next);
      if (char.length === 1) {
        if (c < cols - 1) focusCell(r * cols + c + 1);
        else if (r < rows - 1) focusCell((r + 1) * cols);
      }
    },
    [applyUserCells, cols, rows, focusCell]
  );

  const onCellKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
      const idx = r * cols + c;

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

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (c < cols - 1) focusCell(r * cols + c + 1);
        else if (r < rows - 1) focusCell((r + 1) * cols);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (c > 0) focusCell(r * cols + c - 1);
        else if (r > 0) focusCell((r - 1) * cols + cols - 1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (r < rows - 1) focusCell((r + 1) * cols + c);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (r > 0) focusCell((r - 1) * cols + c);
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          if (c > 0) focusCell(r * cols + c - 1);
          else if (r > 0) focusCell((r - 1) * cols + cols - 1);
        } else {
          if (c < cols - 1) focusCell(r * cols + c + 1);
          else if (r < rows - 1) focusCell((r + 1) * cols);
        }
        return;
      }

      if (e.key === "Backspace") {
        const cur = cellsRef.current[idx] ?? "";
        if (cur.length > 0) return;
        e.preventDefault();
        if (c > 0) {
          const p = r * cols + c - 1;
          const next = cellsRef.current.slice();
          next[p] = "";
          applyUserCells(next);
          focusCell(p);
        } else if (r > 0) {
          const p = (r - 1) * cols + cols - 1;
          const next = cellsRef.current.slice();
          next[p] = "";
          applyUserCells(next);
          focusCell(p);
        }
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (r < rows - 1) focusCell((r + 1) * cols + c);
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
            className="inline-grid gap-0 rounded-md border border-sky-300/80 bg-white shadow-sm"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${CELL_SIZE_PX}px)`,
              gridTemplateRows: `repeat(${rows}, ${CELL_SIZE_PX}px)`,
            }}
            role="grid"
            aria-label="Math cell grid"
            aria-rowcount={rows}
            aria-colcount={cols}
          >
            {Array.from({ length: total }, (_, i) => {
              const r = Math.floor(i / cols);
              const c = i % cols;
              return (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  aria-rowindex={r + 1}
                  aria-colindex={c + 1}
                  role="gridcell"
                  maxLength={1}
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  className="box-border border border-sky-200/90 bg-white text-center font-mono text-sm text-neutral-900 outline-none focus:z-10 focus:ring-2 focus:ring-sky-500 focus:ring-inset"
                  style={{
                    width: CELL_SIZE_PX,
                    height: CELL_SIZE_PX,
                  }}
                  value={cells[i] ?? ""}
                  onChange={(e) => onCellChange(r, c, e.target.value)}
                  onKeyDown={(e) => onCellKeyDown(e, r, c)}
                />
              );
            })}
          </div>
        </div>
        <p className="mt-3 max-w-xl text-xs text-[var(--muted-foreground)]">
          Type one character per cell; focus advances to the right. Use arrow
          keys or Tab to move. Backspace on an empty cell clears the previous
          cell. Hold Ctrl (or ⌘) and scroll to zoom. Undo / redo: buttons or ⌘Z
          / ⌘⇧Z.
        </p>
      </div>
    </div>
  );
}
