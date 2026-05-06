/** Prefix for Excalidraw embed `link` values that host Nooma block content. */
export const NOOMA_EMBED_LINK_PREFIX = "nooma://";

export type NoomaBlockType = "arithmetic" | "algebra";

/** Identifies our embeddable frames; no block state yet (blank boxes). */
export type NoomaEmbeddableCustomData =
  | { noomaBlockType: "arithmetic" }
  | { noomaBlockType: "algebra" };

export function noomaEmbedLinkForBlock(type: NoomaBlockType): string {
  return `${NOOMA_EMBED_LINK_PREFIX}${type}`;
}
