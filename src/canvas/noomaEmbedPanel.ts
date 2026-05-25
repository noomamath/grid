import {
  isNoomaEmbeddableElement,
  type ArithmeticBoxState,
  type NoomaBlockType,
  type NoomaEmbeddableCustomData,
} from "@/core/noomaBlocks";

/** Single selected Nooma embed — panel actions apply to this element. */
export type SelectedNoomaEmbed = {
  elementId: string;
  blockType: NoomaBlockType;
  customData: NoomaEmbeddableCustomData;
};

function selectionIsOnlyNoomaEmbeddables(
  appState: { selectedElementIds?: Readonly<Record<string, true>> },
  elements: readonly unknown[]
): boolean {
  const selectedIds = appState.selectedElementIds;
  if (!selectedIds || typeof selectedIds !== "object") return false;

  const selected: unknown[] = [];
  for (const raw of elements) {
    if (!raw || typeof raw !== "object") continue;
    const el = raw as { id?: unknown };
    if (typeof el.id === "string" && selectedIds[el.id]) {
      selected.push(raw);
    }
  }
  if (selected.length === 0) return false;
  return selected.every((raw) =>
    isNoomaEmbeddableElement(raw as { type?: unknown; link?: unknown })
  );
}

/** One selected Nooma embed — used to drive the custom properties panel. */
export function isSameNoomaEmbedSelection(
  a: SelectedNoomaEmbed | null,
  b: SelectedNoomaEmbed | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.elementId === b.elementId && a.blockType === b.blockType;
}

export function getSingleSelectedNoomaEmbed(
  appState: { selectedElementIds?: Readonly<Record<string, true>> },
  elements: readonly unknown[]
): SelectedNoomaEmbed | null {
  if (!selectionIsOnlyNoomaEmbeddables(appState, elements)) return null;

  const selectedIds = appState.selectedElementIds;
  if (!selectedIds) return null;
  const ids = Object.keys(selectedIds);
  if (ids.length !== 1) return null;

  const raw = elements.find(
    (el) =>
      el &&
      typeof el === "object" &&
      (el as { id?: unknown }).id === ids[0]
  );
  if (!raw || typeof raw !== "object") return null;

  const element = raw as {
    id?: unknown;
    link?: unknown;
    customData?: unknown;
  };
  if (!isNoomaEmbeddableElement(element) || typeof element.id !== "string") {
    return null;
  }

  const customDataRaw = element.customData;
  const customData =
    customDataRaw &&
    typeof customDataRaw === "object" &&
    !Array.isArray(customDataRaw)
      ? (customDataRaw as NoomaEmbeddableCustomData)
      : ({ noomaBlockType: "arithmetic" } satisfies NoomaEmbeddableCustomData);

  const blockTypeRaw = (customData as { noomaBlockType?: string }).noomaBlockType;
  const blockType: NoomaBlockType =
    blockTypeRaw === "algebra" ? "algebra" : "arithmetic";

  return {
    elementId: element.id,
    blockType,
    customData,
  };
}

export function getArithmeticStateFromSelection(
  selection: SelectedNoomaEmbed
): ArithmeticBoxState | undefined {
  const data = selection.customData;
  if (
    data.noomaBlockType !== "arithmetic" &&
    (data as { noomaBlockType?: string }).noomaBlockType !== "arithmetic-grid"
  ) {
    return undefined;
  }
  if (
    "arithmetic" in data &&
    data.arithmetic &&
    typeof data.arithmetic === "object"
  ) {
    return data.arithmetic as ArithmeticBoxState;
  }
  return undefined;
}
