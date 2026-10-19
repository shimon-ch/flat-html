import { expect, test } from "vite-plus/test";
import { expand, page, squash, templates } from "./helpers.ts";

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
