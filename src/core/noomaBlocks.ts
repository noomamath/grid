/** Prefix for Excalidraw embed `link` values that host Nooma block content. */
export const NOOMA_EMBED_LINK_PREFIX = "nooma://";

export type NoomaBlockType = "arithmetic" | "algebra";

export const ARITHMETIC_BOX_ROW_HEIGHT = 40;
export const ARITHMETIC_BOX_VERTICAL_PADDING = 16;

export type ArithmeticAnnotation = {
  slash?: boolean;
  carry?: string;
};

export type ArithmeticBoxState = {
  version: 1;
  /** The final row is always the answer row. */
  rows: string[];
  /** Keys are `${rowIndex}:${placeColumnFromRight}`. */
  annotations: Record<string, ArithmeticAnnotation>;
};

export const DEFAULT_ARITHMETIC_BOX_STATE: ArithmeticBoxState = {
  version: 1,
  rows: ["", "", ""],
  annotations: {},
};

export function arithmeticBoxHeightForRows(rowCount: number): number {
  return rowCount * ARITHMETIC_BOX_ROW_HEIGHT + ARITHMETIC_BOX_VERTICAL_PADDING;
}

/** Identifies our embeddable frames and any Nooma-owned block state. */
export type NoomaEmbeddableCustomData =
  | { noomaBlockType: "arithmetic"; arithmetic?: ArithmeticBoxState }
  | { noomaBlockType: "algebra" };

export function noomaEmbedLinkForBlock(type: NoomaBlockType): string {
  return `${NOOMA_EMBED_LINK_PREFIX}${type}`;
}
