/**
 * CSV取込モジュール
 *
 * 【Phase 3で実装予定】
 * - CP932 (Shift_JIS) から UTF-8 への変換
 * - Papa Parse による parsing
 * - zaiko × tenshohin の商品コード結合
 * - 在庫金額の再計算（理論在庫 × 現薬価）
 * - 表示名・規格の生成
 *
 * このファイルは初期化フェーズではスタブのみ。Phase 3で本体実装します。
 */

import type { InventoryItem, RawZaikoRow, RawTenshohinRow } from "@/types";

export async function parseZaikoCSV(_file: File): Promise<RawZaikoRow[]> {
  throw new Error("Phase 3で実装予定");
}

export async function parseTenshohinCSV(_file: File): Promise<RawTenshohinRow[]> {
  throw new Error("Phase 3で実装予定");
}

export function mergeAndNormalize(
  _zaiko: RawZaikoRow[],
  _tenshohin: RawTenshohinRow[]
): InventoryItem[] {
  throw new Error("Phase 3で実装予定");
}
