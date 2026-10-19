import { parseFragment } from "parse5";
import { assetKey } from "./assets.ts";
import {
  childrenOf,
  getAttr,
  isElement,
  isTemplate,
  lineOf,
  replaceWith,
  setAttr,
  type ChildNode,
  type Element,
  type ParentNode,
} from "./dom.ts";
import { Scope } from "./evaluator.ts";
import { render } from "./render.ts";
import { distribute, rootElements } from "./slots.ts";
import { TemplateError, type TemplateSource } from "./types.ts";

/** 展開の間だけ生きる文脈。 */
export interface ExpandContext {
  /** 参照名からテンプレートを探す。同じ名前は 1 回の変換で 1 回だけ解決される */
  resolve(name: string): Promise<TemplateSource | null>;
  /** 走査している入力のファイルパス。エラー表示に使う */
  path: string | undefined;
}

const PREFIX = "flat-";

/** `flat-*` 要素の参照名。参照でなければ `undefined`。 */
export function referenceName(el: Element): string | undefined {
  return el.tagName.startsWith(PREFIX) && el.tagName.length > PREFIX.length
    ? el.tagName.slice(PREFIX.length)
    : undefined;
}

/**
 * `root` 以下の `flat-*` 参照を 1 回の走査で展開する（ADR-0010）。
 * 展開結果は再走査しない。`stack` にある名前（展開中のテンプレート自身とその祖先）は
 * Custom Element として残すため展開しない。素の `<template>` の中身は不活性のまま触らない。
 */
export async function expandReferences(
  root: ParentNode,
  ctx: ExpandContext,
  stack: readonly string[],
): Promise<void> {
  for (const child of childrenOf(root)) {
    if (!isElement(child) || isTemplate(child)) continue;
    const name = referenceName(child);
    if (name === undefined || stack.includes(name)) {
      await expandReferences(child, ctx, stack);
      continue;
    }
    await expandReferences(child, ctx, stack);
    replaceWith(child, await expandOne(child, name, ctx, stack));
  }
}

async function expandOne(
  el: Element,
  name: string,
  ctx: ExpandContext,
  stack: readonly string[],
): Promise<ChildNode[]> {
  const template = await ctx.resolve(name);
  if (!template) {
    throw new TemplateError(`<flat-${name}> のテンプレートが見つからない`, ctx.path, lineOf(el));
  }
  const fragment = parseFragment(template.source, { sourceCodeLocationInfo: true });
  const args = Object.fromEntries(el.attrs.map((a) => [a.name, a.value]));
  const scope = new Scope(args);
  render(fragment, scope, template.path);
  await expandReferences(fragment, { ...ctx, path: template.path }, [...stack, name]);
  distribute(fragment, childrenOf(el));

  const passthrough = el.attrs.filter((a) => !scope.used.has(a.name));
  for (const root of rootElements(fragment).filter((r) => assetKey(r) === undefined)) {
    for (const attr of passthrough) {
      const existing = attr.name === "class" ? getAttr(root, "class") : undefined;
      setAttr(root, attr.name, existing ? `${existing} ${attr.value}` : attr.value);
    }
    setAttr(root, "data-flat", name);
  }
  return childrenOf(fragment);
}
