import { defaultTreeAdapter, type DefaultTreeAdapterTypes as T } from "parse5";

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

/** 部分木を深く複製する。位置情報も写す。 */
export function cloneNode(node: ChildNode): ChildNode {
  if (isElement(node)) {
    const el = defaultTreeAdapter.createElement(
      node.tagName,
      node.namespaceURI,
      node.attrs.map((a) => ({ ...a })),
    );
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

/** 条件に合う要素を文書順に集める。 */
export function findAll(root: ParentNode, match: (el: Element) => boolean): Element[] {
  const found: Element[] = [];
  walk(root, (el) => {
    if (match(el)) found.push(el);
    return undefined;
  });
  return found;
}

export function findFirst(root: ParentNode, tagName: string): Element | undefined {
  return findAll(root, (el) => el.tagName === tagName)[0];
}

/** ノードの開始行。位置情報がなければ `undefined`。 */
export function lineOf(node: Node): number | undefined {
  return node.sourceCodeLocation?.startLine;
}

export const isBlankText = (node: ChildNode): boolean => isText(node) && node.value.trim() === "";
