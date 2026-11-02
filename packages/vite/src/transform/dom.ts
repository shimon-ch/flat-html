import { defaultTreeAdapter, html, type DefaultTreeAdapterTypes as T } from "parse5";

export type Node = T.Node;
export type ChildNode = T.ChildNode;
export type ParentNode = T.ParentNode;
export type Element = T.Element;
export type Document = T.Document;
export type DocumentFragment = T.DocumentFragment;
export type Template = T.Template;

export const isElement = (node: Node): node is Element => defaultTreeAdapter.isElementNode(node);
export const isText = (node: Node): node is T.TextNode => defaultTreeAdapter.isTextNode(node);
export const isTemplate = (node: Node): node is T.Template =>
  isElement(node) && node.tagName === "template" && "content" in node;

/**
 * if / each / html のいずれも持たない素の `<template>`。中身は不活性として扱う（ADR-0023）。
 * 型の絞り込みはしない。偽のときに `<template>` でないとは言えないため。
 */
export const isInertTemplate = (node: Node): boolean =>
  isTemplate(node) && !["if", "each", "html"].some((name) => getAttr(node, name) !== undefined);

/**
 * 直列化で中身のテキストがエスケープされない要素（`<script>`、`<style>` など）。
 * 判定は parse5 の serialize と同じものを使う。`parse` と `serialize` の既定に合わせ、スクリプトは有効とみなす。
 */
export const hasRawText = (el: Element): boolean =>
  el.namespaceURI === html.NS.HTML && html.hasUnescapedText(el.tagName, true);

/** 要素から属性値を取る。なければ `undefined`。 */
export function getAttr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

/** 属性を設定する。既にあれば値を置き換える。 */
export function setAttr(el: Element, name: string, value: string): void {
  const existing = el.attrs.find((a) => a.name === name);
  if (existing) existing.value = value;
  else el.attrs.push({ name, value });
}

export function removeAttr(el: Element, name: string): void {
  el.attrs = el.attrs.filter((a) => a.name !== name);
}

/** 子ノードを親から外す。 */
export function detach(node: ChildNode): void {
  defaultTreeAdapter.detachNode(node);
}

/** `target` の直前に `nodes` を移し、`target` を取り除く。`nodes` は元の親から外される。 */
export function replaceWith(target: ChildNode, nodes: readonly ChildNode[]): void {
  const parent = target.parentNode;
  if (!parent) return;
  for (const node of nodes) {
    detach(node);
    defaultTreeAdapter.insertBefore(parent, node, target);
  }
  detach(target);
}

/** `node` を `parent` の末尾へ移す。元の親からは外される。 */
export function append(parent: ParentNode, node: ChildNode): void {
  detach(node);
  defaultTreeAdapter.appendChild(parent, node);
}

/** 子ノードの配列の複製。走査中に木を書き換えても安全なように使う。 */
export function childrenOf(parent: ParentNode): ChildNode[] {
  return [...parent.childNodes];
}

/** 空の中身（DocumentFragment）を持つ `<template>` 要素を作る。 */
function createTemplate(namespaceURI: Element["namespaceURI"], attrs: Element["attrs"]): Template {
  return {
    ...defaultTreeAdapter.createElement("template", namespaceURI, attrs),
    nodeName: "template",
    tagName: "template",
    content: defaultTreeAdapter.createDocumentFragment(),
  };
}

/** 部分木を深く複製する。位置情報も写す。`<template>` は中身も複製する。 */
export function cloneNode(node: ChildNode): ChildNode {
  if (isElement(node)) {
    const attrs = node.attrs.map((a) => ({ ...a }));
    const el = isTemplate(node)
      ? createTemplate(node.namespaceURI, attrs)
      : defaultTreeAdapter.createElement(node.tagName, node.namespaceURI, attrs);
    el.sourceCodeLocation = node.sourceCodeLocation;
    for (const child of node.childNodes) append(el, cloneNode(child));
    if (isTemplate(node) && isTemplate(el)) {
      for (const child of node.content.childNodes) append(el.content, cloneNode(child));
    }
    return el;
  }
  if (isText(node)) {
    const text = defaultTreeAdapter.createTextNode(node.value);
    text.sourceCodeLocation = node.sourceCodeLocation;
    return text;
  }
  if (defaultTreeAdapter.isCommentNode(node)) {
    const comment = defaultTreeAdapter.createCommentNode(node.data);
    comment.sourceCodeLocation = node.sourceCodeLocation;
    return comment;
  }
  return { ...node, parentNode: null };
}

/** 部分木の要素を先行順で走査する。`visit` が `false` を返した要素の子孫には入らない。 */
export function walk(root: ParentNode, visit: (el: Element) => boolean | undefined): void {
  for (const child of childrenOf(root)) {
    if (!isElement(child)) continue;
    if (visit(child) === false) continue;
    walk(child, visit);
    if (isTemplate(child)) walk(child.content, visit);
  }
}

/**
 * 条件に合う要素を文書順に集める。`skip` が真を返す要素は、それ自体は `match` で判定するが、
 * 子孫と（`<template>` なら）中身には入らない。
 */
function collect(
  root: ParentNode,
  match: (el: Element) => boolean,
  skip: (el: Element) => boolean,
): Element[] {
  const found: Element[] = [];
  walk(root, (el) => {
    if (match(el)) found.push(el);
    return skip(el) ? false : undefined;
  });
  return found;
}

/** 条件に合う要素を文書順に集める。`<template>` の中身にも入る。 */
export function findAll(root: ParentNode, match: (el: Element) => boolean): Element[] {
  return collect(root, match, () => false);
}

/** 条件に合う要素を文書順に集める。どの `<template>` の中身にも入らない。 */
export function findAllOutsideTemplates(
  root: ParentNode,
  match: (el: Element) => boolean,
): Element[] {
  return collect(root, match, isTemplate);
}

/**
 * 条件に合う要素を文書順に集める。素の `<template>`（`isInertTemplate`）の中身には入らず、
 * `<template if/each/html>` の中身には入る。式の評価より前の木を探すときに使う。
 */
export function findAllOutsideInertTemplates(
  root: ParentNode,
  match: (el: Element) => boolean,
): Element[] {
  return collect(root, match, isInertTemplate);
}

export function findFirst(root: ParentNode, tagName: string): Element | undefined {
  return findAll(root, (el) => el.tagName === tagName)[0];
}

/** ノードの開始行。位置情報がなければ `undefined`。 */
export function lineOf(node: Node): number | undefined {
  return node.sourceCodeLocation?.startLine;
}

export const isBlankText = (node: ChildNode): boolean => isText(node) && node.value.trim() === "";

const isHead = (node: ParentNode | null): boolean =>
  node !== null && isElement(node) && node.tagName === "head";

/** 直前の兄弟ノード。なければ `undefined`。 */
function previousSibling(node: ChildNode): ChildNode | undefined {
  const siblings = node.parentNode?.childNodes ?? [];
  const index = siblings.indexOf(node);
  return index > 0 ? siblings[index - 1] : undefined;
}

/**
 * `<head>` の字下げ（ADR-0030）。`<head>` の最初の子ノードが空白だけのテキストで改行を含むなら、
 * 最後の改行より後ろを返す。それ以外（詰めて書かれた `<head>`、1 行で書かれた `<head>` など）は `undefined`。
 */
export function headIndent(head: Element): string | undefined {
  const first = head.childNodes[0];
  if (first === undefined || !isText(first) || !isBlankText(first)) return undefined;
  const newline = first.value.lastIndexOf("\n");
  return newline === -1 ? undefined : first.value.slice(newline + 1);
}

/**
 * ノードを親から外す。親が `<head>` なら、直前にある空白だけのテキストノードも一緒に外す（ADR-0030）。
 * 親が `<head>` でなければ空白に触らない。`<body>` の空白は描画に影響しうるため。
 */
export function detachWithIndent(node: ChildNode): void {
  if (isHead(node.parentNode)) {
    const before = previousSibling(node);
    if (before !== undefined && isBlankText(before)) detach(before);
  }
  detach(node);
}

/**
 * `node` を `<head>` の末尾へ移す（ADR-0030）。元の位置からは `detachWithIndent` で外す。
 * `<head>` の最後の子が空白だけのテキスト（`</head>` の前の改行と字下げ）なら、その前へ入れる。
 * `indent` が文字列なら、`node` の直前に `"\n" + indent` の空白テキストを置く。`undefined` なら空白を足さない。
 */
export function appendToHead(head: Element, node: ChildNode, indent: string | undefined): void {
  detachWithIndent(node);
  const last = head.childNodes.at(-1);
  const end = last !== undefined && isBlankText(last) ? last : undefined;
  const insert = (child: ChildNode): void => {
    if (end === undefined) defaultTreeAdapter.appendChild(head, child);
    else defaultTreeAdapter.insertBefore(head, child, end);
  };
  if (indent !== undefined) insert(defaultTreeAdapter.createTextNode(`\n${indent}`));
  insert(node);
}
