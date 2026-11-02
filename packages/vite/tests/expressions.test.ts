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

test("属性値全体が 1 つの {{ }} で null なら、属性ごと消える", async () => {
  const html = await expand('<p title="{{ t }}" class="c">x</p>', {}, { t: null });
  expect(html).toBe('<p class="c">x</p>');
});

test("属性値全体が 1 つの {{ }} で undefined なら、属性ごと消える", async () => {
  const missingArg = await expand("<flat-x></flat-x>", { x: '<img src="a.png" alt="{{ alt }}">' });
  expect(missingArg).toBe('<img src="a.png" data-flat="x">');

  const missingProperty = await expand('<p title="{{ a.missing }}">x</p>', {}, { a: {} });
  expect(missingProperty).toBe("<p>x</p>");
});

test("false は消えず、文字列 false になる", async () => {
  const html = await expand('<button aria-expanded="{{ open }}">x</button>', {}, { open: false });
  expect(html).toBe('<button aria-expanded="false">x</button>');
});

test("空文字列の引数は消えず、空の属性になる", async () => {
  const html = await expand('<flat-x alt=""></flat-x>', { x: '<img src="a.png" alt="{{ alt }}">' });
  expect(html).toBe('<img src="a.png" alt="" data-flat="x">');
});

test("値に他の文字が混ざる属性は消えず、null / undefined は空文字になる", async () => {
  const html = await expand(
    '<a href="{{ base }}pages/" title="{{ missing }}pages/">x</a>',
    {},
    { base: null },
  );
  expect(html).toBe('<a href="pages/" title="pages/">x</a>');
});

test("{{ }} が 2 つ並ぶ属性は、どちらも null / undefined でも消えない", async () => {
  const html = await expand('<p title="{{ a }}{{ b }}">x</p>', {}, { a: null });
  expect(html).toBe('<p title="">x</p>');
});

test("{{ }} の前後に空白がある属性は、null でも消えない", async () => {
  const html = await expand('<p title=" {{ x }} ">x</p>', {}, { x: null });
  expect(html).toBe('<p title="  ">x</p>');
});

test("&& と || null で、条件に合うときだけ属性を出せる", async () => {
  const nav = "<a href=\"/\" aria-current=\"{{ current == 'home' && 'page' || null }}\">h</a>";
  const html = await expand(
    '<flat-x current="home"></flat-x><flat-x current="css"></flat-x><flat-x></flat-x>',
    { x: nav },
  );
  expect(html).toBe(
    '<a href="/" aria-current="page" data-flat="x">h</a>' +
      '<a href="/" data-flat="x">h</a>' +
      '<a href="/" data-flat="x">h</a>',
  );
});

test("参照タグの属性も消え、コンポーネントからは引数がないのと同じに見える", async () => {
  const html = await expand(
    '<flat-x label="{{ title }}" id="{{ id }}"></flat-x>',
    { x: '<p title="{{ label }}">x</p>' },
    { title: null },
  );
  expect(html).toBe('<p data-flat="x">x</p>');
});
