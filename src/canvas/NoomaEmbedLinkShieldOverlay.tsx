"use client";

import {
  useCallback,
  useLayoutEffect,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";

/** Matches Excalidraw `ElementCanvasButtons` placement (sceneX + width, sceneY). */
const SHIELD_OFFSET_LEFT_PX = -2;
const SHIELD_OFFSET_TOP_PX = -17;
const SHIELD_WIDTH_PX = 20;
const SHIELD_HEIGHT_PX = 18;

type ShieldRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ShieldPlacement = {
  elementId: string;
  rect: ShieldRect;
};

type NoomaEmbedLinkShieldOverlaysProps = {
  hostRef: RefObject<HTMLDivElement | null>;
  /** Selected embed: no shield (link icon only shows when unselected). */
  hiddenElementId: string | null;
};

function shieldRectForContainer(
  container: Element,
  host: HTMLElement
): ShieldRect | null {
  const containerRect = container.getBoundingClientRect();
  if (containerRect.width === 0 && containerRect.height === 0) return null;

  const hostRect = host.getBoundingClientRect();
  return {
    left: containerRect.right - hostRect.left + SHIELD_OFFSET_LEFT_PX,
    top: containerRect.top - hostRect.top + SHIELD_OFFSET_TOP_PX,
    width: SHIELD_WIDTH_PX,
    height: SHIELD_HEIGHT_PX,
  };
}

function LinkShield({
  rect,
  onPointerEvent,
}: {
  rect: ShieldRect;
  onPointerEvent: (event: PointerEvent) => void;
}) {
  return (
    <div
      className="nooma-embed-link-shield-overlay"
      aria-hidden
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
      onPointerDown={onPointerEvent}
      onPointerDownCapture={onPointerEvent}
      onPointerUp={onPointerEvent}
      onPointerUpCapture={onPointerEvent}
      onClick={onPointerEvent}
      onClickCapture={onPointerEvent}
      onMouseDown={onPointerEvent}
      onMouseDownCapture={onPointerEvent}
    />
  );
}

export function NoomaEmbedLinkShieldOverlays({
  hostRef,
  hiddenElementId,
}: NoomaEmbedLinkShieldOverlaysProps) {
  const [placements, setPlacements] = useState<ShieldPlacement[]>([]);

  const syncRects = useCallback(() => {
    const host = hostRef.current;
    if (!host) {
      setPlacements([]);
      return;
    }

    const next: ShieldPlacement[] = [];
    for (const embedRoot of host.querySelectorAll("[data-nooma-embed-id]")) {
      const elementId = embedRoot.getAttribute("data-nooma-embed-id");
      if (!elementId || elementId === hiddenElementId) continue;

      const container = embedRoot.closest(".excalidraw__embeddable-container");
      if (!container) continue;

      const rect = shieldRectForContainer(container, host);
      if (rect) next.push({ elementId, rect });
    }
    setPlacements(next);
  }, [hiddenElementId, hostRef]);

  useLayoutEffect(() => {
    syncRects();

    const host = hostRef.current;
    if (!host) return;

    const resizeObserver = new ResizeObserver(() => syncRects());
    resizeObserver.observe(host);

    const mutationObserver = new MutationObserver(() => {
      requestAnimationFrame(syncRects);
    });
    mutationObserver.observe(host, {
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
      childList: true,
    });

    let frame = 0;
    const tick = () => {
      syncRects();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener("resize", syncRects);
    window.addEventListener("scroll", syncRects, true);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", syncRects);
      window.removeEventListener("scroll", syncRects, true);
    };
  }, [hostRef, syncRects]);

  const stop = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      {placements.map(({ elementId, rect }) => (
        <LinkShield key={elementId} rect={rect} onPointerEvent={stop} />
      ))}
    </>
  );
}
