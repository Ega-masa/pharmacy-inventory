/**
 * 抽出ロジック モジュール
 *
 * 実装済み機能：
 *  - extractReturnCandidates    ① 返品推奨
 *  - extractExcessInventory     ② 過剰在庫
 *  - extractExpiryRisk          ③ 廃棄リスク
 *  - extractLongUnmoved         ④ 長期不動品
 *  - extractUnmovedAfterArrival ⑤ 入荷後不動品
 *  - extractMultiMakerItems     ⑥ 複数メーカー保有
 *  - extractDiscontinued        A 製造中止・経過措置
 *  - extractDeadStockRanking    B デッドストック金額ランキング
 */

import type { InventoryItem, ExtractParams, ExtractResult } from "@/types";
import { daysSince, daysUntil } from "./utils";

function calcTotal(items: InventoryItem[]) {
  const totalAmount = items.reduce((s, i) => s + i.在庫金額, 0);
  return {
    totalCount: items.length,
    totalAmount,
    averageAmount: items.length > 0 ? totalAmount / items.length : 0,
  };
}

function getMonths(item: InventoryItem, params: ExtractParams): number {
  if (params.在庫月数_算出方法 === "csv") {
    return item.在庫月数 ?? item.在庫月数_計算値;
  }
  return item.月使用数 > 0 ? item.在庫月数_計算値 : 999;
}

// ─── ① 返品推奨 ───────────────────────────────
export interface ReturnCandidateItem extends InventoryItem {
  経過日数: number;
  返品期限残日数: number;
  警告レベル: "red" | "orange" | "green";
}

export function extractReturnCandidates(
  items: InventoryItem[],
  params: ExtractParams,
  today: Date = new Date()
): ExtractResult & { items: ReturnCandidateItem[] } {
  const result: ReturnCandidateItem[] = [];
  for (const item of items) {
    if (!item.最終入庫日) continue;
    const elapsed = daysSince(item.最終入庫日, today) ?? 0;
    if (elapsed < params.返品_経過日数下限) continue;
    const noRxAfterArrival = item.最終処方日 === null || item.最終処方日 < item.最終入庫日;
    if (!noRxAfterArrival) continue;
    const minUnit = Math.max(item.最小取引数, 1);
    if (item.理論在庫 < minUnit) continue;
    const returnDeadline = 90;
    const remainingDays = returnDeadline - elapsed;
    let level: "red" | "orange" | "green";
    if (remainingDays <= 10) level = "red";
    else if (remainingDays <= 20) level = "orange";
    else level = "green";
    result.push({ ...item, 経過日数: elapsed, 返品期限残日数: remainingDays, 警告レベル: level });
  }
  result.sort((a, b) => a.返品期限残日数 - b.返品期限残日数);
  return { category: "return", items: result, ...calcTotal(result) };
}

// ─── ② 過剰在庫 ───────────────────────────────
export interface ExcessInventoryItem extends InventoryItem {
  在庫月数_表示: number;
  推奨削減量: number;
  推奨削減金額: number;
  警告レベル: "red" | "orange" | "yellow";
}

export function extractExcessInventory(
  items: InventoryItem[],
  params: ExtractParams
): ExtractResult & { items: ExcessInventoryItem[] } {
  const result: ExcessInventoryItem[] = [];
  for (const item of items) {
    const months = getMonths(item, params);
    if (months < params.過剰在庫_月数下限) continue;
    const targetStock = item.月使用数 * 2;
    const reductionQty = Math.max(0, item.理論在庫 - targetStock);
    const reductionAmount = reductionQty * (item.現薬価 || item.旧薬価 || 0);
    let level: "red" | "orange" | "yellow";
    if (months >= 12) level = "red";
    else if (months >= 6) level = "orange";
    else level = "yellow";
    result.push({ ...item, 在庫月数_表示: months, 推奨削減量: reductionQty, 推奨削減金額: reductionAmount, 警告レベル: level });
  }
  result.sort((a, b) => b.推奨削減金額 - a.推奨削減金額);
  return { category: "excess", items: result, ...calcTotal(result) };
}

// ─── ③ 廃棄リスク ─────────────────────────────
export interface ExpiryRiskItem extends InventoryItem {
  残日数: number;
  警告レベル: "red" | "orange" | "yellow" | "gray";
}

export function extractExpiryRisk(
  items: InventoryItem[],
  params: ExtractParams,
  today: Date = new Date()
): ExtractResult & { items: ExpiryRiskItem[] } {
  const result: ExpiryRiskItem[] = [];
  for (const item of items) {
    if (!item.最終有効期限) continue;
    const remaining = daysUntil(item.最終有効期限, today) ?? 9999;
    if (remaining > params.廃棄リスク_残日数上限) continue;
    let level: "red" | "orange" | "yellow" | "gray";
    if (remaining <= 30) level = "red";
    else if (remaining <= 60) level = "orange";
    else if (remaining <= 90) level = "yellow";
    else level = "gray";
    result.push({ ...item, 残日数: remaining, 警告レベル: level });
  }
  result.sort((a, b) => a.残日数 - b.残日数);
  return { category: "expiry", items: result, ...calcTotal(result) };
}

// ─── ④ 長期不動品 ─────────────────────────────
export interface LongUnmovedItem extends InventoryItem {
  不動日数: number;
  処方履歴なし: boolean;
  警告レベル: "red" | "orange" | "yellow";
}

export function extractLongUnmoved(
  items: InventoryItem[],
  params: ExtractParams,
  today: Date = new Date()
): ExtractResult & { items: LongUnmovedItem[] } {
  const result: LongUnmovedItem[] = [];
  for (const item of items) {
    let noRxDays: number;
    let hasNoHistory: boolean;
    if (item.最終処方日 === null) {
      noRxDays = 9999;
      hasNoHistory = true;
    } else {
      noRxDays = daysSince(item.最終処方日, today) ?? 0;
      hasNoHistory = false;
      if (noRxDays < params.長期不動_経過日数下限) continue;
    }
    let level: "red" | "orange" | "yellow";
    if (noRxDays >= 365 || hasNoHistory) level = "red";
    else if (noRxDays >= 270) level = "orange";
    else level = "yellow";
    result.push({ ...item, 不動日数: noRxDays, 処方履歴なし: hasNoHistory, 警告レベル: level });
  }
  result.sort((a, b) => {
    if (a.処方履歴なし && !b.処方履歴なし) return 1;
    if (!a.処方履歴なし && b.処方履歴なし) return -1;
    return b.在庫金額 - a.在庫金額;
  });
  return { category: "longUnmoved", items: result, ...calcTotal(result) };
}

// ─── ⑤ 入荷後不動品 ───────────────────────────
export interface UnmovedAfterArrivalItem extends InventoryItem {
  入庫後経過日数: number;
  処方履歴なし: boolean;
}

export function extractUnmovedAfterArrival(
  items: InventoryItem[],
  params: ExtractParams,
  today: Date = new Date()
): ExtractResult & { items: UnmovedAfterArrivalItem[] } {
  const result: UnmovedAfterArrivalItem[] = [];
  for (const item of items) {
    if (!item.最終入庫日) continue;
    const elapsed = daysSince(item.最終入庫日, today) ?? 0;
    if (elapsed < params.入荷後不動_経過日数下限) continue;
    const noRxAfterArrival = item.最終処方日 === null || item.最終処方日 < item.最終入庫日;
    if (!noRxAfterArrival) continue;
    result.push({ ...item, 入庫後経過日数: elapsed, 処方履歴なし: item.最終処方日 === null });
  }
  result.sort((a, b) => b.在庫金額 - a.在庫金額);
  return { category: "unmovedAfterArrival", items: result, ...calcTotal(result) };
}

// ─── ⑥ 複数メーカー保有（後発品・同規格限定） ──────────────────
export interface MultiMakerGroup {
  一般名: string;
  規格: string;          // グループキーの規格（mg等、または容量）
  グループキー: string;   // 表示用キー "一般名 規格"
  メーカー数: number;
  品目リスト: InventoryItem[];
  合計在庫金額: number;
  推奨メーカー: string;   // 月使用数が最多のメーカー
}

export interface MultiMakerResult extends ExtractResult {
  groups: MultiMakerGroup[];
}

/**
 * 規格グループキーを生成する
 *
 * 優先順：
 *  1. InventoryItem.規格（品名から抽出したmg/mL等） → 最も正確
 *  2. InventoryItem.容量（PTP 100T 等）             → 規格抽出できない配合剤向け
 *  3. 空文字                                         → グループは一般名のみで識別
 */
function getSpecKey(item: InventoryItem): string {
  if (item.規格 && item.規格.trim()) return item.規格.trim();
  if (item.容量 && item.容量.trim()) return item.容量.trim();
  return "";
}

export function extractMultiMakerItems(
  items: InventoryItem[],
  params: ExtractParams
): MultiMakerResult {
  // ① 後発品かつ一般名あり に絞り込む
  const kouhatsu = items.filter(
    (i) =>
      i.ＣＳＶ後発品 === "後発品" &&
      i.一般名 &&
      i.一般名.trim() !== ""
  );

  // ② 「一般名 + 規格キー」でグルーピング
  const groups = new Map<string, InventoryItem[]>();
  for (const item of kouhatsu) {
    const ippan = item.一般名.trim();
    const spec = getSpecKey(item);
    const key = spec ? `${ippan}\t${spec}` : ippan; // タブ区切りで結合
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  // ③ 同グループ内でメーカーが複数あるものだけ抽出
  const result: MultiMakerGroup[] = [];
  for (const [key, groupItems] of groups) {
    const makers = [
      ...new Set(groupItems.map((i) => i.メーカー.trim()).filter(Boolean)),
    ];
    if (makers.length < params.複数メーカー_社数下限) continue;

    const [ippanmei, specLabel] = key.includes("\t")
      ? key.split("\t")
      : [key, ""];

    const totalAmount = groupItems.reduce((s, i) => s + i.在庫金額, 0);
    // 推奨メーカー：月使用数最大（同数なら在庫金額最大）
    const recommended = groupItems.reduce((best, cur) =>
      cur.月使用数 > best.月使用数 ||
      (cur.月使用数 === best.月使用数 && cur.在庫金額 > best.在庫金額)
        ? cur
        : best
    );

    result.push({
      一般名: ippanmei,
      規格: specLabel,
      グループキー: specLabel ? `${ippanmei} ${specLabel}` : ippanmei,
      メーカー数: makers.length,
      品目リスト: groupItems,
      合計在庫金額: totalAmount,
      推奨メーカー: recommended.メーカー,
    });
  }

  result.sort((a, b) => b.合計在庫金額 - a.合計在庫金額);
  return {
    category: "multiMaker",
    groups: result,
    totalCount: result.length,
    totalAmount: result.reduce((s, g) => s + g.合計在庫金額, 0),
    averageAmount: 0,
    items: [],
  };
}

// ─── A 製造中止・経過措置 ─────────────────────
export interface DiscontinuedItem extends InventoryItem {
  経過措置残日数: number | null;
  消化見込み月数: number | null;
  警告レベル: "red" | "orange" | "yellow" | "gray";
}

export function extractDiscontinued(
  items: InventoryItem[],
  _params: ExtractParams,
  today: Date = new Date()
): ExtractResult & { items: DiscontinuedItem[] } {
  const result: DiscontinuedItem[] = [];
  for (const item of items) {
    const hasDiscontinued = item.製造中止日 !== null;
    const hasMeasure = item.経過措置日 !== null;
    if (!hasDiscontinued && !hasMeasure) continue;
    const measureRemaining = item.経過措置日 ? (daysUntil(item.経過措置日, today) ?? 9999) : null;
    const consumptionMonths = item.月使用数 > 0 ? item.理論在庫 / item.月使用数 : null;
    let level: "red" | "orange" | "yellow" | "gray";
    if (hasDiscontinued) level = "red";
    else if (measureRemaining !== null && measureRemaining <= 90) level = "red";
    else if (measureRemaining !== null && measureRemaining <= 180) level = "orange";
    else if (measureRemaining !== null && measureRemaining <= 365) level = "yellow";
    else level = "gray";
    result.push({ ...item, 経過措置残日数: measureRemaining, 消化見込み月数: consumptionMonths, 警告レベル: level });
  }
  result.sort((a, b) => {
    const order = { red: 0, orange: 1, yellow: 2, gray: 3 };
    if (a.警告レベル !== b.警告レベル) return order[a.警告レベル] - order[b.警告レベル];
    return b.在庫金額 - a.在庫金額;
  });
  return { category: "discontinued", items: result, ...calcTotal(result) };
}

// ─── B デッドストック金額ランキング ─────────────
export type RiskBadge = "返品" | "過剰" | "廃棄" | "長期不動" | "入荷不動" | "製造中止" | "高額不動";

export interface DeadStockItem extends InventoryItem {
  リスク区分: RiskBadge[];
}

export function extractDeadStockRanking(
  items: InventoryItem[],
  params: ExtractParams,
  topN: number = 30,
  today: Date = new Date()
): ExtractResult & { items: DeadStockItem[] } {
  const returnSet = new Set(extractReturnCandidates(items, params, today).items.map((i) => i.商品コード));
  const excessSet = new Set(extractExcessInventory(items, params).items.map((i) => i.商品コード));
  const expirySet = new Set(extractExpiryRisk(items, params, today).items.map((i) => i.商品コード));
  const longUnmovedSet = new Set(extractLongUnmoved(items, params, today).items.map((i) => i.商品コード));
  const unmovedSet = new Set(extractUnmovedAfterArrival(items, params, today).items.map((i) => i.商品コード));
  const discontinuedSet = new Set(extractDiscontinued(items, params, today).items.map((i) => i.商品コード));
  const highInactiveSet = new Set(extractHighValueInactive(items, params, today).items.map((i) => i.商品コード));

  const result: DeadStockItem[] = [];
  for (const item of items) {
    const badges: RiskBadge[] = [];
    if (returnSet.has(item.商品コード)) badges.push("返品");
    if (excessSet.has(item.商品コード)) badges.push("過剰");
    if (expirySet.has(item.商品コード)) badges.push("廃棄");
    if (longUnmovedSet.has(item.商品コード)) badges.push("長期不動");
    if (unmovedSet.has(item.商品コード)) badges.push("入荷不動");
    if (discontinuedSet.has(item.商品コード)) badges.push("製造中止");
    if (highInactiveSet.has(item.商品コード)) badges.push("高額不動");
    if (badges.length === 0) continue;
    result.push({ ...item, リスク区分: badges });
  }
  result.sort((a, b) => b.在庫金額 - a.在庫金額);
  const top = result.slice(0, topN);
  return { category: "deadStock", items: top, ...calcTotal(result) };
}

// ─── C 高額不動品モニタリング ──────────────────
export interface HighValueInactiveItem extends InventoryItem {
  不動日数: number;
  処方履歴なし: boolean;
  警告レベル: "red" | "orange" | "yellow";
}

const ABC_ORDER = { A: 0, B: 1, C: 2, D: 3, E: 4 };

export function extractHighValueInactive(
  items: InventoryItem[],
  params: ExtractParams,
  today: Date = new Date()
): ExtractResult & { items: HighValueInactiveItem[] } {
  const minRank = params.高額品_ABCランク下限;
  const result: HighValueInactiveItem[] = [];
  for (const item of items) {
    const yakka = item.現薬価 || item.旧薬価 || 0;
    if (yakka < params.高額品_単価下限) continue;
    if (ABC_ORDER[item.ABCランク] < ABC_ORDER[minRank]) continue;
    let noRxDays: number;
    let hasNoHistory: boolean;
    if (item.最終処方日 === null) { noRxDays = 9999; hasNoHistory = true; }
    else {
      noRxDays = daysSince(item.最終処方日, today) ?? 0;
      hasNoHistory = false;
      if (noRxDays < params.高額不動_経過日数下限) continue;
    }
    let level: "red" | "orange" | "yellow";
    if (noRxDays >= 180 || hasNoHistory) level = "red";
    else if (noRxDays >= 120) level = "orange";
    else level = "yellow";
    result.push({ ...item, 不動日数: noRxDays, 処方履歴なし: hasNoHistory, 警告レベル: level });
  }
  result.sort((a, b) => b.在庫金額 - a.在庫金額);
  return { category: "highValueInactive", items: result, ...calcTotal(result) };
}

// ─── D 高額アクティブ品一覧 ──────────────────
export interface HighValueActiveItem extends InventoryItem {
  処方経過日数: number;
}

export function extractHighValueActive(
  items: InventoryItem[],
  params: ExtractParams,
  today: Date = new Date()
): ExtractResult & { items: HighValueActiveItem[] } {
  const minRank = params.高額品_ABCランク下限;
  const result: HighValueActiveItem[] = [];
  for (const item of items) {
    const yakka = item.現薬価 || item.旧薬価 || 0;
    if (yakka < params.高額品_単価下限) continue;
    if (ABC_ORDER[item.ABCランク] < ABC_ORDER[minRank]) continue;
    if (!item.最終処方日) continue;
    const elapsed = daysSince(item.最終処方日, today) ?? 9999;
    if (elapsed > params.高額アクティブ_経過日数上限) continue;
    result.push({ ...item, 処方経過日数: elapsed });
  }
  result.sort((a, b) => b.在庫金額 - a.在庫金額);
  return { category: "highValueActive", items: result, ...calcTotal(result) };
}

// ─── 全機能一括実行 ───────────────────────────
export interface AllExtractResults {
  return: ReturnType<typeof extractReturnCandidates>;
  excess: ReturnType<typeof extractExcessInventory>;
  expiry: ReturnType<typeof extractExpiryRisk>;
  longUnmoved: ReturnType<typeof extractLongUnmoved>;
  unmovedAfterArrival: ReturnType<typeof extractUnmovedAfterArrival>;
  multiMaker: MultiMakerResult;
  discontinued: ReturnType<typeof extractDiscontinued>;
  highValueInactive: ReturnType<typeof extractHighValueInactive>;
  highValueActive: ReturnType<typeof extractHighValueActive>;
  deadStock: ReturnType<typeof extractDeadStockRanking>;
}

export function runAllExtractions(
  items: InventoryItem[],
  params: ExtractParams,
  today: Date = new Date()
): AllExtractResults {
  return {
    return: extractReturnCandidates(items, params, today),
    excess: extractExcessInventory(items, params),
    expiry: extractExpiryRisk(items, params, today),
    longUnmoved: extractLongUnmoved(items, params, today),
    unmovedAfterArrival: extractUnmovedAfterArrival(items, params, today),
    multiMaker: extractMultiMakerItems(items, params),
    discontinued: extractDiscontinued(items, params, today),
    highValueInactive: extractHighValueInactive(items, params, today),
    highValueActive: extractHighValueActive(items, params, today),
    deadStock: extractDeadStockRanking(items, params, 30, today),
  };
}
