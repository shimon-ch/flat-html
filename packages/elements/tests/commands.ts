import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { transform, type TemplateSource } from "@flat-html/vite";
import { transform as transformCss } from "lightningcss";
import { minify } from "vite";
import type { BrowserCommand } from "vite-plus/test/node";

/**
 * vitest ブラウザモードの command（Node 側で実行される関数）。
 * 変換 `transform` は parse5 と node:fs に依存しブラウザでは動かないため、ここで実行してブラウザのテストへ結果だけ渡す。
 * このファイルは `vite.config.ts` からだけ読み込む。ブラウザ側のコードから import しない。
 */

/** テンプレートの探索先。参照名 `name` は `src/<name>/index.html` に解決する */
const SRC = path.resolve(import.meta.dirname, "../src");

async function resolve(name: string): Promise<TemplateSource | null> {
  const file = path.join(SRC, name, "index.html");
  try {
    return { path: file, source: await readFile(file, "utf8") };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

/** 断片 HTML の `flat-*` 参照を `src/` のテンプレートで展開し、HTML 文字列を返す。 */
const expand: BrowserCommand<[html: string], string> = async (_ctx, html) => {
  const result = await transform(html, { resolve, path: "test.html" });
  return result.html;
};

/** コンポーネント固有の資産 1 件のファイル名と、縮小後のバイト数。 */
export interface AssetSize {
  file: string;
  bytes: number;
}

/** ファイル名とその内容を受け取り、縮小後のバイト数を返す。 */
type MinifiedBytes = (file: string, content: Buffer) => Promise<number>;

/** JS は Vite の `minify` で縮小する */
const minifiedJs: MinifiedBytes = async (file, content) => {
  const result = await minify(file, content.toString("utf8"));
  return Buffer.byteLength(result.code);
};

/** CSS は Vite が CSS の縮小に使う lightningcss で縮小する。Vite の `minify` は CSS に空文字列を返すため使えない */
const minifiedCss: MinifiedBytes = async (file, content) =>
  transformCss({ filename: file, code: content, minify: true }).code.byteLength;

/** 固有資産とみなす拡張子と、その縮小方法。テンプレート（.html）、仕様（.md）、テスト（.ts）は含めない */
const MINIFIERS = new Map<string, MinifiedBytes>([
  [".css", minifiedCss],
  [".js", minifiedJs],
]);

/** `src/<component>/` 直下にある固有の CSS と JS の縮小後のバイト数を、ファイル名順で返す。 */
const assetSizes: BrowserCommand<[component: string], AssetSize[]> = async (_ctx, component) => {
  const dir = path.join(SRC, component);
  const entries = await readdir(dir, { withFileTypes: true });
  const sizes: AssetSize[] = [];
  for (const entry of entries) {
    const minified = entry.isFile() ? MINIFIERS.get(path.extname(entry.name)) : undefined;
    if (!minified) continue;
    const content = await readFile(path.join(dir, entry.name));
    sizes.push({ file: entry.name, bytes: await minified(entry.name, content) });
  }
  return sizes.sort((a, b) => a.file.localeCompare(b.file));
};

/** `vite.config.ts` の `test.browser.commands` に渡す一覧。 */
export const commands = { expand, assetSizes };

declare module "vite-plus/test/browser" {
  interface BrowserCommands {
    expand: (html: string) => Promise<string>;
    assetSizes: (component: string) => Promise<AssetSize[]>;
  }
}
