import Dexie, { type Table } from "dexie";
import { GUEST_DOCUMENT_ID, TOOL_TYPE_GRID } from "./constants";

/** Keyboard-first cell grid persisted locally (replaces legacy tldraw snapshot). */
export type CellGridDocument = {
  version: 1;
  rows: number;
  cols: number;
  /** Row-major cell contents; strings may be multi-character and overflow visually into empty cells to the right. */
  cells: string[];
};

export type NoomaDocumentRow = {
  id: string;
  toolType: typeof TOOL_TYPE_GRID;
  updatedAt: number;
  /** @deprecated Legacy tldraw document; kept if present for archival only. */
  snapshot?: unknown;
  cellGrid?: CellGridDocument;
  /** Optional JSON blob for simple prefs (theme, etc.). */
  prefs?: Record<string, unknown>;
};

export class NoomaDB extends Dexie {
  documents!: Table<NoomaDocumentRow, string>;

  constructor() {
    super("nooma-grid");
    this.version(1).stores({
      documents: "id, toolType, updatedAt",
    });
  }
}

let db: NoomaDB | null = null;

export function getDB(): NoomaDB {
  if (!db) db = new NoomaDB();
  return db;
}

export async function loadGuestDocument(): Promise<NoomaDocumentRow | undefined> {
  return getDB().documents.get(GUEST_DOCUMENT_ID);
}

export async function saveGuestCellGrid(cellGrid: CellGridDocument): Promise<void> {
  const now = Date.now();
  const existing = await getDB().documents.get(GUEST_DOCUMENT_ID);
  await getDB().documents.put({
    id: GUEST_DOCUMENT_ID,
    toolType: TOOL_TYPE_GRID,
    updatedAt: now,
    snapshot: existing?.snapshot,
    cellGrid,
    prefs: existing?.prefs,
  });
}
