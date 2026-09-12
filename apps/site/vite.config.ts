import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flatHtml } from "@flat-html/vite";
import { defineConfig } from "vite-plus";

/** GitHub Pages はリポジトリ名の下（`/flat-html/`）に配信される。CI は `GITHUB_PAGES=1` で切り替える */
const base = process.env.GITHUB_PAGES ? "/flat-html/" : "/";

/**
 * `@flat-html/elements` のテンプレート置き場。`exports` の `./*` が指す実ディレクトリを、
 * 消費者が npm で使うときと同じ経路（パッケージ名の解決）で求める。解決時にファイルの存在は見ない。
 */
const elementsRoot = path.dirname(
  fileURLToPath(import.meta.resolve("@flat-html/elements/index.html")),
);

export default defineConfig({
  base,
  plugins: [
    flatHtml({
      // 探索先は先頭優先。サイト固有のコンポーネントが elements と同名なら、サイト側が勝つ
      roots: ["src/components", elementsRoot],
      data: { base },
    }),
  ],
  build: {
    // 配信パスと同じ形で dist に出す（`/` なら dist/、`/flat-html/` なら dist/flat-html/）。
    // Lighthouse CI の静的サーバーが Pages と同じ URL で開けるようにするため
    outDir: path.join("dist", base),
    rollupOptions: {
      input: globSync(["*.html", "pages/**/*.html"], { cwd: import.meta.dirname }).map((file) =>
        path.join(import.meta.dirname, file),
      ),
    },
  },
  lint: {},
  fmt: {},
});
