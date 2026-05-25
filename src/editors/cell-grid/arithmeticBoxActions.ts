import {
  DEFAULT_ARITHMETIC_BOX_STATE,
  type ArithmeticAnnotation,
  type ArithmeticBoxState,
} from "@/core/noomaBlocks";

import { normalizeArithmeticBoxState } from "./ArithmeticBoxEmbed";

const MIN_ARITHMETIC_ROWS = DEFAULT_ARITHMETIC_BOX_STATE.rows.length;

function cloneState(state: ArithmeticBoxState): ArithmeticBoxState {
  return {
    version: 1,
    rows: [...state.rows],
    annotations: { ...state.annotations },
    ...(state.addendDigitsByPlace
      ? {
          addendDigitsByPlace: Object.fromEntries(
            Object.entries(state.addendDigitsByPlace).map(([rowKey, m]) => [
              rowKey,
              { ...m },
            ])
          ),
        }
      : {}),
    ...(state.answerByPlace
      ? { answerByPlace: { ...state.answerByPlace } }
      : {}),
  };
}

function addendRowHasDigits(draft: ArithmeticBoxState, rowIndex: number): boolean {
  const rk = String(rowIndex);
  const inner = draft.addendDigitsByPlace?.[rk];
  if (inner && Object.keys(inner).length > 0) return true;
  return (draft.rows[rowIndex] ?? "").replace(/\D/g, "").length > 0;
}

function rowHasAnnotationsOnRow(
  draft: ArithmeticBoxState,
  rowIndex: number
): boolean {
  const prefix = `${rowIndex}:`;
  return Object.keys(draft.annotations).some((k) => k.startsWith(prefix));
}

function canDeleteEmptyAddendRow(
  draft: ArithmeticBoxState,
  rowIndex: number,
  answerRowIndex: number
): boolean {
  if (draft.rows.length <= MIN_ARITHMETIC_ROWS) return false;
  if (rowIndex === answerRowIndex) return false;
  if (addendRowHasDigits(draft, rowIndex)) return false;
  if (rowHasAnnotationsOnRow(draft, rowIndex)) return false;
  return true;
}

function reindexAfterDeletingRow(
  draft: ArithmeticBoxState,
  deletedRow: number
): void {
  const nextAnn: Record<string, ArithmeticAnnotation> = {};
  for (const [key, ann] of Object.entries(draft.annotations)) {
    const [rs, place] = key.split(":");
    const r = Number(rs);
    if (!Number.isInteger(r)) continue;
    if (r === deletedRow) continue;
    const newR = r > deletedRow ? r - 1 : r;
    nextAnn[`${newR}:${place}`] = ann;
  }
  draft.annotations = nextAnn;

  if (!draft.addendDigitsByPlace) return;
  const nextMap: Record<string, Record<string, string>> = {};
  for (const [rk, inner] of Object.entries(draft.addendDigitsByPlace)) {
    const r = Number(rk);
    if (!Number.isInteger(r)) continue;
    if (r === deletedRow) continue;
    const newR = r > deletedRow ? r - 1 : r;
    nextMap[String(newR)] = { ...inner };
  }
  draft.addendDigitsByPlace =
    Object.keys(nextMap).length > 0 ? nextMap : undefined;
}

/** Inserts a blank addend row above the answer row (same as Enter on the bottom addend). */
export function addArithmeticAddendRow(
  state: ArithmeticBoxState
): ArithmeticBoxState {
  const draft = cloneState(normalizeArithmeticBoxState(state));
  const answerIdx = draft.rows.length - 1;
  draft.rows.splice(answerIdx, 0, "");
  return draft;
}

export function canRemoveDeletableArithmeticRow(
  state: ArithmeticBoxState
): boolean {
  const normalized = normalizeArithmeticBoxState(state);
  const answerIdx = normalized.rows.length - 1;
  for (let row = answerIdx - 1; row >= 0; row--) {
    if (canDeleteEmptyAddendRow(normalized, row, answerIdx)) return true;
  }
  return false;
}

/** Removes the lowest empty addend row that is allowed to be deleted. */
export function removeLastDeletableArithmeticRow(
  state: ArithmeticBoxState
): ArithmeticBoxState | null {
  const normalized = normalizeArithmeticBoxState(state);
  const answerIdx = normalized.rows.length - 1;
  for (let row = answerIdx - 1; row >= 0; row--) {
    if (!canDeleteEmptyAddendRow(normalized, row, answerIdx)) continue;
    const draft = cloneState(normalized);
    draft.rows.splice(row, 1);
    reindexAfterDeletingRow(draft, row);
    return draft;
  }
  return null;
}
