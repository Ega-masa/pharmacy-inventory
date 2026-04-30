/**
 * 抽出ロジック モジュール
 *
 * 【Phase 4で実装予定】各機能の抽出関数：
 *  - extractReturnCandidates    返品推奨（入庫60日以内）
 *  - extractExcessInventory     過剰在庫（在庫月数3か月以上）
 *  - extractExpiryRisk          廃棄リスク（期限180日以内）
 *  - extractLongUnmoved         長期不動品（処方なし180日以上）
 *  - extractUnmovedAfterArrival 入荷後不動品（入庫90日以上、処方なし）
 *  - extractMultiMakerItems     複数メーカー保有
 *  - extractDiscontinued        製造中止・経過措置（追加機能A）
 *  - extractDeadStockRanking    デッドストック金額ランキング（追加機能B）
 *
 * このファイルは初期化フェーズではスタブのみ。Phase 4で本体実装します。
 */

import type { InventoryItem, ExtractParams, ExtractResult } from "@/types";

export function extractReturnCandidates(
  _items: InventoryItem[],
  _params: ExtractParams
): ExtractResult {
  throw new Error("Phase 4で実装予定");
}

export function extractExcessInventory(
  _items: InventoryItem[],
  _params: ExtractParams
): ExtractResult {
  throw new Error("Phase 4で実装予定");
}

export function extractExpiryRisk(
  _items: InventoryItem[],
  _params: ExtractParams
): ExtractResult {
  throw new Error("Phase 4で実装予定");
}

export function extractLongUnmoved(
  _items: InventoryItem[],
  _params: ExtractParams
): ExtractResult {
  throw new Error("Phase 4で実装予定");
}

export function extractUnmovedAfterArrival(
  _items: InventoryItem[],
  _params: ExtractParams
): ExtractResult {
  throw new Error("Phase 4で実装予定");
}

export function extractMultiMakerItems(
  _items: InventoryItem[],
  _params: ExtractParams
): ExtractResult {
  throw new Error("Phase 4で実装予定");
}

export function extractDiscontinued(
  _items: InventoryItem[],
  _params: ExtractParams
): ExtractResult {
  throw new Error("Phase 4で実装予定");
}

export function extractDeadStockRanking(
  _items: InventoryItem[],
  _params: ExtractParams,
  _topN?: number
): ExtractResult {
  throw new Error("Phase 4で実装予定");
}
