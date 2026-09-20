import { expect, test } from "vite-plus/test";
import { assetResolver, expand, layouts, page, squash, templates } from "./helpers.ts";

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
