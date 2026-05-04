"use client";

import {
  createTLStore,
  getSnapshot,
  loadSnapshot,
  type TLStore,
} from "@tldraw/editor";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DefaultQuickActions,
  Tldraw,
  TldrawUiMenuActionItem,
  defaultShapeUtils,
  useCanRedo,
  useCanUndo,
  type TLUiOverrides,
} from "tldraw";
import "tldraw/tldraw.css";

import { loadGuestDocument, saveGuestSnapshot } from "@/core/db";
import { GRID_SIZE_PX } from "@/core/constants";

import { NoomaLineGrid, NoomaMathShapeUtil } from "./NoomaMathShape";
import { NoomaMathTool } from "./NoomaMathTool";

const SAVE_DEBOUNCE_MS = 450;

const shapeUtils = [...defaultShapeUtils, NoomaMathShapeUtil];

const uiOverrides: TLUiOverrides = {
  tools(editor, tools) {
    return {
      ...tools,
      "nooma-math": {
        id: "nooma-math",
        label: "Math block",
        kbd: "m",
        readonlyOk: false,
        icon: "geo",
        onSelect() {
          editor.setCurrentTool("nooma-math");
        },
      },
    };
  },
};

function NoomaQuickActions() {
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  return (
    <DefaultQuickActions>
      <TldrawUiMenuActionItem actionId="undo" disabled={!canUndo} />
      <TldrawUiMenuActionItem actionId="redo" disabled={!canRedo} />
    </DefaultQuickActions>
  );
}

export function NoomaGridEditor() {
  const [store, setStore] = useState<TLStore | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await loadGuestDocument();
      if (cancelled) return;

      const initialSnapshot = row?.snapshot;
      const newStore = createTLStore({
        shapeUtils,
      });

      if (
        initialSnapshot &&
        typeof initialSnapshot === "object" &&
        Object.keys(initialSnapshot as object).length > 0
      ) {
        loadSnapshot(newStore, initialSnapshot as Parameters<
          typeof loadSnapshot
        >[1]);
      }

      setStore(newStore);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!store) return;

    const scheduleSave = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveGuestSnapshot(getSnapshot(store));
      }, SAVE_DEBOUNCE_MS);
    };

    const unsub = store.listen(scheduleSave);

    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [store]);

  const components = useMemo(
    () => ({
      Grid: NoomaLineGrid,
      InFrontOfTheCanvas: null,
      ActionsMenu: null,
      QuickActions: NoomaQuickActions,
      SharePanel: null,
      StylePanel: null,
    }),
    []
  );

  if (!store) {
    return (
      <div
        className="flex h-[100dvh] w-full items-center justify-center bg-[var(--background)] text-[var(--foreground)]"
        role="status"
        aria-live="polite"
      >
        Loading Nooma Grid…
      </div>
    );
  }

  return (
    <div className="tldraw-wrapper relative h-[100dvh] w-full">
      <Tldraw
        store={store}
        shapeUtils={shapeUtils}
        tools={[NoomaMathTool]}
        overrides={uiOverrides}
        components={components}
        onMount={(editor) => {
          editor.updateDocumentSettings({
            gridSize: GRID_SIZE_PX,
          });
          editor.updateInstanceState({
            isGridMode: true,
          });
          editor.user.updateUserPreferences({
            isSnapMode: true,
            enhancedA11yMode: true,
          });
        }}
      />
    </div>
  );
}
