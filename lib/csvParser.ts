/**
 * CSV取込モジュール
 *
 * 機能：
 * 1. CP932 (Shift_JIS) から UTF-8 への変換
 * 2. Papa Parse によるCSVパース
 * 3. zaiko × tenshohin の商品コード結合
 * 4. 在庫金額の再計算（理論在庫 × 現薬価）
 * 5. 表示名・規格の生成
 * 6. 最小取引数の取込
 */

import Papa from "papaparse";
import type {
  InventoryItem,
  RawZaikoRow,
  RawTenshohinRow,
} from "@/types";
import { toNumber, parseDate, extractSpec, buildDisplayName } from "./utils";

/**
 * File (CP932/Shift_JIS) から文字列に変換
 *
 * FileReader.readAsText() でエンコーディングを指定。
 * Shift_JIS（CP932）での読込を試行。
 */
async function fileToUTF8String(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        resolve(text);
      } else {
        reject(new Error("ファイル読込に失敗しました"));
      }
    };
    reader.onerror = () =>
      reject(new Error("ファイル読込エラー: " + (reader.error?.message || "")));
    // Shift_JIS (CP932) で読込を試行
    reader.readAsText(file, "shift_jis");
  });
}

/**
 * 在庫照会CSV をパース
 *
 * @param file zaikoSyokai_*.csv ファイル
 * @returns パース済みオブジェクト配列
 */
export async function parseZaikoCSV(file: File): Promise<RawZaikoRow[]> {
  try {
    const csvText = await fileToUTF8String(file);
    return new Promise((resolve, reject) => {
      Papa.parse<RawZaikoRow>(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (results) => {
          if (results.errors.length > 0) {
            reject(new Error(`パースエラー: ${results.errors[0].message}`));
          } else {
            resolve(results.data || []);
          }
        },
        error: (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))),
      });
    });
  } catch (err) {
    throw new Error(
      `在庫照会CSVの読込に失敗：${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * 品目マスタCSV をパース
 *
 * Tenshohin_*.csv は 211列あり、データ行が 214列の場合があるため、
 * ヘッダー列数で切り詰める処理を実装。
 *
 * @param file Tenshohin_*.csv ファイル
 * @returns パース済みオブジェクト配列
 */
export async function parseTenshohinCSV(file: File): Promise<RawTenshohinRow[]> {
  try {
    const csvText = await fileToUTF8String(file);

    return new Promise((resolve, reject) => {
      Papa.parse<RawTenshohinRow>(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        // 列数がヘッダーより多い行を許容（Tenshohin CSVは211列ヘッダーに対し214列のデータ行が存在）
        complete: (results) => {
          // "Too many fields" エラーは無視して処理を続行
          const fatalErrors = results.errors.filter(
            (e) => e.type !== "FieldMismatch"
          );
          if (fatalErrors.length > 0) {
            reject(new Error(`パースエラー: ${fatalErrors[0].message}`));
          } else {
            resolve(results.data || []);
          }
        },
        error: (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))),
      });
    });
  } catch (err) {
    throw new Error(
      `品目マスタCSVの読込に失敗：${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * 在庫照会 × マスタを結合して、InventoryItem配列に正規化
 *
 * 処理フロー：
 * 1. zaiko と tenshohin を商品コードで内部結合
 * 2. 在庫金額を再計算（理論在庫 × 現薬価、または旧薬価）
 * 3. 表示名・規格を生成
 * 4. 日付をDate型に変換
 * 5. 在庫 > 0 のもののみ保持
 *
 * @param zaiko 在庫照会パース結果
 * @param tenshohin 品目マスタパース結果
 * @param today 基準日（デフォルト：今日）
 * @returns 正規化済みInventoryItem配列
 */
export function mergeAndNormalize(
  zaiko: RawZaikoRow[],
  tenshohin: RawTenshohinRow[],
  today: Date = new Date()
): InventoryItem[] {
  // tenshohinをマップ化（商品コード → 行）
  const tenshohinMap = new Map<string, RawTenshohinRow>();
  for (const row of tenshohin) {
    const code = (row.商品コード || "").trim();
    if (code) {
      tenshohinMap.set(code, row);
    }
  }

  const results: InventoryItem[] = [];

  for (const zRow of zaiko) {
    const productCode = (zRow.商品コード || "").trim();
    if (!productCode) continue; // キーなし品目はスキップ

    // マスタ側をロード
    const tRow = tenshohinMap.get(productCode);
    if (!tRow) continue; // マスタにない品目はスキップ

    // 在庫数を数値化
    const riron = toNumber(zRow.理論在庫, 0);

    // 在庫金額の計算：理論在庫 × 薬価
    let genYakka = toNumber(tRow.現薬価, 0);
    let kyuYakka = toNumber(tRow.旧薬価, 0);
    let yakkaFlag: "現薬価" | "旧薬価" | "不明" = "不明";

    let zaikoKingaku = 0;
    if (genYakka > 0) {
      zaikoKingaku = riron * genYakka;
      yakkaFlag = "現薬価";
    } else if (kyuYakka > 0) {
      zaikoKingaku = riron * kyuYakka;
      yakkaFlag = "旧薬価";
    }

    // 月使用数・在庫月数
    const tsukishiyosu = toNumber(zRow.月使用数, 0);
    const zaikoGetsusuu = toNumber(zRow.在庫月数, 0);
    const zaikoGetsusuu_calc =
      tsukishiyosu > 0 ? riron / tsukishiyosu : 0;

    // 最小取引数
    const saiShotori = toNumber(tRow.最小取引数, 1);

    // 規格抽出
    const spec = extractSpec(tRow.品名 || "");

    // 表示名生成
    const displayName = buildDisplayName({
      一般名: tRow.一般名 || "",
      メーカー: tRow.メーカー || "",
      容量: tRow.容量 || "",
      品名: tRow.品名 || "",
    });

    // ロケーション結合
    const locs = [tRow.ロケーション１, tRow.ロケーション２, tRow.ロケーション３]
      .filter((l) => l && (l as string).trim())
      .map((l) => (l as string).trim())
      .join(" / ");

    // 日付変換
    const saiNyukokubi = parseDate(tRow.最終入庫日);
    const saiHassokubi = parseDate(tRow.最終発注日);
    const saiShohoyobi = parseDate(tRow.最終処方日);
    const saiShutsubiyobi = parseDate(tRow.最終出荷日);
    const saiYukoKigen = parseDate(tRow.最終有効期限);
    const seizoChushihi = parseDate(tRow.製造中止日);
    const keikaSochibi = parseDate(tRow.経過措置日);

    const item: InventoryItem = {
      商品コード: productCode,
      janコード: (tRow.ＪＡＮコード || "").trim(),

      品名: (tRow.品名 || "").trim(),
      メーカー: (tRow.メーカー || "").trim(),
      一般名: (tRow.一般名 || "").trim(),
      容量: (tRow.容量 || "").trim(),
      規格: spec,
      表示名: displayName,

      理論在庫: riron,
      単位: (tRow.単位 || "").trim(),
      月使用数: tsukishiyosu,
      最大使用数: toNumber(zRow.最大使用数, 0),
      最小取引数: saiShotori,
      在庫月数: zaikoGetsusuu,
      在庫月数_計算値: zaikoGetsusuu_calc,

      現薬価: genYakka,
      旧薬価: kyuYakka,
      在庫金額: zaikoKingaku,
      在庫金額フラグ: yakkaFlag,

      最終入庫日: saiNyukokubi,
      最終発注日: saiHassokubi,
      最終処方日: saiShohoyobi,
      最終出荷日: saiShutsubiyobi,
      最終有効期限: saiYukoKigen,
      製造中止日: seizoChushihi,
      経過措置日: keikaSochibi,
      最終ロット番号: (tRow.最終ロット番号 || "").trim(),

      ＣＳＶ後発品: (tRow.ＣＳＶ後発品 || "").trim(),
      ＣＳＶ麻薬: (tRow.ＣＳＶ麻薬 || "").trim(),
      ＣＳＶ向精神: (tRow.ＣＳＶ向精神 || "").trim(),
      薬効分類名: (tRow.薬効分類名 || "").trim(),
      ロケーション: locs,

      月使用金額: tsukishiyosu * (genYakka > 0 ? genYakka : kyuYakka),
      ABCランク: "E" as const, // 仮値、後で再計算

      店舗コード: (zRow.店舗コード || "").trim(),
      店舗名: (zRow.店舗名 || "").trim(),
    };

    // 在庫>0のみを対象
    if (riron > 0) {
      results.push(item);
    }
  }

  // ABC分類を計算（月使用金額ベース・累積構成比）
  calcABCRank(results);

  return results;
}

/**
 * ABC分類を計算して各品目の ABCランク を更新する
 *
 * 基準：月使用金額の累積構成比
 *   A: 累積70%以内（主力品）
 *   B: 累積90%以内（準主力品）
 *   C: 累積95%以内（低頻度品）
 *   D: 累積95%超（超低頻度品）
 *   E: 月使用金額0（不動品）
 */
function calcABCRank(items: InventoryItem[]): void {
  // 月使用金額 > 0 のものを降順ソート
  const active = items
    .filter((i) => i.月使用金額 > 0)
    .sort((a, b) => b.月使用金額 - a.月使用金額);

  const total = active.reduce((s, i) => s + i.月使用金額, 0);
  if (total <= 0) return;

  let cumulative = 0;
  const rankMap = new Map<string, "A" | "B" | "C" | "D">();

  for (const item of active) {
    cumulative += item.月使用金額;
    const pct = (cumulative / total) * 100;
    let rank: "A" | "B" | "C" | "D";
    if (pct <= 70) rank = "A";
    else if (pct <= 90) rank = "B";
    else if (pct <= 95) rank = "C";
    else rank = "D";
    rankMap.set(item.商品コード, rank);
  }

  for (const item of items) {
    if (item.月使用金額 <= 0) {
      item.ABCランク = "E";
    } else {
      item.ABCランク = rankMap.get(item.商品コード) ?? "D";
    }
  }
}
