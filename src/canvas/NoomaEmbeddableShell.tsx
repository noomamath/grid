"use client";

import type { ReactNode } from "react";

type NoomaEmbeddableShellProps = {
  elementId: string;
  children: ReactNode;
};

/** Wraps custom embed DOM; link shield is positioned in NoomaEmbedLinkShieldOverlay. */
export function NoomaEmbeddableShell({
  elementId,
  children,
}: NoomaEmbeddableShellProps) {
  return (
    <div className="nooma-embed-shell h-full w-full" data-nooma-embed-id={elementId}>
      {children}
    </div>
  );
}
