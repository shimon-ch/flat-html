import { expect, test } from "vite-plus/test";
import { TemplateError } from "../src/index.ts";
import { expand, headOf, layouts, lines, page } from "./helpers.ts";

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

test("<head> の <template if> が偽、<template each> が空で消えるとき、空行を残さない", async () => {
  const result = await page(
    lines(
      "<!doctype html>",
      "<html>",
      "  <head>",
      "    <title>t</title>",
      '    <template if="dev"><script type="module" src="/dev.js"></script></template>',
      '    <template each="s of scripts"><script type="module" src="{{ s }}"></script></template>',
      "  </head>",
      "  <body></body>",
      "</html>",
    ),
    { data: { dev: false, scripts: [] } },
  );
  expect(headOf(result.html)).toBe(lines("<head>", "    <title>t</title>", "  </head>"));
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

const nested = [
  { name: "a", ok: true, tags: ["x", "y"] },
  { name: "b", ok: false, tags: [] },
];

test("<template each> の中の <template if> も、繰り返しごとに評価される", async () => {
  const html = await expand(
    '<ul><template each="i of items"><template if="i.ok"><li>{{ i.name }}</li></template></template></ul>',
    {},
    { items: nested },
  );
  expect(html).toBe("<ul><li>a</li></ul>");
});

test("<template each> の中の <template each> も、繰り返しごとに評価される", async () => {
  const html = await expand(
    '<template each="i of items"><template each="t of i.tags"><b>{{ i.name }}{{ t }}</b></template></template>',
    {},
    { items: nested },
  );
  expect(html).toBe("<b>ax</b><b>ay</b>");
});

test("<template each> の中の素の <template> は、中身ごと複製されて不活性のまま残る", async () => {
  const html = await expand(
    '<template each="i of items"><template><i>{{ i.name }}</i></template></template>',
    {},
    { items: nested },
  );
  expect(html).toBe(
    "<template><i>{{ i.name }}</i></template><template><i>{{ i.name }}</i></template>",
  );
});

test("<script> の中の {{ }} は展開せず書かれたまま出す。<script> の属性は展開する", async () => {
  const html = await expand(
    '<script type="application/ld+json" id="{{ id }}">{"name":"{{ t }}"}</script>',
    {},
    { id: "ld", t: "</script><script>alert(1)</script>" },
  );
  expect(html).toBe('<script type="application/ld+json" id="ld">{"name":"{{ t }}"}</script>');
});

test("<style> の中の {{ }} は展開せず書かれたまま出す。<style> の属性は展開する", async () => {
  const html = await expand(
    '<style media="{{ m }}">p{color:{{ c }}}</style>',
    {},
    { m: "print", c: "red" },
  );
  expect(html).toBe('<style media="print">p{color:{{ c }}}</style>');
});

test("中身に {{ を含むインラインスクリプトは、ページでもテンプレートでも失敗しない", async () => {
  const script = "<script>function f(){{let a=1}}</script>";
  expect(await expand(script, {})).toBe(script);
  expect(await expand('<flat-x a="1"></flat-x>', { x: `<div>${script}</div>` })).toBe(
    `<div a="1" data-flat="x">${script}</div>`,
  );
});

test("直列化でエスケープされない要素の中は展開しない。<title> と <textarea> の中は展開する", async () => {
  for (const tag of ["style", "script", "xmp", "iframe", "noembed", "noframes", "noscript"]) {
    expect(await expand(`<${tag}>{{ x }}</${tag}>`, {}, { x: "X" })).toBe(
      `<${tag}>{{ x }}</${tag}>`,
    );
  }
  expect(await expand("<plaintext>{{ x }}", {}, { x: "X" })).toBe("<plaintext>{{ x }}</plaintext>");
  expect(await expand("<title>{{ x }}</title><textarea>{{ x }}</textarea>", {}, { x: "<X>" })).toBe(
    "<title>&lt;X&gt;</title><textarea>&lt;X&gt;</textarea>",
  );
});

test("<template if> で引数があるかは != undefined で調べる。値のない属性でも真になる", async () => {
  const html = await expand("<flat-x open></flat-x><flat-x></flat-x>", {
    x: '<p><template if="open != undefined">open</template></p>',
  });
  expect(html).toBe('<p data-flat="x">open</p><p data-flat="x"></p>');
});

test("undefined はリテラルで、同名のデータや引数があってもそれを指さない", async () => {
  const fromData = await expand(
    '<template if="open != undefined">open</template>',
    {},
    { undefined: "u" },
  );
  expect(fromData).toBe("");

  const fromArg = await expand('<flat-x undefined="u"></flat-x>', {
    x: "<p>{{ open == undefined }}</p>",
  });
  expect(fromArg).toBe('<p undefined="u" data-flat="x">true</p>');
});

test("文字参照で書いた波括弧は {{ }} の区切りにならず、テキストと属性値に文字参照のまま出る", async () => {
  const html = await expand(
    '<p title="&#123;&#123; title &#125;&#125;">&#123;&#123; title &#125;&#125;</p>',
    {},
    { title: "T" },
  );
  expect(html).toBe(
    '<p title="&#123;&#123; title &#125;&#125;">&#123;&#123; title &#125;&#125;</p>',
  );
});

test("文字参照の波括弧と並べても、そのまま書いた {{ }} は展開される", async () => {
  const html = await expand(
    '<p title="{{ title }} &#123;&#123; title &#125;&#125;">{{ title }} &#123;&#123; title &#125;&#125;</p>',
    {},
    { title: "T" },
  );
  expect(html).toBe(
    '<p title="T &#123;&#123; title &#125;&#125;">T &#123;&#123; title &#125;&#125;</p>',
  );
});

test("10 進、16 進、名前のどの文字参照も、末尾の ; を省いた数値参照も、区切りにならない", async () => {
  const html = await expand(
    "<p>&#x7b;&#X7B; a &#0125;&rcub; &lbrace;&lcub; b &#x7D&#125 &#1234;</p>",
    {},
    { a: "A", b: "B" },
  );
  expect(html).toBe("<p>&#123;&#123; a &#125;&#125; &#123;&#123; b &#125;&#125; \u04d2</p>");
});

test("<script> と <style> とコメントの中の文字参照は、書かれたまま残る", async () => {
  const html =
    '<script>const s = "&#123;&#123; t &#125;&#125; &lbrace;&#x7d";</script>' +
    '<style>p::before{content:"&lcub;"}</style><!-- &#123;&#123; t &#125;&#125; &rbrace; -->';
  expect(await expand(html, {}, { t: "T" })).toBe(html);
});

test("テンプレートとレイアウトでも、文字参照の波括弧は区切りにならず、<script> の中は書かれたまま残る", async () => {
  const body =
    '<p title="&#123;&#123; a &#125;&#125;">&#123;&#123; a &#125;&#125; {{ a }}</p>' +
    '<script>"&lbrace;&#123;"</script>';
  const fromTemplate = await expand('<flat-x a="A"></flat-x>', { x: `<div>${body}</div>` });
  expect(fromTemplate).toBe(
    '<div data-flat="x"><p title="&#123;&#123; a &#125;&#125;">&#123;&#123; a &#125;&#125; A</p>' +
      '<script>"&lbrace;&#123;"</script></div>',
  );

  const fromLayout = await page(
    '<!doctype html><html><head><link rel="layout" href="base.html"></head><body></body></html>',
    {
      data: { a: "A" },
      resolveLayout: layouts({
        "base.html": `<!doctype html><html><head></head><body>${body}<slot></slot></body></html>`,
      }),
    },
  );
  expect(fromLayout.html).toBe(
    "<!DOCTYPE html><html><head></head><body>" +
      '<p title="&#123;&#123; a &#125;&#125;">&#123;&#123; a &#125;&#125; A</p>' +
      '<script>"&lbrace;&#123;"</script></body></html>',
  );
});

test("引数と式の中では、文字参照の波括弧はただの { と } として扱う", async () => {
  const html = await expand('<flat-x open="&#123;"></flat-x>', {
    x: "<p><template if=\"open == '{'\">{{ '&#125;' == '}' }}</template></p>",
  });
  expect(html).toBe('<p data-flat="x">true</p>');
});

test("ソースに非文字 U+FDD0 か U+FDD1 があれば、パスと行を添えて例外になる", async () => {
  const fromPage = expand("<p>\n\uFDD0</p>", {});
  await expect(fromPage).rejects.toBeInstanceOf(TemplateError);
  await expect(fromPage).rejects.toThrow(
    "page.html:2: 非文字 U+FDD0 は flat-html が内部で使うので書けない",
  );

  const fromTemplate = expand("<flat-x></flat-x>", { x: "<p></p>\n\n<p>\uFDD1</p>" });
  await expect(fromTemplate).rejects.toThrow("templates/x.html:3: 非文字 U+FDD1");

  const fromLayout = page(
    '<!doctype html><html><head><link rel="layout" href="base.html"></head><body></body></html>',
    {
      resolveLayout: layouts({
        "base.html": "<!doctype html>\n<html><head></head><body>\uFDD0</body></html>",
      }),
    },
  );
  await expect(fromLayout).rejects.toThrow("layouts/base.html:2: 非文字 U+FDD0");
});
