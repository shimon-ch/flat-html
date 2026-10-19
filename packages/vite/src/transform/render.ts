import { parseFragment } from "parse5";
import {
  append,
  childrenOf,
  cloneNode,
  detach,
  getAttr,
  isElement,
  isTemplate,
  isText,
  lineOf,
  replaceWith,
  type ChildNode,
  type Element,
  type Node,
  type ParentNode,
  type Template,
} from "./dom.ts";
import { evaluate, Scope, stringify } from "./evaluator.ts";
import { ExpressionSyntaxError, parseExpression } from "./parser.ts";
import { TemplateError } from "./types.ts";

const INTERPOLATION = /\{\{\s*([\s\S]*?)\s*\}\}/g;
const EACH = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s+of\s+([\s\S]+)$/;

function evalAt(
  source: string,
  scope: Scope,
  line: number | undefined,
  path: string | undefined,
): unknown {
  try {
    return evaluate(parseExpression(source), scope);
  } catch (error) {
    if (error instanceof ExpressionSyntaxError) {
      throw new TemplateError(error.message, path, line);
    }
    throw error;
  }
}

function evalIn(source: string, scope: Scope, node: Node, path: string | undefined): unknown {
  return evalAt(source, scope, lineOf(node), path);
}

/** `text` の中の `{{ }}` を評価して置き換える。行番号は `node` の開始行に、該当箇所までの改行数を足す。 */
function interpolate(text: string, scope: Scope, node: Node, path: string | undefined): string {
  if (!text.includes("{{")) return text;
  const startLine = lineOf(node);
  return text.replace(INTERPOLATION, (_, source: string, offset: number) => {
    const line =
      startLine === undefined ? undefined : startLine + countNewlines(text.slice(0, offset));
    return stringify(evalAt(source, scope, line, path));
  });
}

function countNewlines(text: string): number {
  return text.split("\n").length - 1;
}

/**
 * `{{ }}` と `<template if/each/html>` を `scope` のもとで評価し、木を書き換える。
 * 属性のない素の `<template>` の中身は不活性のまま触らない。
 */
export function render(root: ParentNode, scope: Scope, path: string | undefined): void {
  for (const child of childrenOf(root)) {
    if (isText(child)) {
      child.value = interpolate(child.value, scope, child, path);
    } else if (isElement(child)) {
      renderElement(child, scope, path);
    }
  }
}

function renderElement(el: Element, scope: Scope, path: string | undefined): void {
  if (isTemplate(el) && (hasAttr(el, "if") || hasAttr(el, "each") || hasAttr(el, "html"))) {
    renderDirective(el, scope, path);
    return;
  }
  for (const attr of el.attrs) attr.value = interpolate(attr.value, scope, el, path);
  if (!isTemplate(el)) render(el, scope, path);
}

function hasAttr(el: Element, name: string): boolean {
  return getAttr(el, name) !== undefined;
}

function renderDirective(el: Template, scope: Scope, path: string | undefined): void {
  const condition = getAttr(el, "if");
  if (condition !== undefined && !evalIn(condition, scope, el, path)) {
    detach(el);
    return;
  }
  const each = getAttr(el, "each");
  if (each !== undefined) {
    replaceWith(el, renderEach(el, each, scope, path));
    return;
  }
  const html = getAttr(el, "html");
  if (html !== undefined) {
    const raw = stringify(evalIn(html, scope, el, path));
    const parent = el.parentNode;
    // 文脈つきで解析する。`<table>` の中の `<tr>` のように、親によって解析結果が変わるため
    const fragment =
      parent && isElement(parent) ? parseFragment(parent, raw, {}) : parseFragment(raw);
    replaceWith(el, childrenOf(fragment));
    return;
  }
  render(el.content, scope, path);
  replaceWith(el, childrenOf(el.content));
}

function renderEach(
  el: Template,
  source: string,
  scope: Scope,
  path: string | undefined,
): ChildNode[] {
  const match = EACH.exec(source);
  if (!match) {
    throw new TemplateError(`each は「item of items」の形で書く: ${source}`, path, lineOf(el));
  }
  const [, name, listSource] = match;
  const list = evalIn(listSource!, scope, el, path);
  if (list === null || list === undefined) return [];
  if (!Array.isArray(list)) {
    throw new TemplateError(`each の対象が配列でない: ${listSource}`, path, lineOf(el));
  }
  const out: ChildNode[] = [];
  for (const item of list) {
    const holder = parseFragment("");
    for (const node of el.content.childNodes) append(holder, cloneNode(node));
    render(holder, scope.child({ [name!]: item }), path);
    out.push(...childrenOf(holder));
  }
  return out;
}
