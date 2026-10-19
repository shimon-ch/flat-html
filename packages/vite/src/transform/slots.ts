import {
  childrenOf,
  detach,
  findAll,
  getAttr,
  isBlankText,
  isElement,
  removeAttr,
  replaceWith,
  type ChildNode,
  type Element,
  type ParentNode,
} from "./dom.ts";

/**
 * 消費側のノード `nodes` を `root` の中の `<slot>` へ実際に移す（ADR-0011）。
 * `slot="x"` を持つ要素は同名の `<slot name="x">` へ、それ以外は名前なしの `<slot>` へ。
 * 名前なしの差し込みが空白テキストだけなら差し込みなしとみなし、既定内容を残す。
 * 差し込み先のない要素は捨てる。同名の `<slot>` が複数あれば先頭だけが受け取る。
 */
export function distribute(root: ParentNode, nodes: readonly ChildNode[]): void {
  const groups = new Map<string, ChildNode[]>();
  for (const node of nodes) {
    const name = isElement(node) ? (getAttr(node, "slot") ?? "") : "";
    const group = groups.get(name) ?? [];
    group.push(node);
    groups.set(name, group);
  }
  const unnamed = groups.get("");
  if (unnamed && unnamed.every(isBlankText)) groups.delete("");

  const filled = new Set<string>();
  for (const slot of findAll(root, (el) => el.tagName === "slot")) {
    const name = getAttr(slot, "name") ?? "";
    const assigned = groups.get(name);
    if (assigned && !filled.has(name)) {
      filled.add(name);
      for (const node of assigned) if (isElement(node)) removeAttr(node, "slot");
      replaceWith(slot, assigned);
    } else {
      replaceWith(slot, childrenOf(slot));
    }
  }
  for (const [name, group] of groups) {
    if (!filled.has(name)) for (const node of group) detach(node);
  }
}

/** `root` の直下にある要素。展開後の「出力の根要素」。 */
export function rootElements(root: ParentNode): Element[] {
  return root.childNodes.filter(isElement);
}
