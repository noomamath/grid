"use client";

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
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

import { createPortal } from "react-dom";

import { Plus } from "lucide-react";

import { ArithmeticBoxEmbed } from "@/editors/cell-grid/ArithmeticBoxEmbed";
import {
  loadGuestDocument,
  saveGuestCanvasDocument,
} from "@/core/db";
import {
  DEFAULT_ARITHMETIC_BOX_STATE,
  NOOMA_EMBED_LINK_PREFIX,
  arithmeticBoxHeightForRows,
  noomaEmbedLinkForBlock,
  type ArithmeticBoxState,
  type NoomaBlockType,
  type NoomaEmbeddableCustomData,
} from "@/core/noomaBlocks";

type ExcalidrawAPI = Parameters<
  NonNullable<ComponentProps<typeof Excalidraw>["excalidrawAPI"]>
>[0];

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

const SAVE_DEBOUNCE_MS = 350;

const BLANK_BOX_W = 320;
const BLANK_BOX_H = 200;
const DEFAULT_ARITHMETIC_BOX_H = arithmeticBoxHeightForRows(
  DEFAULT_ARITHMETIC_BOX_STATE.rows.length
);

/**
 * `convertToExcalidrawElements` does not run `newEmbeddableElement` for
 * `embeddable` — the skeleton is used as-is. These fields are required for
 * hit-testing (`isTransparent` expects string colors).
 */
const EXCALIDRAW_EMBEDDABLE_PAINT = {
  strokeColor: "transparent",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 0,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  locked: false,
  roundness: null,
} as const;

/**
 * Embeddables skip `newEmbeddableElement()` inside `convertToExcalidrawElements`.
 * Missing `groupIds` breaks runtime code that does `element.groupIds.find(...)`
 * (no optional chaining) — see Excalidraw source around group selection helpers.
 */
const EXCALIDRAW_EMBEDDABLE_STRUCTURE_DEFAULTS = {
  groupIds: [] as const,
  frameId: null as string | null,
  boundElements: null,
};

const EMBEDDABLE_REQUIRED_KEYS = [
  "id",
  "x",
  "y",
  "width",
  "height",
  "angle",
  "seed",
  "version",
  "versionNonce",
  "index",
  "isDeleted",
  "updated",
  "link",
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "locked",
  "groupIds",
] as const;

const isDev = process.env.NODE_ENV !== "production";

function randomInt() {
  return Math.floor(Math.random() * 2_147_483_647);
}

function sanitizeElementsPaintColors(elements: unknown[]): unknown[] {
  const now = Date.now();
  return elements.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const el = raw as Record<string, unknown>;
    if (el.type !== "embeddable") {
      const stroke =
        typeof el.strokeColor === "string" ? el.strokeColor : "#1e1e1e";
      const bg =
        typeof el.backgroundColor === "string"
          ? el.backgroundColor
          : "transparent";
      if (stroke === el.strokeColor && bg === el.backgroundColor) return raw;
      return { ...el, strokeColor: stroke, backgroundColor: bg };
    }

    return {
      ...EXCALIDRAW_EMBEDDABLE_PAINT,
      ...EXCALIDRAW_EMBEDDABLE_STRUCTURE_DEFAULTS,
      ...el,
      id: typeof el.id === "string" ? el.id : crypto.randomUUID(),
      x: typeof el.x === "number" ? el.x : 0,
      y: typeof el.y === "number" ? el.y : 0,
      width: typeof el.width === "number" ? el.width : BLANK_BOX_W,
      height: typeof el.height === "number" ? el.height : BLANK_BOX_H,
      angle: typeof el.angle === "number" ? el.angle : 0,
      seed: typeof el.seed === "number" ? el.seed : randomInt(),
      version: typeof el.version === "number" ? el.version : 1,
      versionNonce:
        typeof el.versionNonce === "number" ? el.versionNonce : randomInt(),
      index: typeof el.index === "string" || el.index === null ? el.index : null,
      isDeleted: typeof el.isDeleted === "boolean" ? el.isDeleted : false,
      updated: typeof el.updated === "number" ? el.updated : now,
      link:
        typeof el.link === "string" && el.link.startsWith(NOOMA_EMBED_LINK_PREFIX)
          ? el.link
          : noomaEmbedLinkForBlock(
              typeof (el.customData as { noomaBlockType?: unknown })?.noomaBlockType ===
                "string" &&
                (el.customData as { noomaBlockType?: string }).noomaBlockType ===
                  "algebra"
                ? "algebra"
                : "arithmetic"
            ),
      customData:
        el.customData && typeof el.customData === "object"
          ? el.customData
          : ({ noomaBlockType: "arithmetic" } satisfies NoomaEmbeddableCustomData),
      // Always suppress Excalidraw-drawn embeddable styling so only our custom
      // HTML border/fill is visible (selection UI still comes from Excalidraw).
      strokeColor: EXCALIDRAW_EMBEDDABLE_PAINT.strokeColor,
      backgroundColor: EXCALIDRAW_EMBEDDABLE_PAINT.backgroundColor,
      fillStyle: EXCALIDRAW_EMBEDDABLE_PAINT.fillStyle,
      strokeStyle: EXCALIDRAW_EMBEDDABLE_PAINT.strokeStyle,
      strokeWidth: EXCALIDRAW_EMBEDDABLE_PAINT.strokeWidth,
      roughness: EXCALIDRAW_EMBEDDABLE_PAINT.roughness,
      opacity: EXCALIDRAW_EMBEDDABLE_PAINT.opacity,
      locked:
        typeof el.locked === "boolean"
          ? el.locked
          : EXCALIDRAW_EMBEDDABLE_PAINT.locked,
      groupIds: Array.isArray(el.groupIds) ? el.groupIds : [],
      frameId: typeof el.frameId === "string" || el.frameId === null ? el.frameId : null,
      boundElements:
        el.boundElements === null
          ? null
          : Array.isArray(el.boundElements)
            ? el.boundElements
            : null,
    };
  });
}

function findMalformedEmbeddables(elements: unknown[]): Array<{
  id: string;
  noomaBlockType: string;
  missing: string[];
}> {
  const malformed: Array<{
    id: string;
    noomaBlockType: string;
    missing: string[];
  }> = [];

  for (const raw of elements) {
    if (!raw || typeof raw !== "object") continue;
    const el = raw as Record<string, unknown>;
    if (el.type !== "embeddable") continue;
    const missing = EMBEDDABLE_REQUIRED_KEYS.filter((key) => {
      const value = el[key];
      if (key === "locked") return typeof value !== "boolean";
      if (key === "groupIds") return !Array.isArray(value);
      if (key === "isDeleted") return typeof value !== "boolean";
      if (key === "id" || key === "link")
        return typeof value !== "string" && value !== null;
      if (key === "index")
        return typeof value !== "string" && value !== null;
      if (key === "strokeWidth" || key === "roughness" || key === "opacity") {
        return typeof value !== "number";
      }
      if (
        key === "x" ||
        key === "y" ||
        key === "width" ||
        key === "height" ||
        key === "angle" ||
        key === "seed" ||
        key === "version" ||
        key === "versionNonce" ||
        key === "updated"
      ) {
        return typeof value !== "number";
      }
      return typeof value !== "string";
    });
    if (missing.length === 0) continue;
    const customData =
      el.customData && typeof el.customData === "object"
        ? (el.customData as Record<string, unknown>)
        : {};
    malformed.push({
      id: typeof el.id === "string" ? el.id : "(missing-id)",
      noomaBlockType:
        typeof customData.noomaBlockType === "string"
          ? customData.noomaBlockType
          : "(unknown)",
      missing: [...missing],
    });
  }

  return malformed;
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
  const created = sanitizeElementsPaintColors(converted)[0];
  if (!created) return;
  if (isDev) {
    const malformed = findMalformedEmbeddables([created]);
    if (malformed.length > 0) {
      console.error(
        "[Nooma] Refusing to insert malformed embeddable element",
        malformed
      );
      return;
    }
  }
  api.updateScene({
    elements: [
      ...api.getSceneElementsIncludingDeleted(),
      created as unknown as Parameters<ExcalidrawOnChange>[0][number],
    ],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  // Programmatic scene updates don't always repaint the HTML embed layer on the
  // same tick. Embeds also gate on viewport visibility + lazy DOM init; the first
  // paint after `updateScene` can miss `isElementInViewport` until layout settles.
  // Refresh after microtask + next frame so the embed mounts without a full reload.
  queueMicrotask(() => {
    api.refresh();
    requestAnimationFrame(() => {
      api.refresh();
    });
  });
}

/** Legacy guest doc had only `cellGrid`; migrate to one blank arithmetic embed. */
function migrateLegacyGridToBlankArithmeticEmbed() {
  return convertToExcalidrawElements(
    [
      {
        ...EXCALIDRAW_EMBEDDABLE_PAINT,
        type: "embeddable",
        x: 120,
        y: 120,
        width: BLANK_BOX_W,
        height: DEFAULT_ARITHMETIC_BOX_H,
        link: noomaEmbedLinkForBlock("arithmetic"),
        customData: { noomaBlockType: "arithmetic" },
      } as unknown as ExcalidrawElementSkeletonInput,
    ],
    { regenerateIds: true }
  );
}

function BlankAlgebraEmbed() {
  return (
    <div className="nooma-math-card box-border flex h-full w-full items-center justify-center p-2 text-center text-sm text-neutral-700">
      algebra card here
    </div>
  );
}

export function ExcalidrawCanvasHost() {
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const fabAnchorRef = useRef<HTMLDivElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [initialPayload, setInitialPayload] = useState<SceneBootstrap | null>(
    null
  );
  const hasLoggedMalformedRef = useRef(false);

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
          if (isDev) {
            const malformed = findMalformedEmbeddables(elements);
            if (malformed.length > 0 && !hasLoggedMalformedRef.current) {
              hasLoggedMalformedRef.current = true;
              console.warn(
                "[Nooma] Loaded malformed embeddables from storage. Auto-healing with defaults. If issues persist, clear stale DB: indexedDB.deleteDatabase('nooma-grid'); location.reload();",
                malformed
              );
            }
          }
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
          /* fall through */
        }
      }

      if (row?.cellGrid?.version === 1) {
        const elements = migrateLegacyGridToBlankArithmeticEmbed();
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
        if (isDev) {
          const malformed = findMalformedEmbeddables(elements as unknown[]);
          if (malformed.length > 0) {
            console.error(
              "[Nooma] Malformed embeddables detected in onChange. Persisting sanitized scene.",
              malformed
            );
          }
        }
        const normalizedElements = sanitizeElementsPaintColors(
          elements as unknown[]
        );
        const json = serializeAsJSON(
          normalizedElements as unknown as SerializeElementsArg,
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

  const updateArithmeticEmbeddable = useCallback(
    (elementId: string, arithmetic: ArithmeticBoxState) => {
      const api = apiRef.current;
      if (!api) return;

      const expectedHeight = arithmeticBoxHeightForRows(arithmetic.rows.length);
      const now = Date.now();
      const elements = api.getSceneElementsIncludingDeleted().map((element) => {
        if (element.id !== elementId) return element;
        const rawCustomData =
          element.customData &&
          typeof element.customData === "object" &&
          !Array.isArray(element.customData)
            ? (element.customData as Record<string, unknown>)
            : {};
        return {
          ...element,
          height: expectedHeight,
          customData: {
            ...rawCustomData,
            noomaBlockType: "arithmetic",
            arithmetic,
          } satisfies NoomaEmbeddableCustomData,
          version: element.version + 1,
          versionNonce: randomInt(),
          updated: now,
        };
      });

      api.updateScene({
        elements,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      queueMicrotask(() => {
        api.refresh();
        requestAnimationFrame(() => {
          api.refresh();
        });
      });
    },
    []
  );

  const renderEmbeddable: RenderEmbeddableImpl = useCallback(
    (_element) => {
      const data = _element.customData as
        | NoomaEmbeddableCustomData
        | Record<string, unknown>
        | undefined;
      const inferredType =
        typeof data?.noomaBlockType === "string"
          ? data.noomaBlockType
          : "arithmetic";
      if (inferredType === "arithmetic" || inferredType === "arithmetic-grid") {
        const arithmetic =
          data &&
          "arithmetic" in data &&
          data.arithmetic &&
          typeof data.arithmetic === "object"
            ? (data.arithmetic as ArithmeticBoxState)
            : undefined;
        return (
          <ArithmeticBoxEmbed
            state={arithmetic}
            elementHeight={_element.height}
            onChange={(nextState) =>
              updateArithmeticEmbeddable(_element.id, nextState)
            }
          />
        );
      }
      if (inferredType === "algebra") {
        return <BlankAlgebraEmbed />;
      }
      return (
        <ArithmeticBoxEmbed
          elementHeight={_element.height}
          onChange={(nextState) =>
            updateArithmeticEmbeddable(_element.id, nextState)
          }
        />
      );
    },
    [updateArithmeticEmbeddable]
  );

  const validateEmbeddable = useCallback((link: string) => {
    return link.startsWith(NOOMA_EMBED_LINK_PREFIX);
  }, []);

  const insertNoomaBlockAtViewportCenter = useCallback(
    (blockType: NoomaBlockType) => {
      const api = apiRef.current;
      if (!api) return;
      const { sceneX, sceneY } = viewportCenterSceneCoords(api);
      insertEmbeddableNoomaBlock(api, {
        ...EXCALIDRAW_EMBEDDABLE_PAINT,
        type: "embeddable",
        x: sceneX - BLANK_BOX_W / 2,
        y: sceneY - BLANK_BOX_H / 2,
        width: BLANK_BOX_W,
        height:
          blockType === "arithmetic" ? DEFAULT_ARITHMETIC_BOX_H : BLANK_BOX_H,
        link: noomaEmbedLinkForBlock(blockType),
        customData: { noomaBlockType: blockType },
      } as unknown as ExcalidrawElementSkeletonInput);
    },
    []
  );

  useEffect(() => {
    if (!fabMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = fabAnchorRef.current;
      if (el && !el.contains(e.target as Node)) {
        setFabMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFabMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fabMenuOpen]);

  const initialData = useMemo(() => {
    if (!initialPayload) return null;
    const elements = sanitizeElementsPaintColors(
      Array.isArray(initialPayload.elements) ? initialPayload.elements : []
    );
    const rawApp =
      initialPayload.appState &&
      typeof initialPayload.appState === "object" &&
      !Array.isArray(initialPayload.appState)
        ? (initialPayload.appState as Record<string, unknown>)
        : {};
    const appState = { ...rawApp };
    const openSidebar = appState.openSidebar;
    if (
      openSidebar &&
      typeof openSidebar === "object" &&
      !Array.isArray(openSidebar) &&
      (openSidebar as { name?: unknown }).name === "default"
    ) {
      appState.openSidebar = null;
    }
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
    <div className="nooma-excalidraw-host relative h-[100dvh] w-full overflow-hidden bg-[var(--background)]">
      <Excalidraw
        aiEnabled={false}
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        initialData={initialData}
        validateEmbeddable={validateEmbeddable}
        renderEmbeddable={renderEmbeddable}
        onChange={(elements, appState, files) => {
          schedulePersist(elements, appState, files);
        }}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            changeViewBackgroundColor: false,
          },
        }}
      />
      {/* Portaled above Excalidraw’s own body portals (layer UI ~1000). Host is client-only (dynamic ssr:false). */}
      {createPortal(
        <div ref={fabAnchorRef} className="nooma-toolbar-fab-anchor">
          {fabMenuOpen ? (
            <div
              role="menu"
              aria-label="Block type"
              className="absolute bottom-full left-1/2 z-[116] mb-2 flex min-w-[10.5rem] -translate-x-1/2 flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                className="rounded-md px-2 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                onClick={() => {
                  insertNoomaBlockAtViewportCenter("arithmetic");
                  setFabMenuOpen(false);
                }}
              >
                Arithmetic
              </button>
              <button
                type="button"
                role="menuitem"
                className="rounded-md px-2 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                onClick={() => {
                  insertNoomaBlockAtViewportCenter("algebra");
                  setFabMenuOpen(false);
                }}
              >
                Algebra
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="nooma-toolbar-fab"
            aria-label="Add block"
            aria-expanded={fabMenuOpen}
            aria-haspopup="menu"
            onClick={() => setFabMenuOpen((open) => !open)}
          >
            <Plus className="h-[42%] w-[42%]" strokeWidth={2.5} aria-hidden />
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
