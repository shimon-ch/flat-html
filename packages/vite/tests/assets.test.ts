import { expect, test } from "vite-plus/test";
import { TemplateError } from "../src/index.ts";
import {
  assetResolver,
  expand,
  headOf,
  layouts,
  lines,
  page,
  squash,
  templates,
} from "./helpers.ts";

const doc = (head: string, body: string): string =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

test("コンポーネントの資産は <head> の末尾へ移り、同じ URL は最初の 1 つだけ残る", async () => {
  const result = await page(
    doc(
      "<title>t</title>",
      '<flat-a></flat-a><flat-a></flat-a><script type="module" src="/page.js"></script>',
    ),
    {
      resolve: templates({
        a:
          '<link rel="stylesheet" href="/a.css"><link rel="modulepreload" href="/a.js">' +
          '<link rel="preload" href="/f.woff2" as="font"><script type="module" src="/a.js"></script><div>a</div>',
      }),
    },
  );
  expect(squash(result.html)).toBe(
    squash(
      doc(
        '<title>t</title><link rel="stylesheet" href="/a.css"><link rel="modulepreload" href="/a.js">' +
          '<link rel="preload" href="/f.woff2" as="font"><script type="module" src="/a.js"></script>' +
          '<script type="module" src="/page.js"></script>',
        '<div data-flat="a">a</div><div data-flat="a">a</div>',
      ),
    ),
  );
});

test("src のない <script type=module> やその他の <link> は動かさない", async () => {
  const body =
    '<link rel="icon" href="/i.png"><script type="module">1</script><script src="/x.js"></script>';
  const result = await page(doc("", body));
  expect(squash(result.html)).toBe(squash(doc("", body)));
});

test("断片の変換では <head> がないので集約せず、資産要素は根要素として扱わない", async () => {
  const html = await expand('<flat-a id="x"></flat-a>', {
    a: '<link rel="stylesheet" href="/a.css"><div>a</div>',
  });
  expect(html).toBe('<link rel="stylesheet" href="/a.css"><div id="x" data-flat="a">a</div>');
});

test("テンプレートの資産は、そのテンプレートのパスを基準に解決される。/ 始まりとスキーム付きは触らない", async () => {
  const { calls, resolveAsset } = assetResolver();
  const result = await page(doc("<title>t</title>", "<flat-a></flat-a>"), {
    resolve: templates({
      a:
        '<link rel="stylesheet" href="./index.css">' +
        '<link rel="stylesheet" href="@scope/pkg/index.css">' +
        '<link rel="stylesheet" href="/root.css">' +
        '<link rel="stylesheet" href="https://example.com/x.css">' +
        '<script type="module" src="./index.js"></script><div>a</div>',
    }),
    resolveAsset,
  });

  expect(calls).toEqual([
    { specifier: "./index.css", fromPath: "templates/a.html" },
    { specifier: "@scope/pkg/index.css", fromPath: "templates/a.html" },
    { specifier: "./index.js", fromPath: "templates/a.html" },
  ]);
  expect(squash(result.html)).toBe(
    squash(
      doc(
        '<title>t</title><link rel="stylesheet" href="/fs/templates/index.css">' +
          '<link rel="stylesheet" href="/pkg/@scope/pkg/index.css">' +
          '<link rel="stylesheet" href="/root.css">' +
          '<link rel="stylesheet" href="https://example.com/x.css">' +
          '<script type="module" src="/fs/templates/index.js"></script>',
        '<div data-flat="a">a</div>',
      ),
    ),
  );
});

test("ページ自身に書かれた資産は書き換えない", async () => {
  const { calls, resolveAsset } = assetResolver();
  const html = doc('<title>t</title><link rel="stylesheet" href="./page.css">', "<p>x</p>");
  const result = await page(html, { resolveAsset });
  expect(calls).toEqual([]);
  expect(squash(result.html)).toBe(squash(html));
});

test("レイアウトの資産は、レイアウトのパスを基準に解決される", async () => {
  const { calls, resolveAsset } = assetResolver();
  const result = await page(
    '<!doctype html><html><head><link rel="layout" href="base.html"><title>t</title></head><body><p>x</p></body></html>',
    {
      resolveLayout: layouts({
        "base.html":
          '<!doctype html><html><head><link rel="stylesheet" href="./base.css"></head><body><slot></slot></body></html>',
      }),
      resolveAsset,
    },
  );
  expect(calls).toEqual([{ specifier: "./base.css", fromPath: "layouts/base.html" }]);
  expect(result.html).toContain('<link rel="stylesheet" href="/fs/layouts/base.css">');
});

test("別々のテンプレートが同じ資産を指すと、解決後の URL で 1 つにまとまる", async () => {
  const result = await page(doc("<title>t</title>", "<flat-a></flat-a><flat-b></flat-b>"), {
    resolve: templates({
      a: '<link rel="stylesheet" href="./index.css"><div>a</div>',
      b: '<link rel="stylesheet" href="@scope/pkg/index.css"><div>b</div>',
    }),
    resolveAsset: () => Promise.resolve("/shared.css"),
  });
  expect(squash(result.html)).toBe(
    squash(
      doc(
        '<title>t</title><link rel="stylesheet" href="/shared.css">',
        '<div data-flat="a">a</div><div data-flat="b">b</div>',
      ),
    ),
  );
});

test("resolveAsset を渡さなければ資産の URL は書き換わらない", async () => {
  const html = await expand("<flat-a></flat-a>", {
    a: '<link rel="stylesheet" href="./index.css"><div>a</div>',
  });
  expect(html).toBe('<link rel="stylesheet" href="./index.css"><div data-flat="a">a</div>');
});

test("<body> から集約する資産は <head> の字下げで入り、<body> 側の空白は残る", async () => {
  const result = await page(
    lines(
      "<!doctype html>",
      "<html>",
      "  <head>",
      "    <title>t</title>",
      "  </head>",
      "  <body>",
      "    <p>x</p>",
      '    <script type="module" src="/page.js"></script>',
      "    <flat-a></flat-a>",
      "  </body>",
      "</html>",
    ),
    { resolve: templates({ a: '<link rel="stylesheet" href="/a.css"><div>a</div>' }) },
  );
  expect(result.html).toBe(
    lines(
      "<!DOCTYPE html><html><head>",
      "    <title>t</title>",
      '    <script type="module" src="/page.js"></script>',
      '    <link rel="stylesheet" href="/a.css">',
      "  </head>",
      "  <body>",
      "    <p>x</p>",
      "    ",
      '    <div data-flat="a">a</div>',
      "  ",
      "</body></html>",
    ),
  );
});

test("<head> の中の重複を除くとき、空行を残さない", async () => {
  const result = await page(
    lines(
      "<!doctype html>",
      "<html>",
      "  <head>",
      '    <link rel="stylesheet" href="/a.css">',
      "    <title>t</title>",
      '    <link rel="stylesheet" href="/a.css">',
      "  </head>",
      "  <body></body>",
      "</html>",
    ),
  );
  expect(headOf(result.html)).toBe(
    lines(
      "<head>",
      "    <title>t</title>",
      '    <link rel="stylesheet" href="/a.css">',
      "  </head>",
    ),
  );
});

test("詰めて書かれた <head> への集約では空白を足さない", async () => {
  const result = await page(doc("<title>t</title>", "<p>x</p><flat-a></flat-a>"), {
    resolve: templates({ a: '<link rel="stylesheet" href="/a.css"><div>a</div>' }),
  });
  expect(result.html).toBe(
    '<!DOCTYPE html><html><head><title>t</title><link rel="stylesheet" href="/a.css"></head>' +
      '<body><p>x</p><div data-flat="a">a</div></body></html>',
  );
});

test("レイアウトの <head> の子が集約する資産だけで、それが末尾へ移っても、字下げは保たれる", async () => {
  const result = await page(
    lines(
      "<!doctype html>",
      "<html>",
      "  <head>",
      '    <link rel="layout" href="base.html" />',
      "  </head>",
      "  <body>",
      "    <flat-a></flat-a>",
      "  </body>",
      "</html>",
    ),
    {
      resolveLayout: layouts({
        "base.html": lines(
          "<!doctype html>",
          "<html>",
          "  <head>",
          '    <link rel="stylesheet" href="/site.css" />',
          "  </head>",
          "  <body><slot></slot></body>",
          "</html>",
        ),
      }),
      resolve: templates({ a: '<link rel="stylesheet" href="/a.css"><div>a</div>' }),
    },
  );
  expect(headOf(result.html)).toBe(
    lines(
      "<head>",
      '    <link rel="stylesheet" href="/site.css">',
      '    <link rel="stylesheet" href="/a.css">',
      "  </head>",
    ),
  );
});

test("1 行で書いた <head> への集約では改行を足さない", async () => {
  const result = await page(
    "<!doctype html><html><head> <title>t</title></head><body><flat-a></flat-a></body></html>",
    { resolve: templates({ a: '<link rel="stylesheet" href="/a.css"><div>a</div>' }) },
  );
  expect(headOf(result.html)).toBe(
    '<head> <title>t</title><link rel="stylesheet" href="/a.css"></head>',
  );
});

test("<head> がコメントで始まっても、集約した資産は <head> の字下げで入る", async () => {
  const result = await page(
    lines(
      "<!doctype html>",
      "<html>",
      "  <head>",
      '    <!-- c --><meta charset="utf-8">',
      "    <title>t</title>",
      "  </head>",
      "  <body>",
      "    <flat-a></flat-a>",
      "  </body>",
      "</html>",
    ),
    { resolve: templates({ a: '<link rel="stylesheet" href="/a.css"><div>a</div>' }) },
  );
  expect(headOf(result.html)).toBe(
    lines(
      "<head>",
      '    <!-- c --><meta charset="utf-8">',
      "    <title>t</title>",
      '    <link rel="stylesheet" href="/a.css">',
      "  </head>",
    ),
  );
});

test("<head> の素の <template> の中の資産は集約しない", async () => {
  const html = doc(
    '<title>t</title><template><link rel="stylesheet" href="/t.css"></template>',
    "<p>x</p>",
  );
  const result = await page(html);
  expect(squash(result.html)).toBe(squash(html));
});

test("<template shadowrootmode> の中の資産は集約せず、影の木に残す", async () => {
  const html = doc(
    "<title>t</title>",
    '<x-card><template shadowrootmode="open"><link rel="stylesheet" href="/card.css"><p>c</p></template></x-card>',
  );
  const result = await page(html);
  expect(squash(result.html)).toBe(squash(html));
});

test("テンプレートの素の <template> の中の資産は URL を解決しない。<template if> の中は解決する", async () => {
  const { calls, resolveAsset } = assetResolver();
  const result = await page(doc("<title>t</title>", '<flat-a on="yes"></flat-a>'), {
    resolve: templates({
      a:
        '<div><template><link rel="stylesheet" href="./inert.css"></template>' +
        '<template if="on"><link rel="stylesheet" href="./on.css"></template></div>',
    }),
    resolveAsset,
  });
  expect(calls).toEqual([{ specifier: "./on.css", fromPath: "templates/a.html" }]);
  expect(squash(result.html)).toBe(
    squash(
      doc(
        '<title>t</title><link rel="stylesheet" href="/fs/templates/on.css">',
        '<div data-flat="a"><template><link rel="stylesheet" href="./inert.css"></template></div>',
      ),
    ),
  );
});

/** どの指定子も解決できない `resolveAsset`。 */
const unresolvable = (): Promise<string | null> => Promise.resolve(null);

test("テンプレートのファイルの指定子が解決できなければ、テンプレートのパスと行を添えて例外になる", async () => {
  const result = page(doc("<title>t</title>", "<flat-a></flat-a>"), {
    resolve: templates({
      a: lines("<div>a</div>", '<link rel="stylesheet" href="./indx.css">'),
    }),
    resolveAsset: unresolvable,
  });
  await expect(result).rejects.toBeInstanceOf(TemplateError);
  await expect(result).rejects.toThrow("templates/a.html:2: 資産 ./indx.css が見つからない");
});

test("レイアウトのファイルの指定子が解決できなければ、レイアウトのパスと行を添えて例外になる", async () => {
  const result = page(
    '<!doctype html><html><head><link rel="layout" href="base.html"></head><body></body></html>',
    {
      resolveLayout: layouts({
        "base.html": lines(
          "<!doctype html>",
          "<html>",
          "<head>",
          '<link rel="stylesheet" href="@scope/missing/index.css">',
          "</head>",
          "<body><slot></slot></body>",
          "</html>",
        ),
      }),
      resolveAsset: unresolvable,
    },
  );
  await expect(result).rejects.toBeInstanceOf(TemplateError);
  await expect(result).rejects.toThrow(
    "layouts/base.html:4: 資産 @scope/missing/index.css が見つからない",
  );
});

test("/ で始まる URL とスキーム付きの URL は解決を問わないので、解決できなくても例外にならない", async () => {
  const result = await page(doc("<title>t</title>", "<flat-a></flat-a>"), {
    resolve: templates({
      a:
        '<link rel="stylesheet" href="/root.css">' +
        '<link rel="stylesheet" href="https://example.com/x.css"><div>a</div>',
    }),
    resolveAsset: unresolvable,
  });
  expect(squash(result.html)).toBe(
    squash(
      doc(
        '<title>t</title><link rel="stylesheet" href="/root.css">' +
          '<link rel="stylesheet" href="https://example.com/x.css">',
        '<div data-flat="a">a</div>',
      ),
    ),
  );
});

test("資産の指定子に文字参照で書いた波括弧は、{ と } として解決に渡る", async () => {
  const { calls, resolveAsset } = assetResolver();
  const result = await page(doc("<title>t</title>", "<flat-a></flat-a>"), {
    resolve: templates({ a: '<link rel="stylesheet" href="./&#123;a&#125;.css"><div>a</div>' }),
    resolveAsset,
  });
  expect(calls).toEqual([{ specifier: "./{a}.css", fromPath: "templates/a.html" }]);
  expect(result.html).toContain('<link rel="stylesheet" href="/fs/templates/{a}.css">');
});
