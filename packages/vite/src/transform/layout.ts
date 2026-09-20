import { parse } from "parse5";
import { resolveAssetUrls } from "./assets.ts";
import {
  append,
  childrenOf,
  detach,
  findAll,
  findFirst,
  getAttr,
  lineOf,
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

/** ページとレイアウトの `<head>` にまたがって、条件に合う要素を 1 つだけ残す。ページ側が優先。 */
function keepOne(pageHead: Element, layoutHead: Element, match: (el: Element) => boolean): void {
  const candidates = [...findAll(pageHead, match), ...findAll(layoutHead, match)];
  for (const el of candidates.slice(1)) detach(el);
}

const isMetaCharset = (el: Element): boolean =>
  el.tagName === "meta" && getAttr(el, "charset") !== undefined;
const isMetaViewport = (el: Element): boolean =>
  el.tagName === "meta" && getAttr(el, "name") === "viewport";
const isTitle = (el: Element): boolean => el.tagName === "title";

/**
 * ページをレイアウトへ合流させ、合流後の文書（レイアウト側の木）を返す（ADR-0019）。
 * ページの `<head>` の子はレイアウトの `<head>` の末尾へ、`<body>` の子はレイアウトの `<slot>` へ移す。
 */
function merge(
  page: Document,
  pagePath: string | undefined,
  layout: Document,
  layoutPath: string,
): Document {
  const p = partsOf(page, pagePath);
  const l = partsOf(layout, layoutPath);
  mergeAttrs(l.html, p.html);
  mergeAttrs(l.body, p.body);
  keepOne(p.head, l.head, isTitle);
  keepOne(p.head, l.head, isMetaCharset);
  keepOne(p.head, l.head, isMetaViewport);
  for (const child of childrenOf(p.head)) append(l.head, child);
  distribute(l.body, childrenOf(p.body));
  return layout;
}

/**
 * `<link rel="layout">` をたどってページをレイアウトへ合流させる。多段のレイアウトは順に適用する。
 * 解決したレイアウトは `layouts` に記録する。
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
    const link = head && findAll(head, isLayoutLink)[0];
    if (!link) return current;
    const href = getAttr(link, "href");
    const line = lineOf(link);
    detach(link);
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
