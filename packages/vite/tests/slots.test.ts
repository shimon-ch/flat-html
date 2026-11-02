import { expect, test } from "vite-plus/test";
import { expand, page, templates } from "./helpers.ts";

const card =
  '<article><header><slot name="title">untitled</slot></header><slot>empty</slot></article>';

test("名前付き slot と名前なし slot へ子要素が移り、slot 属性は消える", async () => {
  const html = await expand('<flat-card><h2 slot="title">About</h2><p>body</p></flat-card>', {
    card,
  });
  expect(html).toBe(
    '<article data-flat="card"><header><h2>About</h2></header><p>body</p></article>',
  );
});

test("差し込みがなければ既定内容が残る", async () => {
  const html = await expand("<flat-card></flat-card>", { card });
  expect(html).toBe('<article data-flat="card"><header>untitled</header>empty</article>');
});

test("名前付きの差し込みだけで、名前なしが空白のみなら既定内容を残す", async () => {
  const html = await expand('<flat-card>\n  <h2 slot="title">A</h2>\n</flat-card>', { card });
  expect(html).toBe('<article data-flat="card"><header><h2>A</h2></header>empty</article>');
});

test("差し込み先のない slot 名の要素は捨てる", async () => {
  const html = await expand('<flat-card><em slot="nope">x</em>text</flat-card>', { card });
  expect(html).toBe('<article data-flat="card"><header>untitled</header>text</article>');
});

test("差し込む子要素の中の参照は消費側の文脈で先に展開される", async () => {
  const html = await expand("<flat-card><flat-badge></flat-badge></flat-card>", {
    card,
    badge: "<span>new</span>",
  });
  expect(html).toBe(
    '<article data-flat="card"><header>untitled</header><span data-flat="badge">new</span></article>',
  );
});

test("slot 属性を持つ参照は展開後の根要素が名前付き slot に入る", async () => {
  const html = await expand('<flat-card><flat-badge slot="title"></flat-badge></flat-card>', {
    card,
    badge: "<span>new</span>",
  });
  expect(html).toBe(
    '<article data-flat="card"><header><span data-flat="badge">new</span></header>empty</article>',
  );
});

const titled = {
  card: '<article><h2><slot name="title"></slot></h2></article>',
  badge: '<link rel="stylesheet" href="/badge.css"><span>b</span>',
};

test("名前付き slot へ渡した参照の資産は、根要素と同じ slot に入る。資産は slot 以外の引数を受け取らない", async () => {
  const html = await expand(
    '<flat-card><flat-badge slot="title" id="b"></flat-badge></flat-card>',
    titled,
  );
  expect(html).toBe(
    '<article data-flat="card"><h2><link rel="stylesheet" href="/badge.css">' +
      '<span id="b" data-flat="badge">b</span></h2></article>',
  );
});

test("名前付き slot へ渡した参照の資産は、ページでは <head> へ集約される", async () => {
  const result = await page(
    "<!doctype html><html><head><title>t</title></head>" +
      '<body><flat-card><flat-badge slot="title"></flat-badge></flat-card></body></html>',
    { resolve: templates(titled) },
  );
  expect(result.html).toBe(
    '<!DOCTYPE html><html><head><title>t</title><link rel="stylesheet" href="/badge.css"></head>' +
      '<body><article data-flat="card"><h2><span data-flat="badge">b</span></h2></article></body></html>',
  );
});

test("テンプレートの素の <template> の中の <slot> には差し込まない", async () => {
  const html = await expand("<flat-x><p>c</p></flat-x>", {
    x: '<x-card><template shadowrootmode="open"><slot></slot></template><slot></slot></x-card>',
  });
  expect(html).toBe(
    '<x-card data-flat="x"><template shadowrootmode="open"><slot></slot></template><p>c</p></x-card>',
  );
});
