import { resolveAssetUrls } from "./assets.ts";
import {
  appendToHead,
  childrenOf,
  detachWithIndent,
  findAllInDocumentTree,
  findAllOutsideInertTemplates,
  findFirst,
  getAttr,
  headIndent,
  isBlankText,
  lineOf,
  replaceWith,
  setAttr,
  sourcePathOf,
  type Document,
  type Element,
} from "./dom.ts";
import { distribute } from "./slots.ts";
import { parseDocumentSource, unmarkBraces } from "./source.ts";
import { TemplateError, type TransformOptions, type TransformResult } from "./types.ts";

interface DocumentParts {
  html: Element;
  head: Element;
  body: Element;
}

function partsOf(document: Document, path: string | undefined): DocumentParts {
  const html = findFirst(document, "html");
  const head = html && findFirst(html, "head");
  const body = html && findFirst(html, "body");
  if (!html || !head || !body) throw new TemplateError("完全な HTML 文書でない", path);
  return { html, head, body };
}

const isLayoutLink = (el: Element): boolean =>
  el.tagName === "link" && (getAttr(el, "rel") ?? "").split(/\s+/).includes("layout");

/** `source` の属性を `target` へ合流させる。`class` は連結し、それ以外は `source` が勝つ。 */
function mergeAttrs(target: Element, source: Element): void {
  for (const attr of source.attrs) {
    const existing = attr.name === "class" ? getAttr(target, "class") : undefined;
    setAttr(target, attr.name, existing ? `${existing} ${attr.value}` : attr.value);
  }
}

const isMetaCharset = (el: Element): boolean =>
  el.tagName === "meta" && getAttr(el, "charset") !== undefined;
const isMetaViewport = (el: Element): boolean =>
  el.tagName === "meta" && getAttr(el, "name") === "viewport";
const isTitle = (el: Element): boolean => el.tagName === "title";

/**
 * 描画の後の文書の `<head>` で、`<title>`、`<meta charset>`、`<meta name="viewport">` をそれぞれ 1 つに揃える（ADR-0023 / ADR-0032）。
 * 式の評価の後、参照の展開の前に呼ぶ。候補は `<head>` の中の、どの `<template>` の中身にもない要素（`findAllInDocumentTree`）。
 * 残すのは、その要素を書いたファイル（`sourcePathOf`）が `files` の前にある要素で、同じファイルの中では文書順で先の要素。
 * `files` はページ、内側のレイアウト、外側のレイアウトの順に並べる。書いたファイルの記録がない要素は、`files` の先頭（ページ）が書いたものとみなす。
 * 残す要素は、候補のうち文書順で最初の要素の位置に置く。他の候補は直前の空白ごと消す（ADR-0030）。
 */
export function keepOneInHead(document: Document, files: ReadonlyArray<string | undefined>): void {
  const head = findFirst(document, "head");
  if (!head) return;
  const rank = (el: Element): number => {
    const index = files.indexOf(sourcePathOf(el, files[0]));
    return index === -1 ? files.length : index;
  };
  for (const match of [isTitle, isMetaCharset, isMetaViewport]) {
    const [first, ...rest] = findAllInDocumentTree(head, match);
    if (first === undefined) continue;
    const kept = rest.reduce((best, el) => (rank(el) < rank(best) ? el : best), first);
    if (kept !== first) {
      detachWithIndent(kept);
      replaceWith(first, [kept]);
    }
    for (const el of rest) if (el !== kept) detachWithIndent(el);
  }
}

/**
 * ページをレイアウトへ合流させ、合流後の文書（レイアウト側の木）を返す（ADR-0019）。
 * ページの `<head>` の子は空白だけのテキストを除いてレイアウトの `<head>` の末尾へ、
 * `<body>` の子はレイアウトの `<slot>` へ移す。`<title>` などの重複は、ここでは除かない（`keepOneInHead`）。
 */
function merge(
  page: Document,
  pagePath: string | undefined,
  layout: Document,
  layoutPath: string,
): Document {
  const p = partsOf(page, pagePath);
  const l = partsOf(layout, layoutPath);
  const indent = headIndent(l.head);
  mergeAttrs(l.html, p.html);
  mergeAttrs(l.body, p.body);
  for (const child of childrenOf(p.head)) {
    if (!isBlankText(child)) appendToHead(l.head, child, indent);
  }
  distribute(l.body, childrenOf(p.body));
  return layout;
}

/**
 * `<link rel="layout">` をたどってページをレイアウトへ合流させる。多段のレイアウトは順に適用する。
 * 解決したレイアウトは `layouts` に記録する。
 * `<link rel="layout">` は素の `<template>` の中からは探さず（ADR-0023）、`<template if/each/html>` の中からは探す。
 */
export async function applyLayouts(
  document: Document,
  options: TransformOptions,
  layouts: TransformResult["layouts"],
): Promise<Document> {
  let current = document;
  let currentPath = options.path;
  const visited = new Set<string>();
  for (;;) {
    const head = findFirst(current, "head");
    const link = head && findAllOutsideInertTemplates(head, isLayoutLink)[0];
    if (!link) return current;
    const href = unmarkBraces(getAttr(link, "href") ?? "");
    const line = lineOf(link);
    detachWithIndent(link);
    if (href === "") {
      throw new TemplateError('<link rel="layout"> に href がない', currentPath, line);
    }
    if (!options.resolveLayout) {
      throw new TemplateError(
        "レイアウトを解決する resolveLayout が渡されていない",
        currentPath,
        line,
      );
    }
    const source = await options.resolveLayout(href, currentPath);
    if (!source) throw new TemplateError(`レイアウト ${href} が見つからない`, currentPath, line);
    if (visited.has(source.path)) {
      throw new TemplateError(`レイアウト ${href} が循環している`, currentPath, line);
    }
    visited.add(source.path);
    layouts.push({ href, path: source.path });
    const layout = parseDocumentSource(source.source, source.path);
    if (options.resolveAsset) await resolveAssetUrls(layout, source.path, options.resolveAsset);
    current = merge(current, currentPath, layout, source.path);
    currentPath = source.path;
  }
}
