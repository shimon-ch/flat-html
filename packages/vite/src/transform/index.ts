import { aggregate } from "./assets.ts";
import { findFirst, headIndent } from "./dom.ts";
import { Scope } from "./evaluator.ts";
import { expandReferences, type ExpandContext } from "./expand.ts";
import { applyLayouts } from "./layout.ts";
import { render } from "./render.ts";
import { parseDocumentSource, parseFragmentSource, serializeOutput } from "./source.ts";
import type { TransformOptions, TransformResult } from "./types.ts";

export { TemplateError } from "./types.ts";
export type { TemplateSource, TransformOptions, TransformResult } from "./types.ts";

/**
 * 非同期関数 `fn` を包み、鍵 `keyOf(...args)` が同じ呼び出しには、最初の呼び出しが返した Promise を返す。
 * 拒否された Promise も控えに残し、同じ鍵では `fn` を呼び直さない。
 * 控えは返した関数の中にだけあり、1 回の変換の中で作って捨てる。
 */
function memoizeAsync<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyOf: (...args: A) => string,
): (...args: A) => Promise<R> {
  const cache = new Map<string, Promise<R>>();
  return (...args) => {
    const key = keyOf(...args);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const pending = fn(...args);
    cache.set(key, pending);
    return pending;
  };
}

function createContext(
  options: TransformOptions,
  resolved: TransformResult["resolved"],
): ExpandContext {
  return {
    path: options.path,
    resolveAsset:
      options.resolveAsset &&
      memoizeAsync(options.resolveAsset, (specifier, fromPath) =>
        JSON.stringify([fromPath, specifier]),
      ),
    expressions: new Map(),
    referenced: new Map(),
    resolve: memoizeAsync(
      (name: string) =>
        options.resolve(name).then((source) => {
          if (source) resolved.push({ name, path: source.path });
          return source;
        }),
      (name) => name,
    ),
  };
}

/**
 * 明示的な `<html>` の開始タグを書きうるソースか。偽なら、そのソースはページでない。
 * 断片の入力を、文書として解析せずに見分けるために使う。真でもページとは限らない。
 */
const HTML_START_TAG = /<html/i;

/**
 * HTML 文字列の `flat-*` 参照を展開し、資産を `<head>` へ集約して返す。Vite には依存しない。
 * `<html>` を持つ入力はページとして扱い、レイアウトの合流と集約を行う。持たない入力は断片として展開だけ行う。
 * テンプレートとレイアウトに書かれた資産の URL は `resolveAsset` に委ねる。入力 HTML 自身に書かれた URL は触らない。
 * 同じファイルの同じ指定子の解決は、1 回の変換の中で 1 回だけ `resolveAsset` に頼む。
 */
export async function transform(html: string, options: TransformOptions): Promise<TransformResult> {
  const resolved: TransformResult["resolved"] = [];
  const layouts: TransformResult["layouts"] = [];
  const ctx = createContext(options, resolved);
  const scope = new Scope(options.data ?? {});
  const renderContext = { path: options.path, expressions: ctx.expressions };

  const parsed = HTML_START_TAG.test(html) ? parseDocumentSource(html, options.path) : undefined;
  if (parsed === undefined || findFirst(parsed, "html")?.sourceCodeLocation == null) {
    const fragment = parseFragmentSource(html, options.path);
    render(fragment, scope, renderContext);
    await expandReferences(fragment, ctx, []);
    return { html: serializeOutput(fragment), resolved, layouts };
  }

  const document = await applyLayouts(
    parsed,
    { ...options, resolveAsset: ctx.resolveAsset },
    layouts,
  );
  // 字下げは、描画で `<head>` の子が消える前に求める
  const head = findFirst(document, "head");
  const indent = head && headIndent(head);
  render(document, scope, renderContext);
  await expandReferences(document, ctx, []);
  aggregate(document, indent);
  return { html: serializeOutput(document), resolved, layouts };
}
