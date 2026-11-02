import { readFile, stat } from "node:fs/promises";
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

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * パッケージ名の指定子 `id` を、ファイル `importer` から見て解決し、解決先のパスを返す。見つからなければ `undefined`。
 * 解決できない理由が分かるとき（`exports` にないサブパスなど）は、その理由を文言に持つ例外を投げる。
 * プラグインは Vite の解決器（`config.createResolver()`）を渡す。
 */
export type ResolvePackage = (id: string, importer: string) => Promise<string | undefined>;

/**
 * テンプレートやレイアウトに書かれた資産の指定子を、そのファイル `fromPath` の位置を基準に実ファイルへ解決し、絶対パスを返す（ADR-0034）。
 * `specifier` はパスの部分だけで、`?` と `#` から後ろを含まない。`transform` が外して渡し、URL に付け直す。
 * `./` `../` で始まる相対パスはファイルシステムで、それ以外（`@scope/pkg/path`、`pkg/path`、`#` で始まるサブパス、Vite の別名）は
 * `resolvePackage` で探す。解決先が実在するファイルでなければ null。`resolvePackage` が投げた例外はそのまま投げる。
 */
export async function resolveAssetFile(
  fromPath: string,
  specifier: string,
  resolvePackage: ResolvePackage,
): Promise<string | null> {
  const file =
    specifier.startsWith("./") || specifier.startsWith("../")
      ? path.resolve(path.dirname(fromPath), specifier)
      : await resolvePackage(specifier, fromPath);
  return file !== undefined && path.isAbsolute(file) && (await isFile(file)) ? file : null;
}
