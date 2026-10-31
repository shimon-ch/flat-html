import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { flatHtml } from "@flat-html/vite";
import { defineConfig } from "vite-plus";

/** 配信先のパス。このリポジトリの Pages は `/flat-html/` の下に出る（ADR-0028）。CI は `SITE_BASE` で渡す */
const base = process.env.SITE_BASE ?? "/";

/** `@flat-html/elements` のテンプレート置き場。消費者が npm で使うときと同じ経路（パッケージ名の解決）で求める */
const elementsRoot = path.join(
  path.dirname(fileURLToPath(import.meta.resolve("@flat-html/elements/package.json"))),
  "src",
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
