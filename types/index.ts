// ========================================
// CSV生データの型（ファイル読み込み直後）
// ========================================

/** zaikoSyokai_*.csv 在庫照会の生データ */
export interface RawZaikoRow {
  No: string;
  メーカー: string;
  商品コード: string;
  品名: string;
  容量: string;
  理論在庫: string;
  単位: string;
  単価: string;
  在庫金額: string;
  薬価金額: string;
  最大使用数: string;
  月使用数: string;
  在庫月数: string;
  ＡＢＣ: string;
  最終使用日: string;
  ＧＳ１コード包装: string;
  ＧＳ１コード調剤: string;
  ＧＳ１コード元箱: string;
  ＪＡＮコード: string;
  本部コード: string;
  店舗コード: string;
  店舗名: string;
  店舗管理Ｎｏ: string;
  作成日: string;
  作成時間: string;
  作成者ＩＤ: string;
}

/** Tenshohin_*.csv 品目マスタの主要列のみ抽出 */
export interface RawTenshohinRow {
  商品コード: string;
  ＪＡＮコード: string;
  品名: string;
  容量: string;
  メーカー: string;
  最終入庫価: string;
  最終入庫日: string;
  最終発注日: string;
  最終処方日: string;
  最終出荷日: string;
  最終有効期限: string;
  最終ロット番号: string;
  単位: string;
  管理容量: string;
  新購入価: string;
  現薬価: string;
  旧薬価: string;
  薬価改定日: string;
  製造中止日: string;
  経過措置日: string;
  登録日: string;
  採用中止日: string;
  ＣＳＶ後発品: string;
  ＣＳＶ麻薬: string;
  ＣＳＶ向精神: string;
  ＣＳＶ覚醒剤: string;
  一般名: string;
  薬効分類名: string;
  ロケーション１: string;
  ロケーション２: string;
  ロケーション３: string;
  最小取引数: string;
  発注先: string;
  // 全210+列のうち、本システムで使用するもののみ宣言
  // 不足分は実装時に追加
}

// ========================================
// 結合済み・正規化済みドメイン型
// ========================================

/** 在庫照会×マスタ結合後の正規化済み品目 */
export interface InventoryItem {
  // 識別
  商品コード: string;
  janコード: string;

  // 表示用
  品名: string;
  メーカー: string;
  一般名: string;
  容量: string;
  規格: string; // 品名から正規表現抽出 (例: "5mg", "0.025%")
  表示名: string; // "成分名（メーカー）容量"

  // 在庫
  理論在庫: number;
  単位: string;
  月使用数: number;
  最大使用数: number;
  最小取引数: number; // 最小発注単位（Tenshohin.最小取引数）
  在庫月数: number; // CSV値（信頼できない場合は再計算）
  在庫月数_計算値: number; // 理論在庫 ÷ 月使用数

  // 金額（再計算）
  現薬価: number;
  旧薬価: number;
  在庫金額: number; // 理論在庫 × 現薬価
  在庫金額フラグ: "現薬価" | "旧薬価" | "不明";

  // 日付
  最終入庫日: Date | null;
  最終発注日: Date | null;
  最終処方日: Date | null;
  最終出荷日: Date | null;
  最終有効期限: Date | null;
  製造中止日: Date | null;
  経過措置日: Date | null;
  最終ロット番号: string;

  // 区分
  ＣＳＶ後発品: string; // "先発品" | "後発品" | "対象外"
  ＣＳＶ麻薬: string;
  ＣＳＶ向精神: string;
  薬効分類名: string;
  ロケーション: string; // ロケーション1〜3を結合

  // メタ
  店舗コード: string;
  店舗名: string;
}

// ========================================
// 抽出パラメータ
// ========================================
export interface ExtractParams {
  /**
   * 返品推奨の条件（以下の3つすべてを満たす品目を抽出）
   *  1. 最終入庫日からの経過日数 >= 返品_経過日数下限 (デフォルト 60日)
   *  2. 入庫日以降に処方実績がない（最終処方日 < 最終入庫日 or 最終処方日が空）
   *  3. 理論在庫 >= 最小取引数（最小発注単位以上の在庫がある）
   */
  返品_経過日数下限: number; // デフォルト 60
  過剰在庫_月数下限: number; // デフォルト 3.0
  廃棄リスク_残日数上限: number; // デフォルト 180
  長期不動_経過日数下限: number; // デフォルト 180
  入荷後不動_経過日数下限: number; // デフォルト 90
  複数メーカー_社数下限: number; // デフォルト 2
  在庫月数_算出方法: "csv" | "calc"; // CSV値かシステム再計算か
}

export const DEFAULT_PARAMS: ExtractParams = {
  返品_経過日数下限: 60,
  過剰在庫_月数下限: 3.0,
  廃棄リスク_残日数上限: 180,
  長期不動_経過日数下限: 180,
  入荷後不動_経過日数下限: 90,
  複数メーカー_社数下限: 2,
  在庫月数_算出方法: "calc",
};

// ========================================
// 抽出結果型
// ========================================
export interface ExtractResult<T = InventoryItem> {
  category:
    | "return"
    | "excess"
    | "expiry"
    | "longUnmoved"
    | "unmovedAfterArrival"
    | "multiMaker"
    | "discontinued"
    | "deadStock";
  items: T[];
  totalCount: number;
  totalAmount: number;
  averageAmount: number;
}

// ========================================
// 履歴管理（IndexedDB）
// ========================================
export interface HistoryRecord {
  id?: number;
  uploadedAt: Date;
  zaikoFileName: string;
  tenshohinFileName: string;
  店舗コード: string;
  店舗名: string;
  totalItems: number;
  inStockItems: number;
  summary: {
    return: { count: number; amount: number };
    excess: { count: number; amount: number };
    expiry: { count: number; amount: number };
    longUnmoved: { count: number; amount: number };
    unmovedAfterArrival: { count: number; amount: number };
    multiMaker: { count: number };
    discontinued: { count: number; amount: number };
    deadStock: { count: number; amount: number };
  };
  params: ExtractParams;
}
