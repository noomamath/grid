import Dexie, { type Table } from "dexie";
import { GUEST_DOCUMENT_ID, TOOL_TYPE_GRID } from "./constants";

export type NoomaDocumentRow = {
  id: string;
  toolType: typeof TOOL_TYPE_GRID;
  updatedAt: number;
  /** Serialized `TLEditorSnapshot` from `getSnapshot(store)`. */
  snapshot: unknown;
  /** Optional JSON blob for simple prefs (theme, keypad layout, etc.). */
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

export async function saveGuestSnapshot(snapshot: unknown): Promise<void> {
  const now = Date.now();
  await getDB().documents.put({
    id: GUEST_DOCUMENT_ID,
    toolType: TOOL_TYPE_GRID,
    updatedAt: now,
    snapshot,
  });
}
