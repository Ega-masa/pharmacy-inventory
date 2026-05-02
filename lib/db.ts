import Dexie, { type EntityTable } from "dexie";
import type { HistoryRecord } from "@/types";

export type HistoryRecordWithId = HistoryRecord & { id: number };

class PharmacyInventoryDB extends Dexie {
  history!: EntityTable<HistoryRecordWithId, "id">;
  constructor() {
    super("PharmacyInventoryDB");
    this.version(1).stores({ history: "++id, uploadedAt, 店舗コード" });
  }
}

export const db = new PharmacyInventoryDB();

export async function saveHistory(record: Omit<HistoryRecord, "id">): Promise<number> {
  const id = await db.history.add(record as HistoryRecordWithId);
  if (id === undefined) throw new Error("履歴の保存に失敗しました");
  return id as number;
}

export async function getAllHistory(): Promise<HistoryRecordWithId[]> {
  return await db.history.orderBy("uploadedAt").reverse().toArray();
}

export async function deleteHistory(id: number): Promise<void> {
  await db.history.delete(id);
}
