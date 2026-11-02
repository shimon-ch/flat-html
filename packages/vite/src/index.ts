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
 * 解決した資産の絶対パス `file` を、ページのファイル `page` に書く URL にする（ADR-0034）。
 *
 * ビルド（`command` が `"build"`）では、`page` のディレクトリからの相対パスにし、`./` か `../` で始める。
 * Vite のビルドは HTML の中の相対 URL をページの位置から解決し、import に変わる資産
 * （`media` も `disabled` もない `<link rel="stylesheet">` と `<script type="module">`）も、
 * 変わらない資産（`<link rel="preload">`、`<link rel="modulepreload">`、`media` 付きの `<link rel="stylesheet">`）も、
 * ハッシュ付きの資産として出し直す。`/@fs/` の URL は後者で解決されず、そのまま出力に残る。
 *
 * 開発サーバーでは `/@fs/<絶対パス>` にする。Vite の root の外にあるファイル（別パッケージのコンポーネントの CSS など）を
 * そのまま配信させるため。`base` は付けない。Vite 自身の HTML 変換が `/` で始まる URL に付ける。
 */
function assetUrl(file: string, page: string, command: ResolvedConfig["command"]): string {
  if (command === "build") {
    const relative = path.relative(path.dirname(page), file).replaceAll(path.sep, "/");
    return relative.startsWith("../") ? relative : `./${relative}`;
  }
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
        const result = await transform(html, {
          path: ctx.filename,
          data: options.data,
          resolve: (name) => resolveTemplate(roots, name),
          resolveLayout: (href, fromPath) =>
            resolveLayoutFile(config.root, fromPath ?? ctx.filename, href),
          resolveAsset: async (specifier, fromPath) => {
            const file = await resolveAssetFile(fromPath, specifier);
            return file === null ? null : assetUrl(file, ctx.filename, config.command);
          },
        });

        const lines = formatResolved(config.root, result);
        if (server) {
          for (const line of lines) {
            if (logged.has(line)) continue;
            logged.add(line);
            config.logger.info(`[flat-html] ${line}`);
          }
          // 資産そのものは監視しない。中身が変わっても書き出す URL は変わらず、
          // 資産の更新は Vite の HMR が扱う。ここで全体再読み込みを出すと CSS の差し替えを潰す
          for (const file of [...result.layouts, ...result.resolved].map((r) => r.path)) {
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
