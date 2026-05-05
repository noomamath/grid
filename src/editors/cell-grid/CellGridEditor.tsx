"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CELL_GRID_COLS,
  CELL_GRID_ROWS,
} from "@/core/constants";
import {
  loadGuestDocument,
  saveGuestCellGrid,
  type CellGridDocument,
} from "@/core/db";

import { ArithmeticGridBlock } from "./ArithmeticGridBlock";

const SAVE_DEBOUNCE_MS = 350;

function emptyCells(rows: number, cols: number): string[] {
  return Array.from({ length: rows * cols }, () => "");
}

function cloneCells(cells: string[]): string[] {
  return cells.slice();
}

function toDoc(rows: number, cols: number, cells: string[]): CellGridDocument {
  return { version: 1, rows, cols, cells: cloneCells(cells) };
}

/** Full-page grid editor with local persistence (legacy / optional standalone surface). */
export function CellGridEditor() {
  const rows = CELL_GRID_ROWS;
  const cols = CELL_GRID_COLS;
  const total = rows * cols;

  const [hydrated, setHydrated] = useState(false);
  const [doc, setDoc] = useState<CellGridDocument>(() =>
    toDoc(rows, cols, emptyCells(rows, cols))
  );

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const scheduleSave = useCallback(
    (next: CellGridDocument) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void saveGuestCellGrid(next);
      }, SAVE_DEBOUNCE_MS);
    },
    []
  );

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
        setDoc(g);
      } else {
        setDoc(toDoc(rows, cols, emptyCells(rows, cols)));
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, cols, total]);

  useEffect(() => {
    if (!hydrated) return;
    scheduleSave(doc);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [doc, hydrated, scheduleSave]);

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
      <ArithmeticGridBlock
        initialGrid={doc}
        onGridChange={setDoc}
        showHelpText
        showToolbar
      />
    </div>
  );
}
