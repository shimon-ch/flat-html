import { parseFragment } from "parse5";
import {
  append,
  childrenOf,
  cloneNode,
  detachWithIndent,
  getAttr,
  hasRawText,
  isElement,
  isInertTemplate,
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
import { ExpressionSyntaxError, parseExpression, pathHeads, type Expr } from "./parser.ts";
import { TemplateError } from "./types.ts";

const INTERPOLATION = /\{\{\s*([\s\S]*?)\s*\}\}/g;
/** 値の先頭の `{{ }}`。末尾に `$` を付けると `{{ a }}{{ b }}` 全体と一致してしまうため、値全体との一致は長さで確かめる。 */
const LEADING_INTERPOLATION = /^\{\{\s*([\s\S]*?)\s*\}\}/;
const EACH = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s+of\s+([\s\S]+)$/;

/** 式を構文解析する。構文の誤りは `path` と `line` を添えた `TemplateError` にする。 */
function parseAt(source: string, line: number | undefined, path: string | undefined): Expr {
  try {
    return parseExpression(source);
  } catch (error) {
    if (error instanceof ExpressionSyntaxError) {
      throw new TemplateError(error.message, path, line);
    }
    throw error;
  }
}

function evalAt(
  source: string,
  scope: Scope,
  line: number | undefined,
  path: string | undefined,
): unknown {
  return evaluate(parseAt(source, line, path), scope);
}

function evalIn(source: string, scope: Scope, node: Node, path: string | undefined): unknown {
  return evalAt(source, scope, lineOf(node), path);
}

/** `node` に書かれた `text` の `offset` 文字目の行番号。`node` の開始行に、そこまでの改行数を足す。 */
function lineAt(text: string, offset: number, node: Node): number | undefined {
  const startLine = lineOf(node);
  return startLine === undefined ? undefined : startLine + countNewlines(text.slice(0, offset));
}

/** `text` の中の `{{ }}` を評価して置き換える。行番号は `lineAt` で求める。 */
function interpolate(text: string, scope: Scope, node: Node, path: string | undefined): string {
  if (!text.includes("{{")) return text;
  return text.replace(INTERPOLATION, (_, source: string, offset: number) =>
    stringify(evalAt(source, scope, lineAt(text, offset, node), path)),
  );
}

function countNewlines(text: string): number {
  return text.split("\n").length - 1;
}

/** 値全体がちょうど 1 つの `{{ }}` でできていれば、その中の式を返す。前後に空白や他の文字があれば `undefined`。 */
function soleExpression(value: string): string | undefined {
  const match = LEADING_INTERPOLATION.exec(value);
  return match && match[0].length === value.length ? match[1] : undefined;
}

/**
 * 属性値の `{{ }}` を評価する。値全体がちょうど 1 つの `{{ }}` で、結果が `null` か `undefined` なら
 * 属性を取り除くことを `undefined` で示す。それ以外は `interpolate` と同じく文字列にする。
 */
function renderAttribute(
  value: string,
  scope: Scope,
  el: Element,
  path: string | undefined,
): string | undefined {
  const source = soleExpression(value);
  if (source === undefined) return interpolate(value, scope, el, path);
  const result = evalIn(source, scope, el, path);
  return result === null || result === undefined ? undefined : stringify(result);
}

/**
 * `{{ }}` と `<template if/each/html>` を `scope` のもとで評価し、木を書き換える。
 * 属性のない素の `<template>` の中身は不活性のまま触らない。
 * 生テキスト要素（`hasRawText`）の中身は直列化でエスケープされないので展開しない。その要素自身の属性は展開する（ADR-0033）。
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
  if (isTemplate(el) && !isInertTemplate(el)) {
    renderDirective(el, scope, path);
    return;
  }
  if (el.attrs.some((attr) => attr.value.includes("{{"))) {
    el.attrs = el.attrs.flatMap((attr) => {
      const value = renderAttribute(attr.value, scope, el, path);
      return value === undefined ? [] : [{ ...attr, value }];
    });
  }
  if (!isTemplate(el) && !hasRawText(el)) render(el, scope, path);
}

/**
 * `<template if/each/html>` を評価して置き換える。
 * 何も残らない経路（if が偽、each の結果が空）は `detachWithIndent` で外し、`<head>` に空行を残さない（ADR-0030）。
 */
function renderDirective(el: Template, scope: Scope, path: string | undefined): void {
  const condition = getAttr(el, "if");
  if (condition !== undefined && !evalIn(condition, scope, el, path)) {
    detachWithIndent(el);
    return;
  }
  const each = getAttr(el, "each");
  if (each !== undefined) {
    const nodes = renderEach(el, each, scope, path);
    if (nodes.length === 0) detachWithIndent(el);
    else replaceWith(el, nodes);
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

/** `each` の値を、導入する変数名と対象の式に分ける。形が違えば `TemplateError` にする。 */
function splitEach(
  el: Template,
  source: string,
  path: string | undefined,
): { name: string; listSource: string } {
  const match = EACH.exec(source);
  if (!match) {
    throw new TemplateError(`each は「item of items」の形で書く: ${source}`, path, lineOf(el));
  }
  const [, name, listSource] = match;
  return { name: name!, listSource: listSource! };
}

function renderEach(
  el: Template,
  source: string,
  scope: Scope,
  path: string | undefined,
): ChildNode[] {
  const { name, listSource } = splitEach(el, source, path);
  const list = evalIn(listSource, scope, el, path);
  if (list === null || list === undefined) return [];
  if (!Array.isArray(list)) {
    throw new TemplateError(`each の対象が配列でない: ${listSource}`, path, lineOf(el));
  }
  const out: ChildNode[] = [];
  for (const item of list) {
    const holder = parseFragment("");
    for (const node of el.content.childNodes) append(holder, cloneNode(node));
    render(holder, scope.child({ [name]: item }), path);
    out.push(...childrenOf(holder));
  }
  return out;
}

/**
 * `root` を `render` したときに式として構文解析される箇所から、パスの先頭の名前を集める（ADR-0033）。
 * 評価されない分岐（偽の `if`、空の `each`、`||` の評価されない側など）の式も数える。
 * `<template if/each/html>` は `if` と `each` の `of` の右辺と `html` の式を数え、中身にも入る。
 * `each` が導入する変数名も、中身の式に現れれば数える。
 * 素の `<template>` の中身と生テキスト要素の中身は `render` が展開しないので数えない。それらの要素自身の属性は数える。
 * 構文の誤りは `render` と同じパスと行の `TemplateError` にする。
 */
export function referencedNames(root: ParentNode, path: string | undefined): Set<string> {
  const names = new Set<string>();
  const add = (source: string, line: number | undefined): void => {
    for (const name of pathHeads(parseAt(source, line, path))) names.add(name);
  };
  const addInterpolations = (text: string, node: Node): void => {
    for (const match of text.matchAll(INTERPOLATION)) {
      add(match[1]!, lineAt(text, match.index, node));
    }
  };
  const visit = (parent: ParentNode): void => {
    for (const child of parent.childNodes) {
      if (isText(child)) {
        addInterpolations(child.value, child);
      } else if (isTemplate(child) && !isInertTemplate(child)) {
        const condition = getAttr(child, "if");
        if (condition !== undefined) add(condition, lineOf(child));
        const each = getAttr(child, "each");
        if (each !== undefined) add(splitEach(child, each, path).listSource, lineOf(child));
        const html = getAttr(child, "html");
        if (html !== undefined) add(html, lineOf(child));
        visit(child.content);
      } else if (isElement(child)) {
        for (const attr of child.attrs) addInterpolations(attr.value, child);
        if (!isTemplate(child) && !hasRawText(child)) visit(child);
      }
    }
  };
  visit(root);
  return names;
}
