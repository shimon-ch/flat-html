import path from "node:path";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { resolveAssetFile, resolveLayoutFile, resolveTemplate } from "./resolve.ts";
import { transform, type TransformResult } from "./transform/index.ts";

export { TemplateError, transform } from "./transform/index.ts";
export type { TemplateSource, TransformOptions, TransformResult } from "./transform/index.ts";

/** `flatHtml` プラグインの設定。 */
export interface FlatHtmlOptions {
  /** テンプレートの探索先。先頭優先。相対パスは Vite の root 基準 */
  roots: string[];
  /** ページに渡すデータ */
  data?: Record<string, unknown>;
}

/**
 * 解決した資産の絶対パスを、Vite が読み込める URL にする。
 *
 * 開発サーバーでもビルドでも `/@fs/<絶対パス>` の形にする。Vite の root の外にあるファイル
 * （別パッケージのコンポーネントの CSS など）を指せて、開発サーバー（そのまま配信する）と
 * ビルド（import として解決し、ハッシュ付きの資産に出し直す）の両方が受け付ける形のため。
 * `base` は付けない。開発サーバーでは Vite 自身の HTML 変換が `/` で始まる URL に付ける。
 */
function assetUrl(file: string): string {
  return `/@fs/${file.replaceAll(path.sep, "/").replace(/^\//, "")}`;
}

/** 解決一覧を 1 行ずつの文字列にする。パスは Vite の root からの相対で出す。 */
function formatResolved(root: string, result: TransformResult): string[] {
  const rel = (p: string): string => path.relative(root, p) || p;
  return [
    ...result.layouts.map((l) => `layout ${l.href} → ${rel(l.path)}`),
    ...result.resolved.map((r) => `flat-${r.name} → ${rel(r.path)}`),
  ];
}

/**
 * flat-html の Vite プラグイン。`transformIndexHtml` の `order: 'pre'` で純粋関数 `transform` を呼ぶだけにする（ADR-0020）。
 * 開発サーバーでは解決したテンプレート・レイアウト・資産を監視し、変更時に全体を再読み込みする。
 */
export function flatHtml(options: FlatHtmlOptions): Plugin {
  let config: ResolvedConfig;
  let server: ViteDevServer | undefined;
  const watched = new Set<string>();
  const logged = new Set<string>();

  return {
    name: "flat-html",
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(devServer) {
      server = devServer;
      const reload = (file: string): void => {
        if (watched.has(file)) devServer.ws.send({ type: "full-reload" });
      };
      devServer.watcher.on("change", reload);
      devServer.watcher.on("unlink", reload);
    },
    transformIndexHtml: {
      order: "pre",
      async handler(html, ctx) {
        const roots = options.roots.map((r) => path.resolve(config.root, r));
        const assets: string[] = [];
        const result = await transform(html, {
          path: ctx.filename,
          data: options.data,
          resolve: (name) => resolveTemplate(roots, name),
          resolveLayout: (href, fromPath) =>
            resolveLayoutFile(config.root, fromPath ?? ctx.filename, href),
          resolveAsset: async (specifier, fromPath) => {
            const file = await resolveAssetFile(fromPath, specifier);
            if (file === null) return null;
            assets.push(file);
            return assetUrl(file);
          },
        });

        const lines = formatResolved(config.root, result);
        if (server) {
          for (const line of lines) {
            if (logged.has(line)) continue;
            logged.add(line);
            config.logger.info(`[flat-html] ${line}`);
          }
          const files = [...result.layouts, ...result.resolved].map((r) => r.path).concat(assets);
          for (const file of files) {
            if (watched.has(file)) continue;
            watched.add(file);
            server.watcher.add(file);
          }
        } else if (lines.length > 0) {
          config.logger.info(
            [
              `[flat-html] ${path.relative(config.root, ctx.filename)}`,
              ...lines.map((l) => `  ${l}`),
            ].join("\n"),
          );
        }
        return result.html;
      },
    },
  };
}
