import { parse } from "parse5";
import { resolveAssetUrls } from "./assets.ts";
import {
  appendToHead,
  childrenOf,
  detachWithIndent,
  findAllOutsideInertTemplates,
  findFirst,
  getAttr,
  headIndent,
  isBlankText,
  lineOf,
  replaceWith,
  setAttr,
  type Document,
  type Element,
} from "./dom.ts";
import { distribute } from "./slots.ts";
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

/**
 * ページとレイアウトの `<head>` にまたがって、条件に合う要素を 1 つだけ残す。ページ側の先頭が優先（ADR-0023）。
 * 候補は式の評価より前に探すので、素の `<template>` の中は数えず、`<template if/each/html>` の中は数える。
 * 残すページ側の要素が `<head>` の直下にあり、レイアウトの `<head>` の直下にも同じ種類の要素があれば、
 * ページ側の要素をその最初の要素の位置へ移す（ADR-0032）。その位置の直前の空白はそのまま使う。
 * `<template if/each/html>` の中の要素は位置の基準にしない。
 */
function keepOne(pageHead: Element, layoutHead: Element, match: (el: Element) => boolean): void {
  const fromLayout = findAllOutsideInertTemplates(layoutHead, match);
  const [kept, ...others] = [...findAllOutsideInertTemplates(pageHead, match), ...fromLayout];
  if (kept === undefined) return;
  const position =
    kept.parentNode === pageHead
      ? fromLayout.find((el) => el.parentNode === layoutHead)
      : undefined;
  if (position !== undefined) {
    detachWithIndent(kept);
    replaceWith(position, [kept]);
  }
  for (const el of others) if (el !== position) detachWithIndent(el);
}

const isMetaCharset = (el: Element): boolean =>
  el.tagName === "meta" && getAttr(el, "charset") !== undefined;
const isMetaViewport = (el: Element): boolean =>
  el.tagName === "meta" && getAttr(el, "name") === "viewport";
const isTitle = (el: Element): boolean => el.tagName === "title";

/**
 * ページをレイアウトへ合流させ、合流後の文書（レイアウト側の木）を返す（ADR-0019）。
 * ページの `<head>` の子は空白だけのテキストを除いてレイアウトの `<head>` の末尾へ、
 * `<body>` の子はレイアウトの `<slot>` へ移す。ただし `keepOne` がレイアウト側の位置へ移した要素は末尾へ動かさない。
 */
function merge(
  page: Document,
  pagePath: string | undefined,
  layout: Document,
  layoutPath: string,
): Document {
  const p = partsOf(page, pagePath);
  const l = partsOf(layout, layoutPath);
  // 字下げは、重複除去でレイアウト側の要素が消える前に求める
  const indent = headIndent(l.head);
  mergeAttrs(l.html, p.html);
  mergeAttrs(l.body, p.body);
  keepOne(p.head, l.head, isTitle);
  keepOne(p.head, l.head, isMetaCharset);
  keepOne(p.head, l.head, isMetaViewport);
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
    const href = getAttr(link, "href");
    const line = lineOf(link);
    detachWithIndent(link);
    if (href === undefined || href === "") {
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
    const layout = parse(source.source, { sourceCodeLocationInfo: true });
    if (options.resolveAsset) await resolveAssetUrls(layout, source.path, options.resolveAsset);
    current = merge(current, currentPath, layout, source.path);
    currentPath = source.path;
  }
}
