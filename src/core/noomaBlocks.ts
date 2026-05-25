/** Prefix for Excalidraw embed `link` values that host Nooma block content. */
export const NOOMA_EMBED_LINK_PREFIX = "nooma://";

export type NoomaBlockType = "arithmetic" | "algebra";

export const ARITHMETIC_BOX_ROW_HEIGHT = 40;

/**
 * Vertical space outside the digit rows: card `p-2`, hint + Carry (hint wraps on
 * narrow embeds), small slack. Used so minimum embed height never stacks rows
 * under the header.
 */
export const ARITHMETIC_EMBED_VERTICAL_CHROME = 72;

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
  /**
   * Addend rows (every row except the last): digit per place column (place 0 = ones).
   * When present for a row, that row’s `rows[i]` digit string is left empty; digits are
   * edited in-place like the answer row instead of compact right-pushed strings.
   */
  addendDigitsByPlace?: Record<string, Record<string, string>>;
  /**
   * Answer row only: digit per place column (place 0 = ones / rightmost column).
   * When set, answer digits are edited in-place without compact right-aligned push behavior.
   */
  answerByPlace?: Record<string, string>;
};

export const DEFAULT_ARITHMETIC_BOX_STATE: ArithmeticBoxState = {
  version: 1,
  rows: ["", "", ""],
  annotations: {},
};

export function arithmeticBoxHeightForRows(rowCount: number): number {
  return rowCount * ARITHMETIC_BOX_ROW_HEIGHT + ARITHMETIC_EMBED_VERTICAL_CHROME;
}

/** Identifies our embeddable frames and any Nooma-owned block state. */
export type NoomaEmbeddableCustomData =
  | { noomaBlockType: "arithmetic"; arithmetic?: ArithmeticBoxState }
  | { noomaBlockType: "algebra" };

export function noomaEmbedLinkForBlock(type: NoomaBlockType): string {
  return `${NOOMA_EMBED_LINK_PREFIX}${type}`;
}

export function isNoomaEmbeddableElement(
  element: { type?: unknown; link?: unknown; customData?: unknown }
): boolean {
  if (element.type !== "embeddable") return false;
  if (
    typeof element.link === "string" &&
    element.link.startsWith(NOOMA_EMBED_LINK_PREFIX)
  ) {
    return true;
  }
  const customData = element.customData;
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) {
    return false;
  }
  const blockType = (customData as { noomaBlockType?: unknown }).noomaBlockType;
  return (
    blockType === "arithmetic" ||
    blockType === "algebra" ||
    blockType === "arithmetic-grid"
  );
}
