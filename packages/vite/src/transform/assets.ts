import {
  appendToHead,
  detachWithIndent,
  findAllInDocumentTree,
  findAllOutsideDiscardedContent,
  findFirst,
  getAttr,
  lineOf,
  setAttr,
  type Document,
  type Element,
  type ParentNode,
} from "./dom.ts";
import { markValueBraces, unmarkBraces } from "./source.ts";
import { TemplateError, type TransformOptions } from "./types.ts";

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
 * 資産の指定子を、ファイルを指すパスの部分と、最初の `?` か `#` から後ろの部分に分ける（ADR-0034）。
 * `#` で始まる指定子（Node のサブパス import）は、先頭の `#` を区切りとみなさず、2 文字目以降の `?` と `#` で切る。
 * 区切りがなければ `suffix` は空文字。
 */
function splitSpecifier(specifier: string): { path: string; suffix: string } {
  const start = specifier.startsWith("#") ? 1 : 0;
  const found = specifier.slice(start).search(/[?#]/);
  const end = found === -1 ? specifier.length : start + found;
  return { path: specifier.slice(0, end), suffix: specifier.slice(end) };
}

/**
 * 書かれた URL のパスの部分 `path`（`splitSpecifier`）が、ファイルの位置を基準に解決する対象か。
 * `/` で始まる URL、スキームを持つ URL、空の URL は対象外で、書かれたまま Vite に渡る。
 * パスの部分に `{{` を含む URL も対象外で、式の評価の後の値のまま Vite に渡る（ADR-0034）。
 * `?` か `#` から後ろの部分の `{{` は問わない。
 */
function isFileSpecifier(path: string): boolean {
  return path !== "" && !path.startsWith("/") && !SCHEME.test(path) && !path.includes("{{");
}

/**
 * `root` の中の資産要素の URL を、`fromPath` の位置を基準に解決した URL へ書き換える。
 * 集約より前に呼ぶ。重複除去の鍵が解決後の URL になり、別々のテンプレートが同じ資産を指しても 1 つにまとまる。
 * 解決は式の評価より前に行う。パスの部分に `{{` を含む URL は解決しない（`isFileSpecifier`）。
 * `resolveAsset` にはパスの部分だけを、文字参照で書いた波括弧を `{` と `}` に戻して渡す（`unmarkBraces`）。
 * 返った URL の波括弧は区切りとみなさない文字にし（`markValueBraces`。ADR-0035）、`?` か `#` から後ろを書かれたまま付け直す。
 * 素の `<template>`（`<template shadowrootmode>` を含む）の中身も、`<template if/each>` の中身も解決する（ADR-0024）。
 * `html` を持ち `each` を持たない `<template>` の中身は、描画で捨てられるので解決しない（`findAllOutsideDiscardedContent`）。
 * `resolveAsset` が null を返したら、`fromPath` とその要素の行を添えて `TemplateError` を投げる（ADR-0034）。
 * `resolveAsset` が例外を投げたら、その文言を理由として添えた `TemplateError` を投げる。
 */
export async function resolveAssetUrls(
  root: ParentNode,
  fromPath: string,
  resolveAsset: NonNullable<TransformOptions["resolveAsset"]>,
): Promise<void> {
  for (const el of findAllOutsideDiscardedContent(root, (e) => assetRef(e) !== undefined)) {
    const ref = assetRef(el)!;
    const { path, suffix } = splitSpecifier(ref.url);
    if (!isFileSpecifier(path)) continue;
    const specifier = unmarkBraces(path);
    let resolved: string | null;
    try {
      resolved = await resolveAsset(specifier, fromPath);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new TemplateError(`資産 ${specifier} を解決できない: ${reason}`, fromPath, lineOf(el));
    }
    if (resolved === null) {
      throw new TemplateError(`資産 ${specifier} が見つからない`, fromPath, lineOf(el));
    }
    setAttr(el, ref.attr, markValueBraces(resolved) + suffix);
  }
}

/**
 * 文書中の資産（`<link rel="stylesheet|modulepreload|preload">` と `src` 付き `<script type="module">`）を
 * 文書順のまま `<head>` の末尾へ移し、同じ種類と URL のものは最初の 1 つだけ残す。`<head>` がなければ何もしない。
 * `<head>` の中の空白は要素と一緒に動かし、`<body>` の空白には触らない（ADR-0030）。
 * `indent` は移した資産の前に置く `<head>` の字下げで、`appendToHead` に渡す。描画で `<head>` の子が消える前に `headIndent` で求めておく。
 * 式の評価の後に呼ぶ。どの `<template>` の中身も探さない（`findAllInDocumentTree`）。
 */
export function aggregate(document: Document, indent: string | undefined): void {
  const head = findFirst(document, "head");
  if (!head) return;
  const seen = new Set<string>();
  for (const el of findAllInDocumentTree(document, (e) => assetKey(e) !== undefined)) {
    const key = assetKey(el)!;
    if (seen.has(key)) {
      detachWithIndent(el);
      continue;
    }
    seen.add(key);
    appendToHead(head, el, indent);
  }
}
