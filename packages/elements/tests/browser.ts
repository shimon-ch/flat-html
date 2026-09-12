import { commands } from "vite-plus/test/browser";
import type { AssetSize } from "./commands.ts";

/**
 * ブラウザ側のテストで使う共有の補助。elements は css に依存する（design.md の層構造）ので、
 * 描画は常に `@flat-html/css` を当てた状態で行う。
 * `@flat-html/css` の主エントリは `flat.css` そのものだが、拡張子のない指定子には型宣言（`vite/client` の `*.css`）が
 * 当たらないため、`exports` の `./*` 経由でファイル名まで書く。
 */
import "@flat-html/css/flat.css";

/** 断片 HTML の `flat-*` 参照を Node 側で展開し、HTML 文字列を返す。 */
export function expand(html: string): Promise<string> {
  return commands.expand(html);
}

/** `html` を `document.body` に描画する。以前の描画は消える。 */
export function render(html: string): void {
  document.body.innerHTML = html;
}

/** 空白を潰し、出力の形を比較しやすくする。 */
export function squash(html: string): string {
  return html.replace(/\s+/g, " ").replace(/> </g, "><").trim();
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

function isLayoutShift(entry: PerformanceEntry): entry is LayoutShiftEntry {
  return (
    entry.entryType === "layout-shift" &&
    "value" in entry &&
    typeof entry.value === "number" &&
    "hadRecentInput" in entry &&
    typeof entry.hadRecentInput === "boolean"
  );
}

/**
 * 直前の DOM 変更が画面に描かれるまで待つ。
 * requestAnimationFrame はそのフレームの描画前に呼ばれるので、2 回またいで 1 回以上の描画を挟む。
 * 一度も描かれていない要素の移動はレイアウトシフトに数えられないため、計測の前後で必ず描画を挟む必要がある。
 */
function painted(): Promise<void> {
  return new Promise((done) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0)));
  });
}

/**
 * `html` を描画し、描画完了後に `enhance` を実行して、その間の累積レイアウトシフト（CLS）を返す（ADR-0021）。
 * CLS の定義に従い、直前の利用者入力に起因するシフト（`hadRecentInput`）は数えない。
 * Custom Element を持つコンポーネントでは、`enhance` に定義モジュールの読み込みを渡す。
 * JS を持たないコンポーネントでは省略し、描画だけを測る。
 */
export async function layoutShiftOf(html: string, enhance?: () => Promise<void>): Promise<number> {
  let total = 0;
  const collect = (entries: PerformanceEntryList): void => {
    for (const entry of entries) {
      if (isLayoutShift(entry) && !entry.hadRecentInput) total += entry.value;
    }
  };
  const observer = new PerformanceObserver((list) => collect(list.getEntries()));
  observer.observe({ type: "layout-shift" });
  try {
    render(html);
    await painted();
    if (enhance) {
      await enhance();
      await painted();
    }
    collect(observer.takeRecords());
  } finally {
    observer.disconnect();
  }
  return total;
}

/** コンポーネント固有の資産のバイト数。`files` が空なら固有資産を持たない。 */
export interface AssetBytes {
  css: number;
  js: number;
  files: AssetSize[];
}

function sum(files: AssetSize[], extension: string): number {
  return files.filter((f) => f.file.endsWith(extension)).reduce((total, f) => total + f.bytes, 0);
}

/** `src/<component>/` 直下の固有 CSS と JS のバイト数を Node 側で数えて返す（ADR-0021 のバイト上限に使う）。 */
export async function assetBytes(component: string): Promise<AssetBytes> {
  const files = await commands.assetSizes(component);
  return { css: sum(files, ".css"), js: sum(files, ".js"), files };
}
