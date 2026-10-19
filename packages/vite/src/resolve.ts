import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TemplateSource } from "./transform/index.ts";

async function readIfExists(file: string): Promise<TemplateSource | null> {
  try {
    return { path: file, source: await readFile(file, "utf8") };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * 探索先 `roots` を先頭から順に、`<root>/<name>.html` → `<root>/<name>/index.html` の順で探し、
 * 最初に見つかったテンプレートを返す。
 */
export async function resolveTemplate(
  roots: readonly string[],
  name: string,
): Promise<TemplateSource | null> {
  for (const root of roots) {
    const found =
      (await readIfExists(path.join(root, `${name}.html`))) ??
      (await readIfExists(path.join(root, name, "index.html")));
    if (found) return found;
  }
  return null;
}

/**
 * `<link rel="layout" href>` を解決する。`href` が `/` で始まれば Vite の root 基準、
 * それ以外は参照元ファイル `fromPath` のディレクトリ基準。
 */
export function resolveLayoutFile(
  projectRoot: string,
  fromPath: string,
  href: string,
): Promise<TemplateSource | null> {
  const file = href.startsWith("/")
    ? path.join(projectRoot, href)
    : path.resolve(path.dirname(fromPath), href);
  return readIfExists(file);
}
