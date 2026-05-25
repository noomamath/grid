"use client";

import "./nooma-header-brand.css";

import {
  useCallback,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const BRAND_GAP_PX = 8;

/** Inline fallback when global CSS does not reach the body portal. */
const BRAND_VISUAL_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  paddingInline: "0.75rem",
  borderRadius: "0.5rem",
  background: "oklch(0.52 0.19 264)",
  color: "#ffffff",
  fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  fontSize: "0.875rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  lineHeight: 1,
  boxShadow:
    "0 2px 10px oklch(0.55 0.2 280 / 0.2), 0 2px 4px oklch(0 0 0 / 0.8)",
  pointerEvents: "none",
  userSelect: "none",
};

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

    const island = trigger.closest(".Island");
    const radiusSource =
      island instanceof HTMLElement ? island : trigger;
    const borderRadius = getComputedStyle(radiusSource).borderRadius;

    setStyle({
      ...BRAND_VISUAL_STYLE,
      position: "fixed",
      top: rect.top,
      left: rect.right + BRAND_GAP_PX,
      height: rect.height,
      borderRadius: borderRadius || BRAND_VISUAL_STYLE.borderRadius,
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
