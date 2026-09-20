import { posix } from "node:path";
import { transform, type TransformOptions, type TransformResult } from "../src/index.ts";

/** テンプレート名 → HTML の表からテンプレートを解決する。 */
export function templates(table: Record<string, string>): TransformOptions["resolve"] {
  return (name) =>
    Promise.resolve(
      name in table ? { path: `templates/${name}.html`, source: table[name]! } : null,
    );
}

/** href → HTML の表からレイアウトを解決する。 */
export function layouts(
  table: Record<string, string>,
): NonNullable<TransformOptions["resolveLayout"]> {
  return (href) =>
    Promise.resolve(href in table ? { path: `layouts/${href}`, source: table[href]! } : null);
}

/**
 * 資産の解決を記録する `resolveAsset`。相対指定子は `fromPath` のディレクトリと繋いで `/fs/` の下に、
 * パッケージ名の指定子は `/pkg/` の下に置く。
 */
export function assetResolver(): {
  calls: Array<{ specifier: string; fromPath: string }>;
  resolveAsset: NonNullable<TransformOptions["resolveAsset"]>;
} {
  const calls: Array<{ specifier: string; fromPath: string }> = [];
  return {
    calls,
    resolveAsset(specifier, fromPath) {
      calls.push({ specifier, fromPath });
      const url = specifier.startsWith(".")
        ? `/fs/${posix.join(posix.dirname(fromPath), specifier)}`
        : `/pkg/${specifier}`;
      return Promise.resolve(url);
    },
  };
}

/** 断片を変換し、HTML を返す。 */
export async function expand(
  html: string,
  table: Record<string, string>,
  data?: Record<string, unknown>,
): Promise<string> {
  const result = await transform(html, { resolve: templates(table), data, path: "page.html" });
  return result.html;
}

/** ページ（`<html>` を持つ文書）を変換する。 */
export function page(
  html: string,
  options: Partial<TransformOptions> = {},
): Promise<TransformResult> {
  return transform(html, { resolve: templates({}), path: "page.html", ...options });
}

/** 空白を潰し、doctype の大文字小文字を揃えて比較しやすくする。 */
export function squash(html: string): string {
  return html
    .replace(/<!DOCTYPE/i, "<!doctype")
    .replace(/\s+/g, " ")
    .replace(/> </g, "><")
    .trim();
}
