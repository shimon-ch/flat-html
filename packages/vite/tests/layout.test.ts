import { expect, test } from "vite-plus/test";
import { TemplateError } from "../src/index.ts";
import { layouts, page, squash, templates } from "./helpers.ts";

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
