import {
  append,
  detach,
  findAll,
  findFirst,
  getAttr,
  setAttr,
  type Document,
  type Element,
  type ParentNode,
} from "./dom.ts";
import type { TransformOptions } from "./types.ts";

const LINK_RELS = ["stylesheet", "modulepreload", "preload"];

/** 集約の対象の資産要素。`kind` は種類、`attr` は URL を持つ属性の名前、`url` は書かれたままの値。 */
interface AssetRef {
  kind: string;
  attr: "href" | "src";
  url: string;
}

/** 集約の対象なら、その種類と URL の在処を返す（ADR-0013）。対象でなければ `undefined`。 */
function assetRef(el: Element): AssetRef | undefined {
  if (el.tagName === "link") {
    const rels = (getAttr(el, "rel") ?? "").split(/\s+/);
    const kind = LINK_RELS.find((r) => rels.includes(r));
    const href = getAttr(el, "href");
    if (kind === undefined || href === undefined) return undefined;
    return { kind: `link:${kind}`, attr: "href", url: href };
  }
  if (el.tagName === "script" && getAttr(el, "type") === "module") {
    const src = getAttr(el, "src");
    return src === undefined ? undefined : { kind: "script:module", attr: "src", url: src };
  }
  return undefined;
}

/**
 * 集約の対象なら、種類と URL を組にした鍵を返す（ADR-0013）。
 * 同じ URL でも `<link rel="modulepreload">` と `<script type="module">` は別物なので、種類を鍵に含める。
 */
export function assetKey(el: Element): string | undefined {
  const ref = assetRef(el);
  return ref === undefined ? undefined : `${ref.kind}:${ref.url}`;
}

/** スキームを持つ URL（`https:`、`data:` など）。 */
const SCHEME = /^[a-z][a-z\d+\-.]*:/i;

/**
 * 書かれた URL が、ファイルの位置を基準に解決する対象か。
 * `/` で始まる URL、スキームを持つ URL、空の URL は対象外で、書かれたまま Vite に渡る。
 */
function isFileSpecifier(url: string): boolean {
  return url !== "" && !url.startsWith("/") && !SCHEME.test(url);
}

/**
 * `root` の中の資産要素の URL を、`fromPath` の位置を基準に解決した URL へ書き換える。
 * 集約より前に呼ぶ。重複除去の鍵が解決後の URL になり、別々のテンプレートが同じ資産を指しても 1 つにまとまる。
 * 解決は式の評価より前に行うので、URL に `{{ }}` は使えない。
 */
export async function resolveAssetUrls(
  root: ParentNode,
  fromPath: string,
  resolveAsset: NonNullable<TransformOptions["resolveAsset"]>,
): Promise<void> {
  for (const el of findAll(root, (e) => assetRef(e) !== undefined)) {
    const ref = assetRef(el)!;
    if (!isFileSpecifier(ref.url)) continue;
    const resolved = await resolveAsset(ref.url, fromPath);
    if (resolved !== null) setAttr(el, ref.attr, resolved);
  }
}

/**
 * 文書中の資産（`<link rel="stylesheet|modulepreload|preload">` と `src` 付き `<script type="module">`）を
 * 文書順のまま `<head>` の末尾へ移し、同じ種類と URL のものは最初の 1 つだけ残す。`<head>` がなければ何もしない。
 */
export function aggregate(document: Document): void {
  const head = findFirst(document, "head");
  if (!head) return;
  const seen = new Set<string>();
  for (const el of findAll(document, (e) => assetKey(e) !== undefined)) {
    const key = assetKey(el)!;
    if (seen.has(key)) {
      detach(el);
      continue;
    }
    seen.add(key);
    append(head, el);
  }
}
