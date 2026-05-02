/**
 * 優先対応順位の自動計算エンジン
 *
 * APIを使わず、抽出結果の数値から以下3軸でスコアリング：
 *  1. 緊急度（締め切り・期限）  … 40%
 *  2. 金額インパクト          … 40%
 *  3. 対応可能性・件数        … 20%
 */

import type {
  AllExtractResults,
  ReturnCandidateItem, ExcessInventoryItem, ExpiryRiskItem,
  LongUnmovedItem, UnmovedAfterArrivalItem, DiscontinuedItem,
  HighValueInactiveItem, HighValueActiveItem,
} from "@/lib/extractors";

export interface PriorityItem {
  view: keyof AllExtractResults;
  label: string;
  score: number;          // 0〜100
  urgencyScore: number;   // 緊急度スコア
  impactScore: number;    // 金額インパクトスコア
  actionScore: number;    // 対応可能性スコア
  /** 件数（緊急）*/
  urgentCount: number;
  /** 件数（合計）*/
  totalCount: number;
  /** 合計金額 */
  totalAmount: number;
  /** 優先する理由（1文） */
  reason: string;
  /** 推奨アクション（1文） */
  action: string;
  /** バッジの色 */
  badgeColor: "red" | "orange" | "yellow" | "blue" | "gray";
  /** スキップ（件数ゼロ） */
  skip: boolean;
}

/**
 * 緊急度の定義
 *  - 締め切りがある（返品期限・有効期限・経過措置期限）
 *  - その期限まで何日かでスコア化
 */

const ACTIONABILITY: Record<keyof AllExtractResults, number> = {
  return:              100, // 返品は期限内なら確実に回収できる
  expiry:              90,  // 廃棄損失を防ぐ直接的な行動がある
  highValueInactive:   85,  // 高額・不動→返品or融通で高額回収
  discontinued:        80,  // 代替品切替は必須かつ計画立案可能
  longUnmoved:         65,  // 他店融通・廃棄検討
  unmovedAfterArrival: 70,  // 返品期限内と重複、発注ミス対処
  excess:              55,  // 発注調整で改善できる
  highValueActive:     45,  // 在庫水準の見直し
  deadStock:           60,  // 複合リスクの総括確認
  multiMaker:          40,  // 管理効率化、直近の損失はない
};

export function calcPriorities(
  results: AllExtractResults,
  totalInventoryAmount: number
): PriorityItem[] {
  const today = new Date();

  const items: PriorityItem[] = [];

  // ─── ① 返品推奨 ───────────────────────────
  {
    const data = results.return.items as ReturnCandidateItem[];
    const urgent = data.filter((i) => i.返品期限残日数 <= 10).length;
    const warn = data.filter((i) => i.返品期限残日数 > 10 && i.返品期限残日数 <= 20).length;
    const totalAmt = results.return.totalAmount;

    // 緊急度：急ぎ件数×3 + 注意件数×1 を100点換算（30件で満点）
    const urgency = Math.min(100, (urgent * 3 + warn) / 30 * 100);
    const impact = calcImpactScore(totalAmt, totalInventoryAmount);
    const action = ACTIONABILITY.return;

    items.push({
      view: "return",
      label: "① 返品推奨",
      score: score(urgency, impact, action),
      urgencyScore: urgency, impactScore: impact, actionScore: action,
      urgentCount: urgent, totalCount: data.length, totalAmount: totalAmt,
      reason: urgent > 0
        ? `返品期限10日以内の品目が${urgent}件（¥${fmt(data.filter(i=>i.返品期限残日数<=10).reduce((s,i)=>s+i.在庫金額,0))}）あります`
        : `返品期限20日以内の品目が${warn}件あります`,
      action: "卸の担当者に連絡し、返品受付の確認と伝票起票を行ってください",
      badgeColor: urgent > 0 ? "red" : warn > 0 ? "orange" : "yellow",
      skip: data.length === 0,
    });
  }

  // ─── ③ 廃棄リスク ─────────────────────────
  {
    const data = results.expiry.items as ExpiryRiskItem[];
    const exp30 = data.filter((i) => i.残日数 <= 30);
    const exp60 = data.filter((i) => i.残日数 > 30 && i.残日数 <= 60);
    const totalAmt = results.expiry.totalAmount;

    const urgency = Math.min(100, (exp30.length * 3 + exp60.length) / 30 * 100);
    const impact = calcImpactScore(exp30.reduce((s, i) => s + i.在庫金額, 0) * 1.5, totalInventoryAmount);
    const action = ACTIONABILITY.expiry;

    items.push({
      view: "expiry",
      label: "③ 廃棄リスク",
      score: score(urgency, impact, action),
      urgencyScore: urgency, impactScore: impact, actionScore: action,
      urgentCount: exp30.length, totalCount: data.length, totalAmount: totalAmt,
      reason: exp30.length > 0
        ? `有効期限30日以内の品目が${exp30.length}件（¥${fmt(exp30.reduce((s,i)=>s+i.在庫金額,0))}）あります`
        : `有効期限60日以内の品目が${exp60.length}件あります`,
      action: "棚で現品確認し、消化見込みを計算。不可なら返品または他店融通を検討してください",
      badgeColor: exp30.length > 0 ? "red" : "orange",
      skip: data.length === 0,
    });
  }

  // ─── C 高額不動品 ─────────────────────────
  {
    const data = results.highValueInactive.items as HighValueInactiveItem[];
    const highUrgent = data.filter((i) => i.警告レベル === "red");
    const totalAmt = results.highValueInactive.totalAmount;

    // 高額不動は件数より金額インパクトを重視
    const urgency = Math.min(100, highUrgent.length / 5 * 100);
    const impact = calcImpactScore(totalAmt, totalInventoryAmount) * 1.3; // 高額品は重み増し
    const action = ACTIONABILITY.highValueInactive;

    items.push({
      view: "highValueInactive",
      label: "C 高額不動品",
      score: score(Math.min(100, urgency), Math.min(100, impact), action),
      urgencyScore: urgency, impactScore: impact, actionScore: action,
      urgentCount: highUrgent.length, totalCount: data.length, totalAmount: totalAmt,
      reason: `高単価の不動品が${data.length}件（¥${fmt(totalAmt)}）あります。1品目で数十万円の損失になりえます`,
      action: "処方医に使用見込みを確認し、見込みがなければ返品・融通・廃棄の手続きを行ってください",
      badgeColor: highUrgent.length > 0 ? "red" : "orange",
      skip: data.length === 0,
    });
  }

  // ─── A 製造中止・経過措置 ─────────────────
  {
    const data = results.discontinued.items as DiscontinuedItem[];
    const stopped = data.filter((i) => i.製造中止日 !== null);
    const measure90 = data.filter(
      (i) => i.経過措置残日数 !== null && i.経過措置残日数 <= 90
    );
    const totalAmt = results.discontinued.totalAmount;

    const urgency = Math.min(100, (stopped.length * 2 + measure90.length) / 15 * 100);
    const impact = calcImpactScore(totalAmt, totalInventoryAmount);
    const action = ACTIONABILITY.discontinued;

    items.push({
      view: "discontinued",
      label: "A 製造中止/経過措置",
      score: score(urgency, impact, action),
      urgencyScore: urgency, impactScore: impact, actionScore: action,
      urgentCount: stopped.length + measure90.length,
      totalCount: data.length, totalAmount: totalAmt,
      reason: stopped.length > 0
        ? `製造中止品が${stopped.length}件あります。代替品への切替が必要です`
        : `経過措置90日以内の品目が${measure90.length}件あります`,
      action: "代替品（後継品）を卸に確認し、採用切替の手続きを開始してください",
      badgeColor: stopped.length > 0 ? "red" : "orange",
      skip: data.length === 0,
    });
  }

  // ─── ⑤ 入荷後不動品 ─────────────────────
  {
    const data = results.unmovedAfterArrival.items as UnmovedAfterArrivalItem[];
    const noHistory = data.filter((i) => i.処方履歴なし).length;
    const totalAmt = results.unmovedAfterArrival.totalAmount;

    // 返品推奨と重複するものは緊急度を下げる
    const returnCodes = new Set(results.return.items.map((i) => i.商品コード));
    const nonReturnAmt = data
      .filter((i) => !returnCodes.has(i.商品コード))
      .reduce((s, i) => s + i.在庫金額, 0);

    const urgency = Math.min(100, noHistory / 10 * 100);
    const impact = calcImpactScore(nonReturnAmt, totalInventoryAmount);
    const action = ACTIONABILITY.unmovedAfterArrival;

    items.push({
      view: "unmovedAfterArrival",
      label: "⑤ 入荷後不動品",
      score: score(urgency, impact, action),
      urgencyScore: urgency, impactScore: impact, actionScore: action,
      urgentCount: noHistory, totalCount: data.length, totalAmount: totalAmt,
      reason: `入荷後に一度も処方されていない品目が${data.length}件（うち処方履歴なし${noHistory}件）あります`,
      action: "入荷の経緯を確認し、返品期限内なら返品、超過なら他店融通を検討してください",
      badgeColor: noHistory > 5 ? "orange" : "yellow",
      skip: data.length === 0,
    });
  }

  // ─── ④ 長期不動品 ─────────────────────────
  {
    const data = results.longUnmoved.items as LongUnmovedItem[];
    const noHistory = data.filter((i) => i.処方履歴なし).length;
    const over1year = data.filter((i) => !i.処方履歴なし && i.不動日数 >= 365).length;
    const totalAmt = results.longUnmoved.totalAmount;

    const urgency = Math.min(100, (noHistory + over1year) / 15 * 100);
    const impact = calcImpactScore(totalAmt, totalInventoryAmount);
    const action = ACTIONABILITY.longUnmoved;

    items.push({
      view: "longUnmoved",
      label: "④ 長期不動品",
      score: score(urgency, impact, action),
      urgencyScore: urgency, impactScore: impact, actionScore: action,
      urgentCount: noHistory + over1year, totalCount: data.length, totalAmount: totalAmt,
      reason: `${data.length}件（¥${fmt(totalAmt)}）が${noHistory > 0 ? `処方履歴なし${noHistory}件含む` : ""}長期不動です`,
      action: "採用継続の必要性を処方医に確認し、不要なら採用廃止・他店融通・廃棄を検討してください",
      badgeColor: (noHistory + over1year) > 10 ? "orange" : "yellow",
      skip: data.length === 0,
    });
  }

  // ─── ② 過剰在庫 ──────────────────────────
  {
    const data = results.excess.items as ExcessInventoryItem[];
    const totalAmt = results.excess.totalAmount;
    const reductionAmt = data.reduce((s, i) => s + i.推奨削減金額, 0);

    const urgency = 20; // 過剰在庫に締め切りはない
    const impact = calcImpactScore(reductionAmt, totalInventoryAmount);
    const action = ACTIONABILITY.excess;

    items.push({
      view: "excess",
      label: "② 過剰在庫",
      score: score(urgency, impact, action),
      urgencyScore: urgency, impactScore: impact, actionScore: action,
      urgentCount: 0, totalCount: data.length, totalAmount: totalAmt,
      reason: `発注調整で¥${fmt(reductionAmt)}のキャッシュ改善が見込めます（${data.length}品目）`,
      action: "削減見込額の大きい品目から発注量を調整・停止してください",
      badgeColor: reductionAmt > 1000000 ? "orange" : "yellow",
      skip: data.length === 0,
    });
  }

  // ─── ⑥ 複数メーカー ───────────────────────
  {
    const groups = results.multiMaker.groups;
    const totalAmt = results.multiMaker.totalAmount;

    const urgency = 10; // 管理効率化・緊急性なし
    const impact = calcImpactScore(totalAmt, totalInventoryAmount) * 0.5;
    const action = ACTIONABILITY.multiMaker;

    items.push({
      view: "multiMaker",
      label: "⑥ 複数メーカー統一",
      score: score(urgency, impact, action),
      urgencyScore: urgency, impactScore: impact, actionScore: action,
      urgentCount: 0, totalCount: groups.length, totalAmount: totalAmt,
      reason: `同規格・後発品で複数メーカー混在が${groups.length}組合せあります`,
      action: "推奨メーカー以外の発注を停止し、在庫消化後に統一してください",
      badgeColor: "blue",
      skip: groups.length === 0,
    });
  }

  // ─── D 高額アクティブ ─────────────────────
  {
    const data = results.highValueActive.items as HighValueActiveItem[];
    const over3m = data.filter((i) => i.月使用数 > 0 && i.在庫月数_計算値 > 3).length;
    const totalAmt = results.highValueActive.totalAmount;

    const urgency = 15;
    const impact = calcImpactScore(totalAmt, totalInventoryAmount) * 0.3;
    const action = ACTIONABILITY.highValueActive;

    items.push({
      view: "highValueActive",
      label: "D 高額アクティブ",
      score: score(urgency, impact, action),
      urgencyScore: urgency, impactScore: impact, actionScore: action,
      urgentCount: over3m, totalCount: data.length, totalAmount: totalAmt,
      reason: `高単価品${data.length}件のうち、在庫月数3か月超が${over3m}件あります`,
      action: "処方間隔に合わせて都度発注へ切り替え、過剰在庫を防止してください",
      badgeColor: over3m > 5 ? "orange" : "gray",
      skip: data.length === 0,
    });
  }

  // スコア降順でソートし、件数ゼロ（skip）を末尾に
  items.sort((a, b) => {
    if (a.skip !== b.skip) return a.skip ? 1 : -1;
    return b.score - a.score;
  });

  return items;
}

// ─── ヘルパー関数 ───────────────────────────

function score(urgency: number, impact: number, action: number): number {
  return Math.round(urgency * 0.4 + impact * 0.4 + action * 0.2);
}

function calcImpactScore(amt: number, total: number): number {
  if (total <= 0) return 0;
  // 総在庫金額に対する割合を0〜100にマッピング（10%で100点）
  return Math.min(100, (amt / total) * 1000);
}

function fmt(n: number): string {
  return n.toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}
