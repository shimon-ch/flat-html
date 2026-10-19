import { expect, test } from "vite-plus/test";
import { TemplateError, transform } from "../src/index.ts";
import { expand, templates } from "./helpers.ts";

test("参照名が消えるコンポーネント: 参照タグがテンプレートの出力に置き換わる", async () => {
  const html = await expand("<flat-accordion></flat-accordion>", {
    accordion: "<details><summary>title</summary></details>",
  });
  expect(html).toBe('<details data-flat="accordion"><summary>title</summary></details>');
});

test("参照名が残るコンポーネント: テンプレート出力の同名タグは再展開しない", async () => {
  const html = await expand("<flat-tabs></flat-tabs>", {
    tabs: "<flat-tabs><div>inner</div></flat-tabs>",
  });
  expect(html).toBe('<flat-tabs data-flat="tabs"><div>inner</div></flat-tabs>');
});

test("テンプレート内の別の参照は再帰的に展開する", async () => {
  const html = await expand("<flat-card></flat-card>", {
    card: "<article><flat-badge></flat-badge></article>",
    badge: "<span>new</span>",
  });
  expect(html).toBe('<article data-flat="card"><span data-flat="badge">new</span></article>');
});

test("使われなかった引数は出力の最上位要素すべてへ透過し、class は連結する", async () => {
  const html = await expand(
    '<flat-pair id="x" class="extra" aria-label="pair" label="{{ greeting }}"></flat-pair>',
    { pair: '<p class="a">{{ label }}</p><p>2</p>' },
    { greeting: "hello" },
  );
  expect(html).toBe(
    '<p class="a extra" id="x" aria-label="pair" data-flat="pair">hello</p>' +
      '<p id="x" class="extra" aria-label="pair" data-flat="pair">2</p>',
  );
});

test("テンプレートで使われた引数は透過しない（if / html でも同じ）", async () => {
  const html = await expand('<flat-x show="yes" raw="<b>r</b>" plain="p"></flat-x>', {
    x: '<div><template if="show">s</template><template html="raw"></template></div>',
  });
  expect(html).toBe('<div plain="p" data-flat="x">s<b>r</b></div>');
});

test("解決できない参照はパスと行番号つきの例外になる", async () => {
  const promise = transform("<div>\n<flat-missing></flat-missing></div>", {
    resolve: templates({}),
    path: "page.html",
  });
  await expect(promise).rejects.toBeInstanceOf(TemplateError);
  await expect(promise).rejects.toThrow("page.html:2: <flat-missing> のテンプレートが見つからない");
});

test("解決一覧には参照名とファイルパスが 1 回ずつ並ぶ", async () => {
  const result = await transform("<flat-a></flat-a><flat-a></flat-a><flat-b></flat-b>", {
    resolve: templates({ a: "<i></i>", b: "<b></b>" }),
  });
  expect(result.resolved).toEqual([
    { name: "a", path: "templates/a.html" },
    { name: "b", path: "templates/b.html" },
  ]);
});

test("素の <template> の中にある参照は不活性のまま残す", async () => {
  const html = await expand("<template><flat-a></flat-a></template>", { a: "<i></i>" });
  expect(html).toBe("<template><flat-a></flat-a></template>");
});
