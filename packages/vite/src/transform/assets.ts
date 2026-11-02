import {
  appendToHead,
  detachWithIndent,
  findAllInDocumentTree,
  findAllOutsideDiscardedContent,
  findFirst,
  getAttr,
  lineOf,
  setAttr,
  type Document,
  type Element,
  type ParentNode,
} from "./dom.ts";
import { markValueBraces, unmarkBraces } from "./source.ts";
import { TemplateError, type TransformOptions } from "./types.ts";

const LINK_RELS = ["stylesheet", "modulepreload", "preload"];

/** 集約の対象の資産要素。`kind` は種類、`attr` は URL を持つ属性の名前、`url` は書かれたままの値。 */
interface AssetRef {
  kind: string;
  attr: "href" | "src";
  url: string;
}

/** 集約の対象なら、その種類と URL の在処を返す（ADR-0013）。対象でなければ `undefined`。 */
function assetRef(el: Element): AssetRef | undefined {
  if (el.tagName === "link") {
    const rels = (getAttr(el, "rel") ?? "").split(/\s+/);
    const kind = LINK_RELS.find((r) => rels.includes(r));
    const href = getAttr(el, "href");
    if (kind === undefined || href === undefined) return undefined;
    return { kind: `link:${kind}`, attr: "href", url: href };
  }
  if (el.tagName === "script" && getAttr(el, "type") === "module") {
    const src = getAttr(el, "src");
    return src === undefined ? undefined : { kind: "script:module", attr: "src", url: src };
  }
  return undefined;
}

/**
 * 集約の対象なら、種類と URL を組にした鍵を返す（ADR-0013）。
 * 同じ URL でも `<link rel="modulepreload">` と `<script type="module">` は別物なので、種類を鍵に含める。
 */
export function assetKey(el: Element): string | undefined {
  const ref = assetRef(el);
  return ref === undefined ? undefined : `${ref.kind}:${ref.url}`;
}

/** スキームを持つ URL（`https:`、`data:` など）。 */
const SCHEME = /^[a-z][a-z\d+\-.]*:/i;

/**
 * 資産の指定子を、ファイルを指すパスの部分と、最初の `?` か `#` から後ろの部分に分ける（ADR-0034）。
 * `#` で始まる指定子（Node のサブパス import）は、先頭の `#` を区切りとみなさず、2 文字目以降の `?` と `#` で切る。
 * 区切りがなければ `suffix` は空文字。
 */
function splitSpecifier(specifier: string): { path: string; suffix: string } {
  const start = specifier.startsWith("#") ? 1 : 0;
  const found = specifier.slice(start).search(/[?#]/);
  const end = found === -1 ? specifier.length : start + found;
  return { path: specifier.slice(0, end), suffix: specifier.slice(end) };
}

/**
 * 書かれた URL のパスの部分 `path`（`splitSpecifier`）が、ファイルの位置を基準に解決する対象か。
 * `/` で始まる URL、スキームを持つ URL、空の URL は対象外で、書かれたまま Vite に渡る。
 * パスの部分に `{{` を含む URL も対象外で、式の評価の後の値のまま Vite に渡る（ADR-0034）。
 * `?` か `#` から後ろの部分の `{{` は問わない。
 */
function isFileSpecifier(path: string): boolean {
  return path !== "" && !path.startsWith("/") && !SCHEME.test(path) && !path.includes("{{");
}

/**
 * `splitSpecifier` の `suffix`（空文字か、`?` か `#` で始まる文字列）を、`?` から `#` の前までと、`#` から後ろに分ける。
 * どちらも区切りの文字を含み、なければ空文字。先頭の `#` も区切りとみなす。
 */
function splitSuffix(suffix: string): { query: string; hash: string } {
  const hashAt = suffix.indexOf("#");
  return hashAt === -1
    ? { query: suffix, hash: "" }
    : { query: suffix.slice(0, hashAt), hash: suffix.slice(hashAt) };
}

/**
 * 解決した URL `resolved` に、書かれた指定子から外した `?` か `#` から後ろ `suffix` を付け直す（ADR-0034）。
 * `resolved` も `splitSpecifier` で分けるので、`#` で始まる `resolved` の先頭の `#` は区切りとみなさない。
 * 両方に `?` から後ろがあれば、`resolved` のものの後ろに `&` でつなぐ。
 * `suffix` に `#` から後ろがあれば、`resolved` の `#` から後ろをそれで置き換える。なければ `resolved` のものを残す。
 */
function attachSuffix(resolved: string, suffix: string): string {
  if (suffix === "") return resolved;
  const { path, suffix: resolvedSuffix } = splitSpecifier(resolved);
  const target = splitSuffix(resolvedSuffix);
  const written = splitSuffix(suffix);
  const query =
    written.query === ""
      ? target.query
      : target.query === ""
        ? written.query
        : `${target.query}&${written.query.slice(1)}`;
  return path + query + (written.hash === "" ? target.hash : written.hash);
}

/** `JSON.stringify` で表せれば、その文字列。表せなければ（`undefined`、関数、循環する値など）`undefined`。 */
function toJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * `resolveAsset` が投げた値 `error` を、資産を書いたファイル `fromPath` と要素 `el` の行の `TemplateError` にする。
 * `error` が `TemplateError` なら、パスと行を重ねないよう、そのまま返す。
 * それ以外は理由を添える。`Error` なら `message`、それ以外は JSON で表せれば JSON、表せなければ `String` の結果を理由にする。
 */
function resolutionError(
  error: unknown,
  specifier: string,
  fromPath: string,
  el: Element,
): TemplateError {
  if (error instanceof TemplateError) return error;
  const reason = error instanceof Error ? error.message : (toJson(error) ?? String(error));
  return new TemplateError(`資産 ${specifier} を解決できない: ${reason}`, fromPath, lineOf(el));
}

/** `resolveAsset` の結果。拒否されたときは投げた値を `error` に持つ。 */
type Resolution = { ok: true; url: string | null } | { ok: false; error: unknown };

/**
 * `resolve` を呼び、その結果を拒否されない `Resolution` の Promise にする。`Promise.all` が最初の拒否で止まらないようにする。
 * `resolve` が同期的に投げた値も `error` に入れる。
 */
async function settle(resolve: () => Promise<string | null>): Promise<Resolution> {
  try {
    return { ok: true, url: await resolve() };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * `root` の中の資産要素の URL を、`fromPath` の位置を基準に解決した URL へ書き換える。
 * 集約より前に呼ぶ。重複除去の鍵が解決後の URL になり、別々のテンプレートが同じ資産を指しても 1 つにまとまる。
 * 解決は式の評価より前に行う。パスの部分に `{{` を含む URL は解決しない（`isFileSpecifier`）。
 * `resolveAsset` にはパスの部分だけを、文字参照で書いた波括弧を `{` と `}` に戻して渡す（`unmarkBraces`）。
 * 返った URL は、`{{` か `}}` を含めば波括弧を区切りとみなさない文字にし（`markValueBraces`。ADR-0035）、`?` か `#` から後ろを付け直す（`attachSuffix`）。
 * 素の `<template>`（`<template shadowrootmode>` を含む）の中身も、`<template if/each>` の中身も解決する（ADR-0024）。
 * `html` を持ち `each` を持たない `<template>` の中身は、描画で捨てられるので解決しない。
 * ただし素の `<template>` の中の `<template html>` は描画されず中身が残るので、その中身は解決する（`findAllOutsideDiscardedContent`）。
 * すべての指定子の解決を並べて待ち、その後で文書順に書き換える。同じ指定子の解決を 1 回にまとめるのは `resolveAsset` の控えに任せる。
 * 文書順で最初に解決できなかった要素について、`resolveAsset` が null を返したら、`fromPath` とその要素の行を添えて `TemplateError` を投げる（ADR-0034）。
 * `resolveAsset` が例外を投げたら、`resolutionError` の `TemplateError` を投げる。
 */
export async function resolveAssetUrls(
  root: ParentNode,
  fromPath: string,
  resolveAsset: NonNullable<TransformOptions["resolveAsset"]>,
): Promise<void> {
  const targets = findAllOutsideDiscardedContent(root, (e) => assetRef(e) !== undefined).flatMap(
    (el) => {
      const ref = assetRef(el);
      if (ref === undefined) return [];
      const { path, suffix } = splitSpecifier(ref.url);
      if (!isFileSpecifier(path)) return [];
      return [{ el, attr: ref.attr, specifier: unmarkBraces(path), suffix }];
    },
  );
  const resolved = await Promise.all(
    targets.map(async (target) => ({
      ...target,
      resolution: await settle(() => resolveAsset(target.specifier, fromPath)),
    })),
  );
  for (const { el, attr, specifier, suffix, resolution } of resolved) {
    if (!resolution.ok) throw resolutionError(resolution.error, specifier, fromPath, el);
    if (resolution.url === null) {
      throw new TemplateError(`資産 ${specifier} が見つからない`, fromPath, lineOf(el));
    }
    setAttr(el, attr, attachSuffix(markValueBraces(resolution.url), suffix));
  }
}

/**
 * 文書中の資産（`<link rel="stylesheet|modulepreload|preload">` と `src` 付き `<script type="module">`）を
 * 文書順のまま `<head>` の末尾へ移し、同じ種類と URL のものは最初の 1 つだけ残す。`<head>` がなければ何もしない。
 * `<head>` の中の空白は要素と一緒に動かし、`<body>` の空白には触らない（ADR-0030）。
 * `indent` は移した資産の前に置く `<head>` の字下げで、`appendToHead` に渡す。描画で `<head>` の子が消える前に `headIndent` で求めておく。
 * 式の評価の後に呼ぶ。どの `<template>` の中身も探さない（`findAllInDocumentTree`）。
 */
export function aggregate(document: Document, indent: string | undefined): void {
  const head = findFirst(document, "head");
  if (!head) return;
  const seen = new Set<string>();
  for (const el of findAllInDocumentTree(document, (e) => assetKey(e) !== undefined)) {
    const key = assetKey(el)!;
    if (seen.has(key)) {
      detachWithIndent(el);
      continue;
    }
    seen.add(key);
    appendToHead(head, el, indent);
  }
}
