import { expect, test } from "vite-plus/test";
import { TemplateError } from "../src/index.ts";
import { expand } from "./helpers.ts";

test("{{ }} はテキストと属性値で使え、常に HTML エスケープされる", async () => {
  const html = await expand('<p title="{{ t }}">{{ t }}</p>', {}, { t: '<b>"&' });
  expect(html).toBe('<p title="<b>&quot;&amp;">&lt;b&gt;"&amp;</p>');
});

test("プロパティ参照と null / undefined は空文字になる", async () => {
  const html = await expand(
    "<p>{{ a.b.c }}|{{ a.x.y }}|{{ nothing }}</p>",
    {},
    { a: { b: { c: 1 } } },
  );
  expect(html).toBe("<p>1||</p>");
});

test("<template if> は真なら中身だけ残し、偽なら消える", async () => {
  const html = await expand(
    '<template if="a == \'x\' && !b">yes</template><template if="b || c != null">no</template>',
    {},
    { a: "x", b: false, c: null },
  );
  expect(html).toBe("yes");
});

test("<template each> は item を導入して繰り返す", async () => {
  const html = await expand(
    '<ul><template each="item of items"><li class="{{ item.kind }}">{{ item.name }}</li></template></ul>',
    {},
    {
      items: [
        { name: "a", kind: "x" },
        { name: "b", kind: "y" },
      ],
    },
  );
  expect(html).toBe('<ul><li class="x">a</li><li class="y">b</li></ul>');
});

test("<template html> は生の HTML を差し込む", async () => {
  const html = await expand('<div><template html="raw"></template></div>', {}, { raw: "<b>r</b>" });
  expect(html).toBe("<div><b>r</b></div>");
});

test("関数呼び出し・算術・代入は構文エラーとしてパスと行つきで失敗する", async () => {
  for (const expr of ["f()", "a + 1", "a = 1", "a.b[0]"]) {
    const promise = expand(`<p>\n\n{{ ${expr} }}</p>`, {});
    await expect(promise).rejects.toBeInstanceOf(TemplateError);
    await expect(promise).rejects.toThrow(/^page\.html:3: /);
  }
});

test("テンプレート内の構文エラーはテンプレートのパスを指す", async () => {
  const promise = expand("<flat-x></flat-x>", { x: "<p>\n{{ a() }}</p>" });
  await expect(promise).rejects.toThrow(/^templates\/x\.html:2: /);
});

test("コンポーネントからはページの data が見えず、自分の引数だけが見える", async () => {
  const html = await expand(
    '<flat-x own="mine"></flat-x>',
    { x: "<p>{{ own }}|{{ secret }}</p>" },
    { secret: "page" },
  );
  expect(html).toBe('<p data-flat="x">mine|</p>');
});

test("ページの data は参照タグの属性を通じてコンポーネントへ渡せる", async () => {
  const html = await expand(
    '<flat-x label="{{ title }}"></flat-x>',
    { x: "<p>{{ label }}</p>" },
    { title: "T" },
  );
  expect(html).toBe('<p data-flat="x">T</p>');
});
