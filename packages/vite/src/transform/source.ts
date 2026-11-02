import { defaultTreeAdapter, parse, parseFragment, serialize } from "parse5";
import {
  hasRawText,
  isElement,
  isTemplate,
  isText,
  registerSource,
  type Document,
  type DocumentFragment,
  type ParentNode,
} from "./dom.ts";
import { TemplateError } from "./types.ts";

/**
 * 文字参照で書いた `{` と `}` を、解析から直列化までの間だけ表す文字（ADR-0035）。
 * Unicode の非文字で、交換するテキストには現れない。
 */
const OPEN = "\uFDD0";
const CLOSE = "\uFDD1";
const MARKER = /[\uFDD0\uFDD1]/;

/**
 * `{` を表す文字参照。数値参照は末尾の `;` を省いても parse5 が `{` に戻すので、省いた形も含める。
 * 名前参照は `;` を省くと parse5 が戻さないので、`;` 付きだけを含める。
 */
const OPEN_REFERENCE = /&(?:#0*123(?![0-9])|#[xX]0*7[bB](?![0-9a-fA-F]));?|&(?:lbrace|lcub);/g;
/** `}` を表す文字参照。形の扱いは `OPEN_REFERENCE` と同じ。 */
const CLOSE_REFERENCE = /&(?:#0*125(?![0-9])|#[xX]0*7[dD](?![0-9a-fA-F]));?|&(?:rbrace|rcub);/g;

/** `source` の `index` 文字目の行番号。parse5 と同じく `\r\n`、`\r`、`\n` をそれぞれ 1 つの改行と数える。 */
function lineAtOffset(source: string, index: number): number {
  return source.slice(0, index).split(/\r\n|\r|\n/).length;
}

/**
 * 解析で文字参照が戻らない区間（コメントと、生テキスト要素の中身）の、ソースでの `[開始, 終了)` をソースの順に返す。
 * `<template>` の中身にも入る。
 */
function opaqueRanges(root: ParentNode): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const visit = (parent: ParentNode): void => {
    for (const child of parent.childNodes) {
      const opaque =
        defaultTreeAdapter.isCommentNode(child) ||
        (isText(child) && isElement(parent) && hasRawText(parent));
      const location = child.sourceCodeLocation;
      if (opaque && location) ranges.push([location.startOffset, location.endOffset]);
      if (isElement(child)) {
        visit(child);
        if (isTemplate(child)) visit(child.content);
      }
    }
  };
  visit(root);
  return ranges.sort(([a], [b]) => a - b);
}

function markReferences(text: string): string {
  return text.replace(OPEN_REFERENCE, OPEN).replace(CLOSE_REFERENCE, CLOSE);
}

/** `opaque` の区間の外にある波括弧の文字参照を、`OPEN` と `CLOSE` に置き換える。 */
function markBraces(source: string, opaque: ReadonlyArray<readonly [number, number]>): string {
  let marked = "";
  let position = 0;
  for (const [start, end] of opaque) {
    marked += markReferences(source.slice(position, start)) + source.slice(start, end);
    position = end;
  }
  return marked + markReferences(source.slice(position));
}

/**
 * ページ、レイアウト、テンプレートのソースを解析し、すべてのノードに `path` を記録する（ADR-0035）。
 * 解析で `{` か `}` に戻る文字参照は、`OPEN` と `CLOSE` に置き換えてから解析する。`{{ }}` の区切りとみなさないため。
 * 置き換えるかは、一度そのまま解析した木で決める。コメントと生テキスト要素の中身は、parse5 が文字参照を戻さないので置き換えない。
 * ソースが `OPEN` か `CLOSE` を含めば、`path` とその行を添えて `TemplateError` を投げる。
 */
function parseSource<T extends Document | DocumentFragment>(
  source: string,
  path: string | undefined,
  parseHtml: (html: string) => T,
): T {
  const found = MARKER.exec(source);
  if (found) {
    const code = found[0].charCodeAt(0).toString(16).toUpperCase();
    throw new TemplateError(
      `非文字 U+${code} は flat-html が内部で使うので書けない`,
      path,
      lineAtOffset(source, found.index),
    );
  }
  const parsed = parseHtml(source);
  const marked = markBraces(source, opaqueRanges(parsed));
  const root = marked === source ? parsed : parseHtml(marked);
  if (path !== undefined) registerSource(root, path);
  return root;
}

/** 完全な HTML 文書としてソースを解析する。置き換えと記録は `parseSource` のとおり。 */
export function parseDocumentSource(source: string, path: string | undefined): Document {
  return parseSource(source, path, (html) => parse(html, { sourceCodeLocationInfo: true }));
}

/** 断片としてソースを解析する。置き換えと記録は `parseSource` のとおり。 */
export function parseFragmentSource(source: string, path: string | undefined): DocumentFragment {
  return parseSource(source, path, (html) => parseFragment(html, { sourceCodeLocationInfo: true }));
}

/** 木を HTML 文字列にする。`OPEN` と `CLOSE` は `&#123;` と `&#125;` に戻す。 */
export function serializeOutput(root: Document | DocumentFragment): string {
  return serialize(root).replaceAll(OPEN, "&#123;").replaceAll(CLOSE, "&#125;");
}

/**
 * `OPEN` と `CLOSE` を `{` と `}` に戻す。
 * 木の属性値やテキストを値として使うとき（式の構文解析、参照の引数、レイアウトと資産の指定子）に通す。
 * `{{ }}` の区切りを探す文字列と、出力に残す文字列には通さない。
 */
export function unmarkBraces(value: string): string {
  return value.replaceAll(OPEN, "{").replaceAll(CLOSE, "}");
}
