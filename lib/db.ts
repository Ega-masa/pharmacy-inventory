import Dexie, { type EntityTable } from "dexie";
import type { HistoryRecord } from "@/types";

class PharmacyInventoryDB extends Dexie {
  history!: EntityTable<HistoryRecord, "id">;

  constructor() {
    super("PharmacyInventoryDB");
    this.version(1).stores({
      history: "++id, uploadedAt, 店舗コード",
    });
  }
}

export const db = new PharmacyInventoryDB();

/** 履歴を保存 */
export async function saveHistory(record: Omit<HistoryRecord, "id">): Promise<number> {
  const id = await db.history.add(record as HistoryRecord);
  if (id === undefined) throw new Error("履歴の保存に失敗しました");
  return id as number;
}

/** 全履歴取得（新しい順） */
export async function getAllHistory(): Promise<HistoryRecord[]> {
  return await db.history.orderBy("uploadedAt").reverse().toArray();
}

/** 履歴削除 */
export async function deleteHistory(id: number): Promise<void> {
  await db.history.delete(id);
}

/** 特定店舗の履歴取得 */
export async function getHistoryByStore(storeCode: string): Promise<HistoryRecord[]> {
  return await db.history
    .where("店舗コード")
    .equals(storeCode)
    .reverse()
    .sortBy("uploadedAt");
}
