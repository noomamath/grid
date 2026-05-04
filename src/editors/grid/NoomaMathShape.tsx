"use client";

/* tldraw's published `TLShape` union omits custom shapes; `any` keeps overrides aligned with runtime schema. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import katex from "katex";
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  Rectangle2d,
  resizeBox,
  suffixSafeId,
  type TLResizeInfo,
  useUniqueSafeId,
  type TLGridProps,
} from "@tldraw/editor";
import { useMemo } from "react";
import { GRID_SIZE_PX } from "@/core/constants";
import {
  noomaMathShapeMigrations,
  noomaMathShapeProps,
  type NoomaMathProps,
  type TLNoomaMathShape,
} from "./nooma-math-props";

export type { TLNoomaMathShape };

export class NoomaMathShapeUtil extends BaseBoxShapeUtil<any> {
  static override type = "nooma-math" as const;
  static override props = noomaMathShapeProps;
  static override migrations = noomaMathShapeMigrations;

  override isAspectRatioLocked() {
    return false;
  }

  override getDefaultProps(): NoomaMathProps {
    return {
      w: Math.max(GRID_SIZE_PX * 8, 160),
      h: Math.max(GRID_SIZE_PX * 3, 56),
      latex: "x^2 + y^2 = r^2",
    };
  }

  override getGeometry(shape: any) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: any, info: TLResizeInfo<any>) {
    let next = resizeBox(shape, info);
    const g = GRID_SIZE_PX;
    next = {
      ...next,
      props: {
        ...next.props,
        w: Math.max(g, Math.round(next.props.w / g) * g),
        h: Math.max(g, Math.round(next.props.h / g) * g),
      },
    };
    return next;
  }

  override component(shape: any) {
    return <NoomaMathShapeBody shape={shape as TLNoomaMathShape} />;
  }

  override indicator(shape: any) {
    return <rect width={shape.props.w} height={shape.props.h} rx={4} ry={4} />;
  }
}

function NoomaMathShapeBody({ shape }: { shape: TLNoomaMathShape }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(shape.props.latex || "\\,", {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      return '<span class="text-red-600">Invalid math</span>';
    }
  }, [shape.props.latex]);

  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: shape.props.h,
        padding: 8,
        overflow: "hidden",
        pointerEvents: "all",
      }}
    >
      <div
        className="nooma-katex-html tl-hitarea-none flex h-full w-full items-center justify-start overflow-hidden"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </HTMLContainer>
  );
}

/** High-contrast blue line grid aligned to document `gridSize`. */
export function NoomaLineGrid({ x, y, z, size }: TLGridProps) {
  const id = useUniqueSafeId("nooma-grid");
  const step = Math.max(size * z, 1);
  const patternId = suffixSafeId(id, "lines");
  // Offset pattern so lines stay aligned with the camera (world grid).
  const px = 0.5 + x * z;
  const py = 0.5 + y * z;

  return (
    <svg
      className="tl-grid pointer-events-none"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <pattern
          id={patternId}
          width={step}
          height={step}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${px % step},${py % step})`}
        >
          <path
            d={`M ${step} 0 L 0 0 0 ${step}`}
            className="stroke-[var(--nooma-grid-stroke)]"
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
