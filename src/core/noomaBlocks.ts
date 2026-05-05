import type { CellGridDocument } from "@/core/db";
import {
  CELL_GRID_COLS,
  CELL_GRID_ROWS,
} from "@/core/constants";

/** Prefix for Excalidraw embed `link` values that host Nooma block content. */
export const NOOMA_EMBED_LINK_PREFIX = "nooma://";

export type NoomaBlockType = "arithmetic-grid" | "algebra";

export type AlgebraBlockPayload = {
  version: 1;
  /** Placeholder for future algebra UX */
  note: string;
};

export type NoomaEmbeddableCustomData =
  | {
      noomaBlockType: "arithmetic-grid";
      payload: CellGridDocument;
    }
  | {
      noomaBlockType: "algebra";
      payload: AlgebraBlockPayload;
    };

export function noomaEmbedLinkForBlock(type: NoomaBlockType): string {
  return `${NOOMA_EMBED_LINK_PREFIX}${type}`;
}

export function emptyArithmeticGridDocument(): CellGridDocument {
  const total = CELL_GRID_ROWS * CELL_GRID_COLS;
  return {
    version: 1,
    rows: CELL_GRID_ROWS,
    cols: CELL_GRID_COLS,
    cells: Array.from({ length: total }, () => ""),
  };
}

export function defaultAlgebraPayload(): AlgebraBlockPayload {
  return { version: 1, note: "" };
}
