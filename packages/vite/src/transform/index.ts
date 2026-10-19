import { parse, parseFragment, serialize } from "parse5";
import { aggregate } from "./assets.ts";
import { findFirst } from "./dom.ts";
import { Scope } from "./evaluator.ts";
import { expandReferences, type ExpandContext } from "./expand.ts";
import { applyLayouts } from "./layout.ts";
import { render } from "./render.ts";
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
 * HTML 文字列の `flat-*` 参照を展開し、資産を `<head>` へ集約して返す。Vite には依存しない。
 * `<html>` を持つ入力はページとして扱い、レイアウトの合流と集約を行う。持たない入力は断片として展開だけ行う。
 */
export async function transform(html: string, options: TransformOptions): Promise<TransformResult> {
  const resolved: TransformResult["resolved"] = [];
  const layouts: TransformResult["layouts"] = [];
  const ctx = createContext(options, resolved);
  const scope = new Scope(options.data ?? {});

  const parsed = parse(html, { sourceCodeLocationInfo: true });
  const isPage = findFirst(parsed, "html")?.sourceCodeLocation != null;
  if (!isPage) {
    const fragment = parseFragment(html, { sourceCodeLocationInfo: true });
    render(fragment, scope, options.path);
    await expandReferences(fragment, ctx, []);
    return { html: serialize(fragment), resolved, layouts };
  }

  const document = await applyLayouts(parsed, options, layouts);
  render(document, scope, options.path);
  await expandReferences(document, ctx, []);
  aggregate(document);
  return { html: serialize(document), resolved, layouts };
}
