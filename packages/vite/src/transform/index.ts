import { aggregate } from "./assets.ts";
import { findFirst, headIndent } from "./dom.ts";
import { Scope } from "./evaluator.ts";
import { expandReferences, type ExpandContext } from "./expand.ts";
import { applyLayouts } from "./layout.ts";
import { render } from "./render.ts";
import { parseDocumentSource, parseFragmentSource, serializeOutput } from "./source.ts";
import type { TemplateSource, TransformOptions, TransformResult } from "./types.ts";

export { TemplateError } from "./types.ts";
export type { TemplateSource, TransformOptions, TransformResult } from "./types.ts";

function createContext(
  options: TransformOptions,
  resolved: TransformResult["resolved"],
): ExpandContext {
  const cache = new Map<string, Promise<TemplateSource | null>>();
  return {
    path: options.path,
    resolveAsset: options.resolveAsset,
    expressions: new Map(),
    referenced: new Map(),
    resolve(name) {
      let pending = cache.get(name);
      if (!pending) {
        pending = options.resolve(name).then((source) => {
          if (source) resolved.push({ name, path: source.path });
          return source;
        });
        cache.set(name, pending);
      }
      return pending;
    },
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

  const document = await applyLayouts(parsed, options, layouts);
  // 字下げは、描画で `<head>` の子が消える前に求める
  const head = findFirst(document, "head");
  const indent = head && headIndent(head);
  render(document, scope, renderContext);
  await expandReferences(document, ctx, []);
  aggregate(document, indent);
  return { html: serializeOutput(document), resolved, layouts };
}
