"use client";

import {
  useCallback,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const BRAND_GAP_PX = 8;

type NoomaHeaderBrandProps = {
  hostRef: RefObject<HTMLDivElement | null>;
};

/** Logo placeholder to the right of Excalidraw’s main-menu (hamburger) trigger. */
export function NoomaHeaderBrand({ hostRef }: NoomaHeaderBrandProps) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const syncPosition = useCallback(() => {
    const host = hostRef.current;
    const trigger = host?.querySelector(".main-menu-trigger");
    if (!(trigger instanceof HTMLElement)) {
      setStyle(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setStyle(null);
      return;
    }

    setStyle({
      position: "fixed",
      top: rect.top,
      left: rect.right + BRAND_GAP_PX,
      height: rect.height,
      zIndex: 10050,
    });
  }, [hostRef]);

  useLayoutEffect(() => {
    syncPosition();

    const host = hostRef.current;
    if (!host) return;

    const resizeObserver = new ResizeObserver(() => syncPosition());
    resizeObserver.observe(host);

    const mutationObserver = new MutationObserver(() => {
      requestAnimationFrame(syncPosition);
    });
    mutationObserver.observe(host, {
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
      childList: true,
    });

    let frame = 0;
    const tick = () => {
      syncPosition();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [hostRef, syncPosition]);

  if (!style) return null;

  return createPortal(
    <div className="nooma-header-brand" style={style} aria-hidden>
      nooma
    </div>,
    document.body
  );
}
