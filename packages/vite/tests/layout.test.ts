import { expect, test } from "vite-plus/test";
import { TemplateError } from "../src/index.ts";
import { headOf, layouts, lines, page, squash, templates } from "./helpers.ts";

const base =
  '<!doctype html><html lang="en" class="base"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
  '<title>Base</title><link rel="stylesheet" href="/base.css"></head>' +
  '<body class="layout" data-theme="light"><flat-nav></flat-nav><main><slot></slot></main><footer><slot name="footer">default footer</slot></footer></body></html>';

const pageHtml =
  '<!doctype html><html lang="ja" class="page"><head><link rel="layout" href="base.html"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Page</title><meta name="description" content="d"></head>' +
  '<body class="article"><h1>Hello</h1><p slot="footer">custom footer</p></body></html>';

test("ページはレイアウトへ合流する: head の合流、slot への移動、属性の合流、title と meta の一意化", async () => {
  const result = await page(pageHtml, {
    resolveLayout: layouts({ "base.html": base }),
    resolve: templates({ nav: "<nav>nav</nav>" }),
  });
  expect(squash(result.html)).toBe(
    squash(
      '<!doctype html><html lang="ja" class="base page"><head>' +
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page</title>' +
        '<meta name="description" content="d"><link rel="stylesheet" href="/base.css"></head>' +
        '<body class="layout article" data-theme="light"><nav data-flat="nav">nav</nav><main><h1>Hello</h1></main><footer><p>custom footer</p></footer></body></html>',
    ),
  );
  expect(result.layouts).toEqual([{ href: "base.html", path: "layouts/base.html" }]);
  expect(result.resolved).toEqual([{ name: "nav", path: "templates/nav.html" }]);
});

test("ページに title や meta がなければレイアウトのものが残る", async () => {
  const result = await page(
    '<!doctype html><html><head><link rel="layout" href="base.html"></head><body>x</body></html>',
    { resolveLayout: layouts({ "base.html": base }), resolve: templates({ nav: "<nav></nav>" }) },
  );
  expect(result.html).toContain("<title>Base</title>");
  expect(result.html.match(/<meta charset/g)).toHaveLength(1);
  expect(result.html.match(/<meta name="viewport"/g)).toHaveLength(1);
  expect(result.html).not.toContain('rel="layout"');
});

test("レイアウトは多段にでき、外側のレイアウトの slot へ順に入る", async () => {
  const outer =
    '<!doctype html><html><head><title>Outer</title></head><body><div id="outer"><slot></slot></div></body></html>';
  const inner =
    '<!doctype html><html><head><link rel="layout" href="outer.html"></head><body><div id="inner"><slot></slot></div></body></html>';
  const result = await page(
    '<!doctype html><html><head><link rel="layout" href="inner.html"><title>P</title></head><body><p>c</p></body></html>',
    { resolveLayout: layouts({ "inner.html": inner, "outer.html": outer }) },
  );
  expect(squash(result.html)).toBe(
    squash(
      '<!doctype html><html><head><title>P</title></head><body><div id="outer"><div id="inner"><p>c</p></div></div></body></html>',
    ),
  );
  expect(result.layouts.map((l) => l.href)).toEqual(["inner.html", "outer.html"]);
});

test("レイアウト解決が渡されていない、または見つからないと例外になる", async () => {
  const html =
    '<!doctype html><html><head>\n<link rel="layout" href="x.html"></head><body></body></html>';
  await expect(page(html)).rejects.toBeInstanceOf(TemplateError);
  await expect(page(html, { resolveLayout: layouts({}) })).rejects.toThrow(
    "page.html:2: レイアウト x.html が見つからない",
  );
});

const formattedBase = lines(
  "<!doctype html>",
  '<html lang="ja">',
  "  <head>",
  '    <meta charset="utf-8" />',
  '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
  '    <meta name="color-scheme" content="light dark" />',
  "    <title>Base</title>",
  '    <link rel="stylesheet" href="/site.css" />',
  "  </head>",
  "  <body>",
  "    <main><slot></slot></main>",
  "  </body>",
  "</html>",
);

test("整形されたページとレイアウトの合流では、<head> の要素が 1 行ずつ並び、空行が残らない", async () => {
  const result = await page(
    lines(
      "<!doctype html>",
      '<html lang="ja">',
      "  <head>",
      '    <link rel="layout" href="base.html" />',
      '    <meta charset="utf-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
      "    <title>Page</title>",
      '    <meta name="description" content="d" />',
      "  </head>",
      "  <body>",
      "    <h1>Hello</h1>",
      "  </body>",
      "</html>",
    ),
    { resolveLayout: layouts({ "base.html": formattedBase }) },
  );
  expect(headOf(result.html)).toBe(
    lines(
      "<head>",
      '    <meta charset="utf-8">',
      '    <meta name="viewport" content="width=device-width, initial-scale=1">',
      '    <meta name="color-scheme" content="light dark">',
      "    <title>Page</title>",
      '    <meta name="description" content="d">',
      '    <link rel="stylesheet" href="/site.css">',
      "  </head>",
    ),
  );
});

test("ページ側 <head> のコメントは字下げ付きで移る", async () => {
  const result = await page(
    lines(
      "<!doctype html>",
      "<html>",
      "  <head>",
      '    <link rel="layout" href="base.html" />',
      "    <!-- 検索向け -->",
      '    <meta name="description" content="d" />',
      "  </head>",
      "  <body></body>",
      "</html>",
    ),
    { resolveLayout: layouts({ "base.html": formattedBase }) },
  );
  expect(headOf(result.html)).toBe(
    lines(
      "<head>",
      '    <meta charset="utf-8">',
      '    <meta name="viewport" content="width=device-width, initial-scale=1">',
      '    <meta name="color-scheme" content="light dark">',
      "    <title>Base</title>",
      "    <!-- 検索向け -->",
      '    <meta name="description" content="d">',
      '    <link rel="stylesheet" href="/site.css">',
      "  </head>",
    ),
  );
});

test("ページ側の要素は、ページの字下げでなくレイアウトの字下げで並ぶ", async () => {
  const layout = lines(
    "<!doctype html>",
    "<html>",
    "\t<head>",
    "\t\t<title>Base</title>",
    "\t</head>",
    "\t<body><slot></slot></body>",
    "</html>",
  );
  const result = await page(
    lines(
      "<!doctype html>",
      "<html>",
      "  <head>",
      '    <link rel="layout" href="base.html" />',
      "    <title>Page</title>",
      '    <meta name="description" content="d" />',
      "  </head>",
      "  <body></body>",
      "</html>",
    ),
    { resolveLayout: layouts({ "base.html": layout }) },
  );
  expect(headOf(result.html)).toBe(
    lines(
      "<head>",
      "\t\t<title>Page</title>",
      '\t\t<meta name="description" content="d">',
      "\t</head>",
    ),
  );
});

test("多段のレイアウトでも、<head> の要素は外側のレイアウトの字下げで 1 行ずつ並ぶ", async () => {
  const outer = lines(
    "<!doctype html>",
    "<html>",
    "  <head>",
    '    <meta charset="utf-8" />',
    "    <title>Outer</title>",
    "  </head>",
    '  <body><div id="outer"><slot></slot></div></body>',
    "</html>",
  );
  const inner = lines(
    "<!doctype html>",
    "<html>",
    "  <head>",
    '    <link rel="layout" href="outer.html" />',
    '    <link rel="stylesheet" href="/inner.css" />',
    "    <title>Inner</title>",
    "  </head>",
    '  <body><div id="inner"><slot></slot></div></body>',
    "</html>",
  );
  const result = await page(
    lines(
      "<!doctype html>",
      "<html>",
      "  <head>",
      '    <link rel="layout" href="inner.html" />',
      "    <title>P</title>",
      '    <meta name="description" content="d" />',
      "  </head>",
      "  <body><p>c</p></body>",
      "</html>",
    ),
    { resolveLayout: layouts({ "inner.html": inner, "outer.html": outer }) },
  );
  expect(headOf(result.html)).toBe(
    lines(
      "<head>",
      '    <meta charset="utf-8">',
      "    <title>P</title>",
      '    <meta name="description" content="d">',
      '    <link rel="stylesheet" href="/inner.css">',
      "  </head>",
    ),
  );
});

test("ページの <meta charset> は、レイアウトの先頭にある <meta charset> の位置を引き継ぐ", async () => {
  const result = await page(
    lines(
      "<!doctype html>",
      "<html>",
      "  <head>",
      '    <link rel="layout" href="base.html" />',
      '    <meta name="description" content="d" />',
      '    <meta charset="UTF-8" />',
      "  </head>",
      "  <body></body>",
      "</html>",
    ),
    {
      resolveLayout: layouts({
        "base.html": lines(
          "<!doctype html>",
          "<html>",
          "  <head>",
          '    <meta charset="utf-8" />',
          '    <meta name="color-scheme" content="light dark" />',
          "    <title>Base</title>",
          "  </head>",
          "  <body><slot></slot></body>",
          "</html>",
        ),
      }),
    },
  );
  expect(headOf(result.html)).toBe(
    lines(
      "<head>",
      '    <meta charset="UTF-8">',
      '    <meta name="color-scheme" content="light dark">',
      "    <title>Base</title>",
      '    <meta name="description" content="d">',
      "  </head>",
    ),
  );
});

test("ページの <title> は、レイアウトの <title> の位置を引き継ぐ", async () => {
  const result = await page(
    '<!doctype html><html><head><link rel="layout" href="base.html"><title>Page</title></head><body></body></html>',
    {
      resolveLayout: layouts({
        "base.html":
          '<!doctype html><html><head><meta charset="utf-8"><title>Base</title>' +
          '<meta name="color-scheme" content="light dark"></head><body><slot></slot></body></html>',
      }),
    },
  );
  expect(headOf(result.html)).toBe(
    '<head><meta charset="utf-8"><title>Page</title><meta name="color-scheme" content="light dark"></head>',
  );
});

test("レイアウトに同じ種類の要素がなければ、ページの要素は <head> の末尾に入る", async () => {
  const result = await page(
    '<!doctype html><html><head><link rel="layout" href="base.html">' +
      '<meta name="viewport" content="width=device-width"></head><body></body></html>',
    {
      resolveLayout: layouts({
        "base.html":
          '<!doctype html><html><head><meta charset="utf-8"><title>Base</title></head>' +
          "<body><slot></slot></body></html>",
      }),
    },
  );
  expect(headOf(result.html)).toBe(
    '<head><meta charset="utf-8"><title>Base</title><meta name="viewport" content="width=device-width"></head>',
  );
});

test("素の <template> の中の <title> は重複除去の候補にせず、本物の <title> を残す", async () => {
  const fromPage = await page(
    '<!doctype html><html><head><link rel="layout" href="base.html">' +
      "<template><title>T</title></template></head><body></body></html>",
    {
      resolveLayout: layouts({
        "base.html":
          "<!doctype html><html><head><title>Base</title></head><body><slot></slot></body></html>",
      }),
    },
  );
  expect(headOf(fromPage.html)).toBe(
    "<head><title>Base</title><template><title>T</title></template></head>",
  );

  const fromLayout = await page(
    '<!doctype html><html><head><link rel="layout" href="base.html"><title>Page</title></head><body></body></html>',
    {
      resolveLayout: layouts({
        "base.html":
          "<!doctype html><html><head><template><title>T</title></template><title>Base</title></head>" +
          "<body><slot></slot></body></html>",
      }),
    },
  );
  expect(headOf(fromLayout.html)).toBe(
    "<head><template><title>T</title></template><title>Page</title></head>",
  );
});

/** ページの `<title>P</title>` を、`<head>` の中身が `layoutHead` のレイアウトへ合流させ、出力の `<head>` を返す。 */
async function mergeTitleInto(layoutHead: string, data: Record<string, unknown>): Promise<string> {
  const result = await page(
    '<!doctype html><html><head><link rel="layout" href="base.html"><title>P</title></head><body></body></html>',
    {
      data,
      resolveLayout: layouts({
        "base.html": `<!doctype html><html><head>${layoutHead}</head><body><slot></slot></body></html>`,
      }),
    },
  );
  return headOf(result.html);
}

const colorScheme = '<meta name="color-scheme" content="light dark">';

test("レイアウトの <template if> の中の <title> も重複除去の候補に数え、ページの <title> だけを残す", async () => {
  for (const x of [true, false]) {
    expect(
      await mergeTitleInto(
        `<template if="x"><title>A</title></template><title>B</title>${colorScheme}`,
        { x },
      ),
    ).toBe(`<head><title>P</title>${colorScheme}</head>`);
  }
});

test("レイアウトの <head> の直下に同じ種類がなければ、ページの要素は <template if> の中へ入れず末尾へ入れる", async () => {
  for (const x of [true, false]) {
    expect(
      await mergeTitleInto(`<template if="x"><title>A</title></template>${colorScheme}`, { x }),
    ).toBe(`<head>${colorScheme}<title>P</title></head>`);
  }
});

test("詰めて書かれた <head> の合流では空白を足さない", async () => {
  const result = await page(pageHtml, {
    resolveLayout: layouts({ "base.html": base }),
    resolve: templates({ nav: "<nav>nav</nav>" }),
  });
  expect(headOf(result.html)).toBe(
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page</title>' +
      '<meta name="description" content="d"><link rel="stylesheet" href="/base.css"></head>',
  );
});

test('<head> の素の <template> の中の <link rel="layout"> はレイアウトとして使わない', async () => {
  const html =
    "<!doctype html><html><head><title>t</title>" +
    '<template><link rel="layout" href="base.html"></template></head><body><p>x</p></body></html>';
  const result = await page(html, {
    resolveLayout: layouts({
      "base.html":
        "<!doctype html><html><head></head><body><main><slot></slot></main></body></html>",
    }),
  });
  expect(result.layouts).toEqual([]);
  expect(squash(result.html)).toBe(squash(html));
});

test("レイアウトの <template if> の中の <slot> には差し込む。素の <template> の中の <slot> には差し込まない", async () => {
  for (const x of [true, false]) {
    const result = await page(
      '<!doctype html><html><head><link rel="layout" href="base.html"></head><body><p>c</p></body></html>',
      {
        data: { x },
        resolveLayout: layouts({
          "base.html":
            "<!doctype html><html><head></head><body>" +
            '<x-shell><template shadowrootmode="open"><slot></slot></template>' +
            '<template if="x"><main><slot></slot></main></template></x-shell></body></html>',
        }),
      },
    );
    expect(result.html).toBe(
      "<!DOCTYPE html><html><head></head><body>" +
        '<x-shell><template shadowrootmode="open"><slot></slot></template>' +
        `${x ? "<main><p>c</p></main>" : ""}</x-shell></body></html>`,
    );
  }
});
