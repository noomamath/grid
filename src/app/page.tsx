"use client";

import dynamic from "next/dynamic";

const ExcalidrawCanvasHost = dynamic(
  () =>
    import("@/canvas/ExcalidrawCanvasHost").then((m) => m.ExcalidrawCanvasHost),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[100dvh] flex-1 items-center justify-center bg-[var(--background)] text-[var(--foreground)]"
        role="status"
        aria-live="polite"
      >
        Loading canvas…
      </div>
    ),
  }
);

export default function Home() {
  return (
    <main className="relative flex min-h-[100dvh] flex-1 flex-col">
      <ExcalidrawCanvasHost />
    </main>
  );
}
