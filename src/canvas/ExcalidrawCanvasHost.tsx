"use client";

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  newElementWith,
  serializeAsJSON,
} from "@excalidraw/excalidraw";

import "@excalidraw/excalidraw/index.css";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";

type ExcalidrawAPI = Parameters<
  NonNullable<ComponentProps<typeof Excalidraw>["excalidrawAPI"]>
>[0];

/**
 * Shape passed to `<Excalidraw initialData={...} />` — the component runs `restore()`
 * internally, so we must not pre-call `restore()` here (avoids corrupt/double restore).
 * Arrays/objects must never be undefined or Excalidraw may throw (e.g. `.length`).
 */
type SceneBootstrap = {
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

type ExcalidrawOnChange = NonNullable<
  ComponentProps<typeof Excalidraw>["onChange"]
>;

type SerializeElementsArg = Parameters<typeof serializeAsJSON>[0];

type RenderEmbeddableImpl = NonNullable<
  ComponentProps<typeof Excalidraw>["renderEmbeddable"]
>;

type ExcalidrawElementSkeletonInput = NonNullable<
  Parameters<typeof convertToExcalidrawElements>[0]
>[number];

import {
  CELL_GRID_COLS,
  CELL_GRID_ROWS,
  CELL_SIZE_PX,
} from "@/core/constants";
import type { CellGridDocument } from "@/core/db";
import {
  loadGuestDocument,
  saveGuestCanvasDocument,
} from "@/core/db";
import {
  defaultAlgebraPayload,
  emptyArithmeticGridDocument,
  type AlgebraBlockPayload,
  NOOMA_EMBED_LINK_PREFIX,
  noomaEmbedLinkForBlock,
  type NoomaEmbeddableCustomData,
} from "@/core/noomaBlocks";
import { ArithmeticGridBlock } from "@/editors/cell-grid/ArithmeticGridBlock";

const SAVE_DEBOUNCE_MS = 350;

/**
 * `convertToExcalidrawElements` does **not** call `newEmbeddableElement` for type
 * `embeddable` — it passes the skeleton through as-is. Missing `strokeColor` /
 * `backgroundColor` breaks hit-testing (`isTransparent(color)` uses `color.length`).
 * Mirrors Excalidraw {@link DEFAULT_ELEMENT_PROPS} / `_newElementBase` defaults.
 */
const EXCALIDRAW_EMBEDDABLE_PAINT = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  locked: false,
  roundness: null,
} as const;

/** Ensure paint strings exist on every element (fixes legacy / partial skeletons). */
function sanitizeElementsPaintColors(elements: unknown[]): unknown[] {
  return elements.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const el = raw as Record<string, unknown>;
    const stroke =
      typeof el.strokeColor === "string" ? el.strokeColor : "#1e1e1e";
    const bg =
      typeof el.backgroundColor === "string"
        ? el.backgroundColor
        : "transparent";
    if (stroke === el.strokeColor && bg === el.backgroundColor) return raw;
    return { ...el, strokeColor: stroke, backgroundColor: bg };
  });
}

function viewportCenterSceneCoords(api: ExcalidrawAPI): {
  sceneX: number;
  sceneY: number;
} {
  const appState = api.getAppState();
  const zoom = appState.zoom.value;
  const { scrollX, scrollY, width, height } = appState;
  const cx = width / 2;
  const cy = height / 2;
  return {
    sceneX: (cx - scrollX) / zoom,
    sceneY: (cy - scrollY) / zoom,
  };
}

function insertEmbeddableNoomaBlock(
  api: ExcalidrawAPI | null,
  skeleton: ExcalidrawElementSkeletonInput
) {
  if (!api) return;
  const converted = convertToExcalidrawElements([skeleton], {
    regenerateIds: true,
  });
  const created = converted[0];
  if (!created) return;
  /** Must include deleted elements or `updateScene` drops them and corrupts the scene. */
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), created],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

function AlgebraEmbeddableSurface({
  payload,
  onPayloadChange,
}: {
  payload: AlgebraBlockPayload;
  onPayloadChange: (next: AlgebraBlockPayload) => void;
}) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-2 bg-[var(--background)] p-3 text-[var(--foreground)]">
      <p className="text-sm font-medium text-[var(--muted-foreground)]">
        Algebra block
      </p>
      <p className="text-xs text-[var(--muted-foreground)]">
        Placeholder — symbolic algebra UX will plug in here later.
      </p>
      <label className="flex flex-1 flex-col gap-1 text-xs">
        <span className="text-[var(--muted-foreground)]">Scratch note</span>
        <textarea
          className="min-h-[72px] flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--muted)] p-2 font-mono text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-sky-500"
          value={payload.note}
          onChange={(e) =>
            onPayloadChange({ ...payload, note: e.target.value })
          }
          spellCheck={false}
        />
      </label>
    </div>
  );
}

function migrateLegacyGridToElements(cellGrid: CellGridDocument) {
  const w = CELL_GRID_COLS * CELL_SIZE_PX + 32;
  const h = CELL_GRID_ROWS * CELL_SIZE_PX + 32;
  return convertToExcalidrawElements(
    [
      {
        ...EXCALIDRAW_EMBEDDABLE_PAINT,
        type: "embeddable",
        x: 120,
        y: 120,
        width: w,
        height: h,
        link: noomaEmbedLinkForBlock("arithmetic-grid"),
        customData: {
          noomaBlockType: "arithmetic-grid",
          payload: cellGrid,
        } satisfies NoomaEmbeddableCustomData,
      } as unknown as ExcalidrawElementSkeletonInput,
    ],
    { regenerateIds: true }
  );
}

export function ExcalidrawCanvasHost() {
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const [sceneReady, setSceneReady] = useState(false);
  const [initialPayload, setInitialPayload] = useState<SceneBootstrap | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await loadGuestDocument();
      if (cancelled) return;

      if (row?.excalidrawFile) {
        try {
          const raw = JSON.parse(row.excalidrawFile) as Record<
            string,
            unknown
          >;
          const elements = sanitizeElementsPaintColors(
            Array.isArray(raw.elements) ? raw.elements : []
          );
          const appState =
            raw.appState &&
            typeof raw.appState === "object" &&
            !Array.isArray(raw.appState)
              ? (raw.appState as Record<string, unknown>)
              : {};
          const filesRaw = raw.files;
          const files =
            filesRaw &&
            typeof filesRaw === "object" &&
            !Array.isArray(filesRaw)
              ? (filesRaw as Record<string, unknown>)
              : {};
          setInitialPayload({ elements, appState, files });
          setSceneReady(true);
          return;
        } catch {
          /* fall through to migration / empty */
        }
      }

      if (row?.cellGrid?.version === 1) {
        const elements = migrateLegacyGridToElements(row.cellGrid);
        setInitialPayload({
          elements: [...elements],
          appState: { viewBackgroundColor: "#f8f9fa" },
          files: {},
        });
        setSceneReady(true);
        return;
      }

      setInitialPayload({ elements: [], appState: {}, files: {} });
      setSceneReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const schedulePersist = useCallback(
    (
      elements: Parameters<ExcalidrawOnChange>[0],
      appState: Parameters<ExcalidrawOnChange>[1],
      files: Parameters<ExcalidrawOnChange>[2]
    ) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const json = serializeAsJSON(
          elements as SerializeElementsArg,
          appState,
          files,
          "database"
        );
        void saveGuestCanvasDocument(json);
      }, SAVE_DEBOUNCE_MS);
    },
    []
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  const updateEmbeddableCustomData = useCallback(
    (
      elementId: string,
      nextCustom: NoomaEmbeddableCustomData
    ) => {
      const api = apiRef.current;
      if (!api) return;
      const elements = api.getSceneElementsIncludingDeleted();
      const mapped = elements.map((el) => {
        if (el.id !== elementId || el.type !== "embeddable") return el;
        return newElementWith(el, {
          customData: nextCustom as Record<string, unknown>,
          link: noomaEmbedLinkForBlock(nextCustom.noomaBlockType),
        });
      });
      api.updateScene({
        elements: mapped,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    []
  );

  const renderEmbeddable: RenderEmbeddableImpl = useCallback(
    (element, appState) => {
      void appState;
      const embed = element;
      const data = embed.customData as NoomaEmbeddableCustomData | undefined;
      if (!data?.noomaBlockType) return null;

      if (data.noomaBlockType === "arithmetic-grid") {
        const arithPayload = data.payload;
        const expectedCells =
          CELL_GRID_ROWS * CELL_GRID_COLS;
        const safeGrid: CellGridDocument | undefined =
          arithPayload &&
          arithPayload.version === 1 &&
          Array.isArray(arithPayload.cells) &&
          arithPayload.cells.length === expectedCells &&
          arithPayload.rows === CELL_GRID_ROWS &&
          arithPayload.cols === CELL_GRID_COLS
            ? arithPayload
            : undefined;
        return (
          <div className="h-full w-full overflow-hidden bg-[var(--background)]">
            <ArithmeticGridBlock
              key={embed.id}
              initialGrid={safeGrid ?? emptyArithmeticGridDocument()}
              onGridChange={(doc) =>
                updateEmbeddableCustomData(embed.id, {
                  noomaBlockType: "arithmetic-grid",
                  payload: doc,
                })
              }
              showHelpText={false}
              showToolbar={false}
            />
          </div>
        );
      }

      if (data.noomaBlockType === "algebra") {
        return (
          <div className="h-full w-full overflow-hidden">
            <AlgebraEmbeddableSurface
              payload={data.payload}
              onPayloadChange={(next) =>
                updateEmbeddableCustomData(embed.id, {
                  noomaBlockType: "algebra",
                  payload: next,
                })
              }
            />
          </div>
        );
      }

      return null;
    },
    [updateEmbeddableCustomData]
  );

  const validateEmbeddable = useCallback((link: string) => {
    return link.startsWith(NOOMA_EMBED_LINK_PREFIX);
  }, []);

  const arithW = CELL_GRID_COLS * CELL_SIZE_PX + 32;
  const arithH = CELL_GRID_ROWS * CELL_SIZE_PX + 32;

  const renderTopRightUI = useCallback(() => {
    return (
      <div className="flex flex-wrap items-center gap-2 pr-1">
        <button
          type="button"
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 shadow-sm hover:bg-neutral-50"
          onClick={() => {
            const api = apiRef.current;
            if (!api) return;
            const { sceneX, sceneY } = viewportCenterSceneCoords(api);
            insertEmbeddableNoomaBlock(api, {
              ...EXCALIDRAW_EMBEDDABLE_PAINT,
              type: "embeddable",
              x: sceneX - arithW / 2,
              y: sceneY - arithH / 2,
              width: arithW,
              height: arithH,
              link: noomaEmbedLinkForBlock("arithmetic-grid"),
              customData: {
                noomaBlockType: "arithmetic-grid",
                payload: emptyArithmeticGridDocument(),
              } satisfies NoomaEmbeddableCustomData,
            } as unknown as ExcalidrawElementSkeletonInput);
          }}
        >
          + Arithmetic grid
        </button>
        <button
          type="button"
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800 shadow-sm hover:bg-neutral-50"
          onClick={() => {
            const api = apiRef.current;
            if (!api) return;
            const { sceneX, sceneY } = viewportCenterSceneCoords(api);
            const w = 320;
            const h = 200;
            insertEmbeddableNoomaBlock(api, {
              ...EXCALIDRAW_EMBEDDABLE_PAINT,
              type: "embeddable",
              x: sceneX - w / 2,
              y: sceneY - h / 2,
              width: w,
              height: h,
              link: noomaEmbedLinkForBlock("algebra"),
              customData: {
                noomaBlockType: "algebra",
                payload: defaultAlgebraPayload(),
              } satisfies NoomaEmbeddableCustomData,
            } as unknown as ExcalidrawElementSkeletonInput);
          }}
        >
          + Algebra
        </button>
      </div>
    );
  }, [arithH, arithW]);

  const initialData = useMemo(() => {
    if (!initialPayload) return null;
    const elements = sanitizeElementsPaintColors(
      Array.isArray(initialPayload.elements) ? initialPayload.elements : []
    );
    const appState =
      initialPayload.appState &&
      typeof initialPayload.appState === "object" &&
      !Array.isArray(initialPayload.appState)
        ? initialPayload.appState
        : {};
    const files =
      initialPayload.files &&
      typeof initialPayload.files === "object" &&
      !Array.isArray(initialPayload.files)
        ? initialPayload.files
        : {};
    return {
      elements: elements as unknown as SerializeElementsArg,
      appState: appState as unknown as Parameters<ExcalidrawOnChange>[1],
      files: files as unknown as Parameters<ExcalidrawOnChange>[2],
    };
  }, [initialPayload]);

  if (!sceneReady || !initialData) {
    return (
      <div
        className="flex h-[100dvh] w-full items-center justify-center bg-[var(--background)] text-[var(--foreground)]"
        role="status"
        aria-live="polite"
      >
        Loading canvas…
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-[var(--background)]">
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        initialData={initialData}
        validateEmbeddable={validateEmbeddable}
        renderEmbeddable={renderEmbeddable}
        renderTopRightUI={renderTopRightUI}
        onChange={(elements, appState, files) => {
          schedulePersist(elements, appState, files);
        }}
        UIOptions={{
          canvasActions: {
            loadScene: false,
          },
        }}
      />
    </div>
  );
}
