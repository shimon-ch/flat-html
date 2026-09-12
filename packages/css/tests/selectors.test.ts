import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";

const srcDir = join(import.meta.dirname, "../src");
const files = readdirSync(srcDir).filter((name) => name.endsWith(".css"));
const read = (name: string) => readFileSync(join(srcDir, name), "utf8");

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** 宣言ブロックの中身を除き、セレクタと at-rule の前置部だけを取り出す */
const preludes = (css: string) =>
  stripComments(css)
    .replace(/"[^"]*"|'[^']*'/g, '""')
    .split(/[{};]/)
    .map((s) => s.trim())
    .filter((s) => s !== "" && !/^[a-z-]+\s*:/.test(s));

test("src に 4 ファイルが存在する", () => {
  expect(files).toEqual(
    expect.arrayContaining(["flat.css", "tokens.css", "reset.css", "base.css"]),
  );
});

test.each(files)("%s にクラスセレクタがない", (name) => {
  for (const prelude of preludes(read(name))) {
    const withoutUrl = prelude.replace(/url\([^)]*\)/g, "");
    expect(withoutUrl, prelude).not.toMatch(/\.[a-zA-Z_-]/);
  }
});

test.each(files)("%s に prefers-color-scheme がない", (name) => {
  expect(stripComments(read(name))).not.toContain("prefers-color-scheme");
});

test("flat.css が 4 層を正しい順序で宣言する", () => {
  const css = stripComments(read("flat.css"));
  expect(css).toMatch(/@layer\s+reset\s*,\s*base\s*,\s*components\s*,\s*site\s*;/);
  expect(css.indexOf("@layer")).toBeLessThan(css.indexOf("@import"));
});

test("tokens.css の --flat-* は 8 以上 14 以下", () => {
  const names = new Set(stripComments(read("tokens.css")).match(/--flat-[a-z-]+(?=\s*:)/g));
  expect(names.size).toBeGreaterThanOrEqual(8);
  expect(names.size).toBeLessThanOrEqual(14);
});
