import { T } from "@tldraw/validate";
import {
  createShapePropsMigrationSequence,
  type RecordProps,
  type TLBaseShape,
} from "@tldraw/tlschema";

export type NoomaMathProps = {
  w: number;
  h: number;
  latex: string;
};

export type TLNoomaMathShape = TLBaseShape<"nooma-math", NoomaMathProps>;

export const noomaMathShapeProps: RecordProps<TLNoomaMathShape> = {
  w: T.number,
  h: T.number,
  latex: T.string,
};

export const noomaMathShapeMigrations = createShapePropsMigrationSequence({
  sequence: [],
});
