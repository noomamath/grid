"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  addArithmeticAddendRow,
  canRemoveDeletableArithmeticRow,
  removeLastDeletableArithmeticRow,
} from "@/editors/cell-grid/arithmeticBoxActions";
import { normalizeArithmeticBoxState } from "@/editors/cell-grid/ArithmeticBoxEmbed";
import {
  DEFAULT_ARITHMETIC_BOX_STATE,
  type ArithmeticBoxState,
} from "@/core/noomaBlocks";

import {
  getArithmeticStateFromSelection,
  type SelectedNoomaEmbed,
} from "./noomaEmbedPanel";

type NoomaEmbedPropertiesPanelProps = {
  selection: SelectedNoomaEmbed;
  onArithmeticChange: (nextState: ArithmeticBoxState) => void;
};

function ArithmeticPropertiesSection({
  selection,
  onArithmeticChange,
}: NoomaEmbedPropertiesPanelProps) {
  const rawState =
    getArithmeticStateFromSelection(selection) ?? DEFAULT_ARITHMETIC_BOX_STATE;
  const state = normalizeArithmeticBoxState(rawState);
  const canRemoveRow = canRemoveDeletableArithmeticRow(state);

  const apply = (next: ArithmeticBoxState) => {
    onArithmeticChange(next);
  };

  return (
    <div className="nooma-embed-properties-section">
      <h3 aria-hidden="true">
        Arithmetic
      </h3>
      <div className="buttonList nooma-embed-properties-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start font-normal"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => apply(addArithmeticAddendRow(state))}
        >
          <Plus aria-hidden />
          Add row
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start font-normal"
          disabled={!canRemoveRow}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const next = removeLastDeletableArithmeticRow(state);
            if (next) apply(next);
          }}
        >
          <Minus aria-hidden />
          Remove empty row
        </Button>
      </div>
    </div>
  );
}

export function NoomaEmbedPropertiesPanel({
  selection,
  onArithmeticChange,
}: NoomaEmbedPropertiesPanelProps) {
  const blockType =
    selection.blockType === "arithmetic" ||
    (selection.customData as { noomaBlockType?: string }).noomaBlockType ===
      "arithmetic-grid"
      ? "arithmetic"
      : selection.blockType;

  return (
    <div
      className="nooma-embed-properties-panel"
      role="region"
      aria-label="Block properties"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {blockType === "arithmetic" ? (
        <ArithmeticPropertiesSection
          selection={selection}
          onArithmeticChange={onArithmeticChange}
        />
      ) : (
        <div className="nooma-embed-properties-section">
          <h3 aria-hidden="true">
            Algebra
          </h3>
          <p className="text-xs text-neutral-500">
            Custom panel controls for algebra blocks can go here.
          </p>
        </div>
      )}
    </div>
  );
}
