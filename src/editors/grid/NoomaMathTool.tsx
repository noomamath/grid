import { BaseBoxShapeTool, type TLShape } from "@tldraw/editor";

export class NoomaMathTool extends BaseBoxShapeTool {
  static override id = "nooma-math";
  static override initial = "idle";

  override shapeType = "nooma-math" as never;

  override onCreate(shape: TLShape | null) {
    if (!shape) return;
    this.editor.setCurrentTool("select");
  }
}
