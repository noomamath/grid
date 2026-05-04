"use client";

import { useEditor, useValue } from "@tldraw/editor";
import { FunctionSquare, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TLNoomaMathShape } from "@/editors/grid/nooma-math-props";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
const SNIPPETS: { label: string; tex: string; hint?: string }[] = [
  { label: "+", tex: "+" },
  { label: "−", tex: "-" },
  { label: "×", tex: "\\times " },
  { label: "÷", tex: "\\div " },
  { label: "=", tex: "=" },
  { label: "^n", tex: "^{}", hint: "Power (move cursor inside braces)" },
  { label: "√", tex: "\\sqrt{}" },
  { label: "frac", tex: "\\frac{a}{b}", hint: "Replace a and b" },
  { label: "π", tex: "\\pi " },
  { label: "θ", tex: "\\theta " },
  { label: "∞", tex: "\\infty " },
  { label: "Σ", tex: "\\sum_{i=1}^{n} " },
  { label: "∫", tex: "\\int " },
  { label: "lim", tex: "\\lim_{x \\to 0} " },
  { label: "≤", tex: "\\leq " },
  { label: "≥", tex: "\\geq " },
  { label: "≠", tex: "\\neq " },
];

export function MathKeypad() {
  const editor = useEditor();
  const selected = useValue(
    "math-selection",
    () => editor.getOnlySelectedShape(),
    [editor]
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const mathShape: TLNoomaMathShape | null =
    selected && (selected as { type: string }).type === "nooma-math"
      ? (selected as unknown as TLNoomaMathShape)
      : null;

  const append = (tex: string) => {
    if (!mathShape) return;
    // Custom shape: default `TLShape` union in @tldraw/tlschema does not list `nooma-math`.
    editor.updateShapes([
      {
        id: mathShape.id,
        type: "nooma-math",
        props: {
          ...mathShape.props,
          latex: mathShape.props.latex + tex,
        },
      },
    ] as never);
  };

  const openEditor = () => {
    if (!mathShape) return;
    setDraft(mathShape.props.latex);
    setOpen(true);
  };

  const saveDraft = () => {
    if (!mathShape) return;
    editor.updateShapes([
      {
        id: mathShape.id,
        type: "nooma-math",
        props: { ...mathShape.props, latex: draft },
      },
    ] as never);
    setOpen(false);
  };

  return (
    <div className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 pointer-events-auto fixed inset-x-0 bottom-0 z-[120] border-t shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-3 py-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <FunctionSquare className="size-4" aria-hidden />
          <span>Nooma math keypad</span>
          {!mathShape && (
            <span className="text-amber-700 dark:text-amber-400">
              Select a math block or press{" "}
              <kbd className="bg-muted rounded px-1">M</kbd> then click the canvas.
            </span>
          )}
          {mathShape && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="min-h-11 gap-2"
                onClick={openEditor}
              >
                <Pencil className="size-4" />
                Edit LaTeX
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Edit expression</DialogTitle>
                </DialogHeader>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="font-mono min-h-[140px] text-base"
                  spellCheck={false}
                  aria-label="LaTeX expression"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={saveDraft}>
                    Apply
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </>
          )}
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Math symbols"
        >
          {SNIPPETS.map((s) => (
            <Button
              key={s.label}
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11 min-w-11 shrink-0 px-3 text-lg"
              disabled={!mathShape}
              title={s.hint}
              onClick={() => append(s.tex)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
