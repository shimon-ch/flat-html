import path from "node:path";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import {
  resolveAssetFile,
  resolveLayoutFile,
  resolveTemplate,
  type ResolvePackage,
} from "./resolve.ts";
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

/** `file` が `dir` の中にあるか。 */
function isInside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/**
 * 解決した資産の絶対パス `file` を、ページのファイル `page` に書く URL にする（ADR-0034）。
 * `file` が `config.root` の中にあれば、開発サーバーでもビルドでも、`/` で始まる root からの相対パスを返す。
 * root の外にあれば、ビルド（`config.command` が `"build"`）では `page` のディレクトリからの、`./` か `../` で始まる相対パスを返す。
 * 開発サーバーで root の外にあるときと、ドライブが違って相対パスにできないときは `/@fs/<絶対パス>` を返す。
 * 区切りはどれも `/` で、`base` は付けない（ADR-0034）。
 * `page` は開発サーバーでは実在するファイルとは限らない（`pageFileOf`）ので、開発サーバーの URL は `page` に頼らない。
 */
function assetUrl(file: string, page: string, config: ResolvedConfig): string {
  if (isInside(config.root, file)) {
    return `/${path.relative(config.root, file).replaceAll(path.sep, "/")}`;
  }
  const relative = path.relative(path.dirname(page), file);
  if (config.command === "build" && !path.isAbsolute(relative)) {
    const url = relative.replaceAll(path.sep, "/");
    return url.startsWith("../") ? url : `./${url}`;
  }
  return `/@fs/${file.replaceAll(path.sep, "/").replace(/^\//, "")}`;
}

/**
 * `transformIndexHtml` の `ctx.filename` から、ページのファイルのパスを求める（ADR-0034）。
 * `.html` で終わればそのまま返す。終わらなければディレクトリとみなし、その中の `index.html` を返す。
 * 開発サーバーの Vite は `ctx.filename` を要求の URL のパスを root に繋いで作るので、
 * `server.transformIndexHtml('/', html)` では root のディレクトリ、末尾が `/` の URL ではそのディレクトリになる。
 */
function pageFileOf(filename: string): string {
  return filename.endsWith(".html") ? filename : path.join(filename, "index.html");
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
  let resolvePackage: ResolvePackage;
  let server: ViteDevServer | undefined;
  const watched = new Set<string>();
  const logged = new Set<string>();

  return {
    name: "flat-html",
    configResolved(resolved) {
      config = resolved;
      resolvePackage = resolved.createResolver();
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
        const page = pageFileOf(ctx.filename);
        const result = await transform(html, {
          path: page,
          data: options.data,
          resolve: (name) => resolveTemplate(roots, name),
          resolveLayout: (href, fromPath) => resolveLayoutFile(config.root, fromPath ?? page, href),
          resolveAsset: async (specifier, fromPath) => {
            const file = await resolveAssetFile(fromPath, specifier, resolvePackage);
            return file === null ? null : assetUrl(file, page, config);
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
