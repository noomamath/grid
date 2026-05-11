"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import {
  ARITHMETIC_BOX_ROW_HEIGHT,
  DEFAULT_ARITHMETIC_BOX_STATE,
  arithmeticBoxHeightForRows,
  type ArithmeticAnnotation,
  type ArithmeticBoxState,
} from "@/core/noomaBlocks";
import { cn } from "@/lib/utils";

const DIGIT_CELL_WIDTH = 28;
const OPERATOR_COL_WIDTH = 24;
const MIN_VISIBLE_PLACES = 3;

type ArithmeticBoxEmbedProps = {
  state?: ArithmeticBoxState;
  elementHeight: number;
  onChange: (nextState: ArithmeticBoxState) => void;
};

type ActiveCell = {
  row: number;
  place: number;
};

function annotationKey(row: number, place: number): string {
  return `${row}:${place}`;
}

function cloneState(state: ArithmeticBoxState): ArithmeticBoxState {
  return {
    version: 1,
    rows: [...state.rows],
    annotations: { ...state.annotations },
    ...(state.answerByPlace
      ? { answerByPlace: { ...state.answerByPlace } }
      : {}),
  };
}

function normalizeAnnotation(value: unknown): ArithmeticAnnotation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const next: ArithmeticAnnotation = {};
  if (raw.slash === true) next.slash = true;
  if (typeof raw.carry === "string" && /^\d$/.test(raw.carry)) {
    next.carry = raw.carry;
  }
  return next.slash || next.carry ? next : null;
}

export function normalizeArithmeticBoxState(
  state: ArithmeticBoxState | undefined
): ArithmeticBoxState {
  const rows =
    state?.version === 1 && Array.isArray(state.rows)
      ? state.rows.map((row) =>
          typeof row === "string" ? row.replace(/\D/g, "") : ""
        )
      : [...DEFAULT_ARITHMETIC_BOX_STATE.rows];

  while (rows.length < DEFAULT_ARITHMETIC_BOX_STATE.rows.length) {
    rows.push("");
  }

  const answerIdx = rows.length - 1;

  let answerByPlace: Record<string, string> | undefined;

  if (
    state?.version === 1 &&
    state.answerByPlace &&
    typeof state.answerByPlace === "object" &&
    !Array.isArray(state.answerByPlace)
  ) {
    answerByPlace = {};
    for (const [k, v] of Object.entries(state.answerByPlace)) {
      if (!/^\d+$/.test(k)) continue;
      if (typeof v === "string" && /^\d$/.test(v)) {
        answerByPlace[k] = v;
      }
    }
    if (Object.keys(answerByPlace).length === 0) {
      answerByPlace = undefined;
    }
  }

  if (!answerByPlace && rows[answerIdx].length > 0) {
    const compact = rows[answerIdx];
    answerByPlace = {};
    for (let i = 0; i < compact.length; i++) {
      const ch = compact[i];
      if (!/^\d$/.test(ch)) continue;
      const place = compact.length - 1 - i;
      answerByPlace[String(place)] = ch;
    }
    rows[answerIdx] = "";
    if (Object.keys(answerByPlace).length === 0) {
      answerByPlace = undefined;
    }
  }

  if (answerByPlace && rows[answerIdx].length > 0) {
    rows[answerIdx] = "";
  }

  const annotations: Record<string, ArithmeticAnnotation> = {};
  const rawAnnotations =
    state?.version === 1 &&
    state.annotations &&
    typeof state.annotations === "object" &&
    !Array.isArray(state.annotations)
      ? state.annotations
      : {};

  for (const [key, value] of Object.entries(rawAnnotations)) {
    if (!/^\d+:\d+$/.test(key)) continue;
    const annotation = normalizeAnnotation(value);
    if (annotation) annotations[key] = annotation;
  }

  return {
    version: 1,
    rows,
    annotations,
    ...(answerByPlace ? { answerByPlace } : {}),
  };
}

export function ArithmeticBoxEmbed({
  state,
  elementHeight,
  onChange,
}: ArithmeticBoxEmbedProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<ActiveCell>({ row: 0, place: 0 });
  const [carryMode, setCarryMode] = useState(false);

  const normalizedState = useMemo(() => normalizeArithmeticBoxState(state), [state]);
  const rows = normalizedState.rows;
  const answerRowIndex = rows.length - 1;
  const lastAddendRowIndex = rows.length - 2;
  const activeCell = {
    row: Math.min(active.row, answerRowIndex),
    place: active.place,
  };

  const visiblePlaces = useMemo(() => {
    let maxPlace = Math.max(MIN_VISIBLE_PLACES, activeCell.place + 1);
    for (const row of rows) {
      maxPlace = Math.max(maxPlace, row.length);
    }
    for (const key of Object.keys(normalizedState.annotations)) {
      const [, placeRaw] = key.split(":");
      const place = Number(placeRaw);
      if (Number.isInteger(place)) maxPlace = Math.max(maxPlace, place + 1);
    }
    for (const key of Object.keys(normalizedState.answerByPlace ?? {})) {
      const place = Number(key);
      if (Number.isInteger(place)) maxPlace = Math.max(maxPlace, place + 1);
    }
    return maxPlace;
  }, [activeCell.place, normalizedState.annotations, normalizedState.answerByPlace, rows]);

  useEffect(() => {
    const minimumHeight = arithmeticBoxHeightForRows(rows.length);
    if (elementHeight < minimumHeight) {
      onChange(normalizedState);
    }
  }, [elementHeight, normalizedState, onChange, rows.length]);

  const applyState = useCallback(
    (mutate: (draft: ArithmeticBoxState) => void) => {
      const next = cloneState(normalizedState);
      mutate(next);
      onChange(next);
    },
    [normalizedState, onChange]
  );

  const updateAnnotation = useCallback(
    (
      row: number,
      place: number,
      update: (current: ArithmeticAnnotation) => ArithmeticAnnotation
    ) => {
      applyState((draft) => {
        const key = annotationKey(row, place);
        const next = update({ ...(draft.annotations[key] ?? {}) });
        if (next.slash || next.carry) {
          draft.annotations[key] = next;
        } else {
          delete draft.annotations[key];
        }
      });
    },
    [applyState]
  );

  const focusBox = useCallback(() => {
    requestAnimationFrame(() => boxRef.current?.focus());
  }, []);

  const onCellPointerDown = useCallback(
    (event: PointerEvent, row: number, place: number) => {
      event.stopPropagation();
      setActive({ row, place });
      focusBox();
    },
    [focusBox]
  );

  const onAnswerRowPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const rowWidth = rect.width;
      const gridContentWidth =
        OPERATOR_COL_WIDTH + visiblePlaces * DIGIT_CELL_WIDTH;
      const gridStartX = Math.max(0, rowWidth - gridContentWidth);
      const relativeX = x - gridStartX;

      if (relativeX < 0) {
        setActive({ row: answerRowIndex, place: visiblePlaces - 1 });
        focusBox();
        return;
      }

      const offsetFromDigits = relativeX - OPERATOR_COL_WIDTH;
      if (offsetFromDigits < 0) {
        focusBox();
        return;
      }

      let col = Math.floor(offsetFromDigits / DIGIT_CELL_WIDTH);
      if (col >= visiblePlaces) col = visiblePlaces - 1;
      if (col < 0) col = 0;
      const place = visiblePlaces - col - 1;
      setActive({ row: answerRowIndex, place });
      focusBox();
    },
    [answerRowIndex, focusBox, visiblePlaces]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.stopPropagation();

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        const digit = event.key;
        if (carryMode) {
          updateAnnotation(activeCell.row, activeCell.place, (current) => ({
            ...current,
            carry: digit,
          }));
          setCarryMode(false);
          return;
        }
        if (activeCell.row === answerRowIndex) {
          applyState((draft) => {
            const last = draft.rows.length - 1;
            if (!draft.answerByPlace) draft.answerByPlace = {};
            draft.answerByPlace[String(activeCell.place)] = digit;
            draft.rows[last] = "";
          });
          return;
        }
        applyState((draft) => {
          draft.rows[activeCell.row] = `${draft.rows[activeCell.row] ?? ""}${digit}`;
        });
        setActive((current) => ({ ...current, place: 0 }));
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        if (carryMode) {
          updateAnnotation(activeCell.row, activeCell.place, (current) => {
            const next = { ...current };
            delete next.carry;
            return next;
          });
          setCarryMode(false);
          return;
        }
        if (activeCell.row === answerRowIndex) {
          applyState((draft) => {
            const last = draft.rows.length - 1;
            const p = String(activeCell.place);
            if (draft.answerByPlace?.[p]) {
              const next = { ...draft.answerByPlace };
              delete next[p];
              draft.answerByPlace =
                Object.keys(next).length > 0 ? next : undefined;
            }
            draft.rows[last] = "";
          });
          return;
        }
        applyState((draft) => {
          const current = draft.rows[activeCell.row] ?? "";
          draft.rows[activeCell.row] = current.slice(0, -1);
        });
        setActive((current) => ({ ...current, place: 0 }));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((current) => ({
          ...current,
          row: Math.max(0, current.row - 1),
        }));
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((current) => ({
          ...current,
          row: Math.min(answerRowIndex, current.row + 1),
        }));
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActive((current) => ({ ...current, place: current.place + 1 }));
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActive((current) => ({
          ...current,
          place: Math.max(0, current.place - 1),
        }));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (activeCell.row !== lastAddendRowIndex) return;
        const insertedRowIndex = answerRowIndex;
        applyState((draft) => {
          draft.rows.splice(insertedRowIndex, 0, "");
        });
        setActive({ row: insertedRowIndex, place: 0 });
        return;
      }

      if (event.key === "\\") {
        event.preventDefault();
        updateAnnotation(activeCell.row, activeCell.place, (current) => ({
          ...current,
          slash: !current.slash,
        }));
      }
    },
    [
      activeCell.place,
      activeCell.row,
      answerRowIndex,
      applyState,
      carryMode,
      lastAddendRowIndex,
      updateAnnotation,
    ]
  );

  const gridTemplateColumns = `${OPERATOR_COL_WIDTH}px repeat(${visiblePlaces}, ${DIGIT_CELL_WIDTH}px)`;

  return (
    <div
      ref={boxRef}
      className="nooma-math-card nooma-arithmetic-card box-border flex h-full w-full flex-col overflow-hidden p-2 font-mono text-neutral-950 outline-none"
      role="application"
      aria-label="Arithmetic card"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="mb-1 flex shrink-0 items-center justify-between gap-2 font-sans text-[10px] text-neutral-500">
        <span className="min-w-0 flex-1 leading-snug">
          {carryMode
            ? "Type a carry digit"
            : "Drag blank space; click digits to edit"}
        </span>
        <button
          type="button"
          className={cn(
            "shrink-0 cursor-pointer rounded border px-1.5 py-0.5 text-[10px]",
            carryMode
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-neutral-200 bg-neutral-50 text-neutral-600"
          )}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setCarryMode((enabled) => !enabled);
            focusBox();
          }}
        >
          Carry
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        {rows.map((row, rowIndex) => {
          const isBarRow = rowIndex === lastAddendRowIndex;
          return (
            <div
              key={rowIndex}
              className={cn(
                "flex w-full justify-end",
                rowIndex === answerRowIndex && "nooma-arithmetic-answer-row",
                isBarRow && "mb-[4px]"
              )}
              onPointerDown={
                rowIndex === answerRowIndex
                  ? onAnswerRowPointerDown
                  : undefined
              }
              role="row"
              aria-label={
                rowIndex === answerRowIndex
                  ? "Answer row"
                  : `Addend row ${rowIndex + 1}`
              }
            >
              <div
                className={cn(
                  "grid w-max justify-end",
                  isBarRow &&
                    "box-border border-b-2 border-neutral-950 pb-[4px]"
                )}
                style={{
                  gridTemplateColumns,
                  height: ARITHMETIC_BOX_ROW_HEIGHT,
                }}
              >
                <div className="flex items-center justify-center text-xl leading-none">
                  {isBarRow ? "+" : ""}
                </div>
                {Array.from({ length: visiblePlaces }, (_, index) => {
                const place = visiblePlaces - index - 1;
                const digitIndex = row.length - place - 1;
                const digit =
                  rowIndex === answerRowIndex
                    ? (normalizedState.answerByPlace?.[String(place)] ?? "")
                    : digitIndex >= 0
                      ? row[digitIndex]
                      : "";
                const annotation =
                  normalizedState.annotations[annotationKey(rowIndex, place)];
                const isActive =
                  activeCell.row === rowIndex && activeCell.place === place;

                return (
                  <button
                    key={`${rowIndex}:${place}`}
                    type="button"
                    className={cn(
                      "relative flex cursor-text items-center justify-center bg-transparent text-2xl leading-none outline-none select-none transition-colors",
                      !(carryMode && isActive) && "hover:bg-neutral-200/90",
                      isActive && "rounded-sm ring-2 ring-sky-500 ring-inset",
                      carryMode &&
                        isActive &&
                        "bg-red-50 ring-red-400 hover:bg-red-200/90"
                    )}
                    style={{ width: DIGIT_CELL_WIDTH }}
                    aria-label={`Row ${rowIndex + 1}, place ${place + 1}`}
                    onPointerDown={(event) =>
                      onCellPointerDown(event, rowIndex, place)
                    }
                  >
                    {annotation?.carry ? (
                      <span className="absolute top-0 right-0 text-[11px] leading-none font-semibold text-red-600">
                        {annotation.carry}
                      </span>
                    ) : null}
                    {annotation?.slash ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 left-1/2 h-0.5 w-6 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-red-500"
                      />
                    ) : null}
                    <span className="relative z-10 inline-flex items-center justify-center gap-0.5">
                      {digit ? <span>{digit}</span> : null}
                      {isActive && !digit ? (
                        <span aria-hidden className="nooma-arithmetic-caret" />
                      ) : null}
                    </span>
                  </button>
                );
              })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
