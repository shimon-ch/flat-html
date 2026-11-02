import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  build,
  createLogger,
  resolveConfig,
  type IndexHtmlTransformContext,
  type MinimalPluginContextWithoutEnvironment,
  type Plugin,
} from "vite";
import { afterEach, expect, test } from "vite-plus/test";
import { flatHtml, TemplateError } from "../src/index.ts";

/** `tempDir` で作ったディレクトリ。各テストの後に消す。 */
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** 一時ディレクトリを作り、実パスを返す。テストの後に消す。 */
async function tempDir(): Promise<string> {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "flat-html-")));
  tempDirs.push(dir);
  return dir;
}

/** `transformIndexHtml` の hook を `{ order, handler }` の形で取り出す。 */
function hookOf(plugin: Plugin) {
  const hook = plugin.transformIndexHtml;
  if (!hook || typeof hook === "function") throw new Error("handler 形式で登録されていない");
  return hook;
}

/** handler の `this` に渡す最小のプラグイン文脈。 */
const pluginContext: MinimalPluginContextWithoutEnvironment = {
  meta: { rollupVersion: "", rolldownVersion: "", viteVersion: "", watchMode: false },
  debug() {},
  info() {},
  warn() {},
  error(e) {
    throw typeof e === "string" ? new Error(e) : e;
  },
};

async function fixture(): Promise<string> {
  const root = await tempDir();
  await mkdir(path.join(root, "site/components/badge"), { recursive: true });
  await mkdir(path.join(root, "site/components/boxed"), { recursive: true });
  await mkdir(path.join(root, "lib"), { recursive: true });
  await writeFile(path.join(root, "site/components/badge/index.html"), "<span>site</span>");
  await writeFile(
    path.join(root, "site/components/boxed/index.html"),
    '<link rel="stylesheet" href="./index.css"><link rel="stylesheet" href="/site.css"><div>boxed</div>',
  );
  await writeFile(path.join(root, "site/components/boxed/index.css"), "div { color: red }");
  await writeFile(path.join(root, "lib/badge.html"), "<span>lib</span>");
  await writeFile(path.join(root, "lib/card.html"), "<article><slot></slot></article>");
  await writeFile(
    path.join(root, "site/base.html"),
    "<!doctype html><html><head></head><body><slot></slot></body></html>",
  );
  return root;
}

test("transformIndexHtml は order: pre で、探索先の順にテンプレートを解決して変換し、解決一覧を出す", async () => {
  const root = await fixture();
  const logs: string[] = [];
  const logger = createLogger("silent");
  const plugin = flatHtml({ roots: ["site/components", "lib"], data: { title: "T" } });
  await resolveConfig(
    {
      root,
      configFile: false,
      plugins: [plugin],
      customLogger: { ...logger, info: (msg) => void logs.push(msg) },
    },
    "build",
  );

  const hook = hookOf(plugin);
  expect(hook.order).toBe("pre");

  const ctx: IndexHtmlTransformContext = {
    path: "/index.html",
    filename: path.join(root, "site/index.html"),
  };
  const html =
    '<!doctype html><html><head><link rel="layout" href="base.html"><title>{{ title }}</title></head>' +
    "<body><flat-card><flat-badge></flat-badge></flat-card></body></html>";
  const result = await hook.handler.call(pluginContext, html, ctx);

  expect(result).toBe(
    "<!DOCTYPE html><html><head><title>T</title></head>" +
      '<body><article data-flat="card"><span data-flat="badge">site</span></article></body></html>',
  );
  const joined = logs.join("\n");
  expect(joined).toContain("layout base.html → site/base.html");
  expect(joined).toContain("flat-card → lib/card.html");
  expect(joined).toContain("flat-badge → site/components/badge/index.html");
});

/** `transformPage` に渡す、変換の設定と入力。 */
interface PageRun {
  /** Vite の root */
  root: string;
  /** ページのファイルの絶対パス */
  page: string;
  /** プラグインの探索先 */
  roots: string[];
  command: "build" | "serve";
  /** ページの HTML */
  html: string;
  /** Vite の `resolve.alias` */
  alias?: Record<string, string>;
}

/** `run` の設定でプラグインの `transformIndexHtml` を呼び、変換した HTML を返す。 */
async function transformPage(run: PageRun): Promise<string> {
  const plugin = flatHtml({ roots: run.roots });
  await resolveConfig(
    {
      root: run.root,
      configFile: false,
      plugins: [plugin],
      customLogger: createLogger("silent"),
      resolve: { alias: run.alias ?? {} },
    },
    run.command,
  );

  const ctx: IndexHtmlTransformContext = {
    path: `/${path.relative(run.root, run.page).replaceAll(path.sep, "/")}`,
    filename: run.page,
  };
  const result = await hookOf(plugin).handler.call(pluginContext, run.html, ctx);
  if (typeof result !== "string") throw new Error("変換の結果が文字列でない");
  return result;
}

/**
 * `fixture()` に `<flat-boxed>` を置いたページを、`command` の設定で変換する。`head` はページの `<head>` の中身。
 * `page` はページのファイルの、root からの相対パス。空文字なら root のディレクトリそのものを渡す
 * （開発サーバーの `server.transformIndexHtml('/', html)` が渡す `ctx.filename` と同じ）。
 */
async function transformBoxed(
  command: "build" | "serve",
  head = "<title>t</title>",
  page = "site/index.html",
): Promise<string> {
  const root = await fixture();
  return transformPage({
    root,
    page: path.join(root, page),
    roots: ["site/components", "lib"],
    command,
    html: `<!doctype html><html><head>${head}</head><body><flat-boxed></flat-boxed></body></html>`,
  });
}

/** `transformBoxed` の既定のページの出力。`<flat-boxed>` の資産は root からの `/` で始まる URL になる。 */
const boxedOutput =
  '<!DOCTYPE html><html><head><title>t</title><link rel="stylesheet" href="/site/components/boxed/index.css">' +
  '<link rel="stylesheet" href="/site.css"></head>' +
  '<body><div data-flat="boxed">boxed</div></body></html>';

test("root の中にあるテンプレートの隣の資産は、開発サーバーでもビルドでも root からの同じ / で始まる URL になり、/ で始まる URL は触られない", async () => {
  expect(await transformBoxed("serve")).toBe(boxedOutput);
  expect(await transformBoxed("build")).toBe(boxedOutput);
});

test("ページが / で始まる URL で直接書いた資産と、テンプレートが指す同じ資産は、開発サーバーでもビルドでも 1 つにまとまる", async () => {
  const head = '<title>t</title><link rel="stylesheet" href="/site/components/boxed/index.css">';
  expect(await transformBoxed("serve", head)).toBe(boxedOutput);
  expect(await transformBoxed("build", head)).toBe(boxedOutput);
});

test("開発サーバーで ctx.filename が root のディレクトリでも（transformIndexHtml('/', html)）、root の中の資産は root からの URL になる", async () => {
  expect(await transformBoxed("serve", "<title>t</title>", "")).toBe(boxedOutput);
});

test("ctx.filename がディレクトリなら、ページをその中の index.html とみなし、ページからの相対パスのレイアウトを解決する", async () => {
  const root = await fixture();
  await mkdir(path.join(root, "layouts"), { recursive: true });
  await writeFile(
    path.join(root, "layouts/base.html"),
    "<!doctype html><html><head><title>Base</title></head><body><main><slot></slot></main></body></html>",
  );
  const result = await transformPage({
    root,
    page: root,
    roots: ["site/components"],
    command: "serve",
    html: '<!doctype html><html><head><link rel="layout" href="./layouts/base.html"></head><body><p>x</p></body></html>',
  });
  expect(result).toBe(
    "<!DOCTYPE html><html><head><title>Base</title></head><body><main><p>x</p></main></body></html>",
  );
});

test("テンプレートの資産の指定子が解決できなければ、テンプレートのパスと行を添えて TemplateError になる", async () => {
  const root = await fixture();
  const typo = path.join(root, "site/components/typo/index.html");
  const missing = path.join(root, "site/components/missing/index.html");
  await mkdir(path.dirname(typo), { recursive: true });
  await mkdir(path.dirname(missing), { recursive: true });
  await writeFile(typo, '<div>typo</div>\n<link rel="stylesheet" href="./indx.css">');
  await writeFile(path.join(path.dirname(typo), "index.css"), "div { color: red }");
  await writeFile(
    missing,
    '<div>missing</div>\n<div></div>\n<link rel="stylesheet" href="@flat-html-test/missing/index.css">',
  );
  const plugin = flatHtml({ roots: ["site/components"] });
  await resolveConfig(
    { root, configFile: false, plugins: [plugin], customLogger: createLogger("silent") },
    "build",
  );

  const ctx: IndexHtmlTransformContext = {
    path: "/index.html",
    filename: path.join(root, "site/index.html"),
  };
  const run = (name: string): ReturnType<ReturnType<typeof hookOf>["handler"]> =>
    hookOf(plugin).handler.call(
      pluginContext,
      `<!doctype html><html><head></head><body><flat-${name}></flat-${name}></body></html>`,
      ctx,
    );
  await expect(run("typo")).rejects.toBeInstanceOf(TemplateError);
  await expect(run("typo")).rejects.toThrow(`${typo}:2: 資産 ./indx.css が見つからない`);
  await expect(run("missing")).rejects.toBeInstanceOf(TemplateError);
  await expect(run("missing")).rejects.toThrow(
    `${missing}:3: 資産 @flat-html-test/missing/index.css が見つからない`,
  );
});

test("root の外にあるテンプレートの隣の資産は、開発サーバーでは /@fs/ の URL に、ビルドではページからの相対 URL になる", async () => {
  const dir = await tempDir();
  await mkdir(path.join(dir, "lib/outer"), { recursive: true });
  await writeFile(
    path.join(dir, "lib/outer/index.html"),
    '<link rel="stylesheet" href="./outer.css"><div>outer</div>',
  );
  await writeFile(path.join(dir, "lib/outer/outer.css"), "div { color: red }");
  const run = (command: "build" | "serve"): Promise<string> =>
    transformPage({
      root: path.join(dir, "site"),
      page: path.join(dir, "site/index.html"),
      roots: ["../lib"],
      command,
      html: "<!doctype html><html><head></head><body><flat-outer></flat-outer></body></html>",
    });
  const body = '<body><div data-flat="outer">outer</div></body></html>';
  expect(await run("serve")).toBe(
    '<!DOCTYPE html><html><head><link rel="stylesheet" ' +
      `href="/@fs${path.join(dir, "lib/outer/outer.css")}"></head>${body}`,
  );
  expect(await run("build")).toBe(
    `<!DOCTYPE html><html><head><link rel="stylesheet" href="../lib/outer/outer.css"></head>${body}`,
  );
});

/**
 * `fixture()` に、`exports` が `import` 条件だけを持つパッケージ `esm-only` と、テンプレート `name` を足す。
 * テンプレートの中身は `template`。テンプレートの隣に `a.css` と `font.woff2` を、`lib/` に `theme.css` を置く。
 */
async function fixtureWith(name: string, template: string): Promise<string> {
  const root = await fixture();
  const pkg = path.join(root, "node_modules/esm-only");
  await mkdir(path.join(pkg, "dist"), { recursive: true });
  await writeFile(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "esm-only",
      type: "module",
      exports: { "./style.css": { import: "./dist/style.css" } },
    }),
  );
  await writeFile(path.join(pkg, "dist/style.css"), "p { color: red }");
  const dir = path.join(root, "site/components", name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), template);
  await writeFile(path.join(dir, "a.css"), "a { color: red }");
  await writeFile(path.join(dir, "font.woff2"), "font");
  await writeFile(path.join(root, "lib/theme.css"), "body { color: red }");
  return root;
}

/** `fixtureWith` の root で、`site/index.html` の `<body>` に `<flat-<name>>` を置いて、ビルドの設定で変換する。 */
function transformIn(root: string, name: string, alias?: Record<string, string>): Promise<string> {
  return transformPage({
    root,
    page: path.join(root, "site/index.html"),
    roots: ["site/components"],
    command: "build",
    html: `<!doctype html><html><head></head><body><flat-${name}></flat-${name}></body></html>`,
    alias,
  });
}

test("パッケージ名の指定子は Vite の解決器で解決され、exports に import 条件しかないパッケージも解決される", async () => {
  const root = await fixtureWith(
    "esm",
    '<link rel="stylesheet" href="esm-only/style.css"><div>esm</div>',
  );
  expect(await transformIn(root, "esm")).toBe(
    '<!DOCTYPE html><html><head><link rel="stylesheet" href="/node_modules/esm-only/dist/style.css"></head>' +
      '<body><div data-flat="esm">esm</div></body></html>',
  );
});

test("指定子の ? と # から後ろは外して実在するファイルを確かめ、URL に付け直す", async () => {
  const root = await fixtureWith(
    "query",
    '<link rel="stylesheet" href="./a.css?inline">' +
      '<link rel="preload" href="./font.woff2?v=1" as="font">' +
      '<link rel="stylesheet" href="esm-only/style.css#x"><div>q</div>',
  );
  expect(await transformIn(root, "query")).toBe(
    '<!DOCTYPE html><html><head><link rel="stylesheet" href="/site/components/query/a.css?inline">' +
      '<link rel="preload" href="/site/components/query/font.woff2?v=1" as="font">' +
      '<link rel="stylesheet" href="/node_modules/esm-only/dist/style.css#x"></head>' +
      '<body><div data-flat="query">q</div></body></html>',
  );
});

test("# で始まる指定子は package.json の imports（Node のサブパス import）で解決され、先頭の # で切らない", async () => {
  const root = await fixtureWith(
    "subpath",
    '<link rel="stylesheet" href="#styles/theme.css"><link rel="preload" href="#styles/theme.css?v=1" as="style">' +
      "<div>subpath</div>",
  );
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "app", type: "module", imports: { "#styles/*": "./src/styles/*" } }),
  );
  await mkdir(path.join(root, "src/styles"), { recursive: true });
  await writeFile(path.join(root, "src/styles/theme.css"), "p { color: red }");
  expect(await transformIn(root, "subpath")).toBe(
    '<!DOCTYPE html><html><head><link rel="stylesheet" href="/src/styles/theme.css">' +
      '<link rel="preload" href="/src/styles/theme.css?v=1" as="style"></head>' +
      '<body><div data-flat="subpath">subpath</div></body></html>',
  );
});

test("文字参照で書いた波括弧を含む資産の URL は、解決した後も式として評価されず、文字参照のまま出る", async () => {
  const root = await fixtureWith(
    "braces",
    '<link rel="stylesheet" href="./&#123;&#123;x&#125;&#125;.css"><div>braces</div>',
  );
  await writeFile(path.join(root, "site/components/braces/{{x}}.css"), "p { color: red }");
  expect(await transformIn(root, "braces")).toBe(
    '<!DOCTYPE html><html><head><link rel="stylesheet" href="/site/components/braces/&#123;&#123;x&#125;&#125;.css"></head>' +
      '<body><div data-flat="braces">braces</div></body></html>',
  );
});

test("Vite の解決器が解決できない理由を投げたら、その理由を添えて TemplateError になる", async () => {
  const root = await fixtureWith(
    "unexported",
    '<div>unexported</div>\n<link rel="stylesheet" href="esm-only/dist/style.css">',
  );
  const template = path.join(root, "site/components/unexported/index.html");
  const result = transformIn(root, "unexported");
  await expect(result).rejects.toBeInstanceOf(TemplateError);
  await expect(result).rejects.toThrow(
    `${template}:2: 資産 esm-only/dist/style.css を解決できない: "./dist/style.css" is not exported`,
  );
});

test("Vite の別名（resolve.alias）の指定子は、別名の先の実在するファイルに解決される", async () => {
  const root = await fixtureWith(
    "aliased",
    '<link rel="stylesheet" href="@lib/theme.css"><div>aliased</div>',
  );
  const alias = { "@lib": path.join(root, "lib") };
  expect(await transformIn(root, "aliased", alias)).toBe(
    '<!DOCTYPE html><html><head><link rel="stylesheet" href="/lib/theme.css"></head>' +
      '<body><div data-flat="aliased">aliased</div></body></html>',
  );

  const missing = path.join(root, "site/components/missing-alias/index.html");
  await mkdir(path.dirname(missing), { recursive: true });
  await writeFile(missing, '<link rel="stylesheet" href="@lib/missing.css"><div>m</div>');
  await expect(transformIn(root, "missing-alias", alias)).rejects.toThrow(
    `${missing}:1: 資産 @lib/missing.css が見つからない`,
  );
});

/**
 * 集約する資産 5 種を持つコンポーネントを `dir` に書く。import に変わる `<link rel="stylesheet">` と
 * `<script type="module">`、変わらない `media` 付きの `<link rel="stylesheet">` と
 * `<link rel="preload">` と `<link rel="modulepreload">`。各ファイルの中身には `name` で始まる目印を入れる。
 */
async function writeAssetComponent(dir: string, name: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "index.html"),
    [
      '<link rel="stylesheet" href="./style.css">',
      '<link rel="stylesheet" href="./print.css" media="print">',
      '<link rel="preload" href="./font.woff2" as="font" type="font/woff2" crossorigin>',
      '<link rel="modulepreload" href="./preload.js">',
      '<script type="module" src="./main.js"></script>',
      `<div>${name}</div>`,
    ].join("\n"),
  );
  await writeFile(path.join(dir, "style.css"), `.${name}-style { color: red }`);
  await writeFile(path.join(dir, "print.css"), `.${name}-print { color: black }`);
  await writeFile(path.join(dir, "font.woff2"), `${name}-font`);
  await writeFile(path.join(dir, "preload.js"), `export const preload = "${name}-preload";`);
  await writeFile(path.join(dir, "main.js"), `console.log("${name}-main");`);
}

/** ビルドの出力を、ファイル名 → 中身の表にする。 */
function outputFiles(result: Awaited<ReturnType<typeof build>>): Map<string, string> {
  const files = new Map<string, string>();
  for (const output of Array.isArray(result) ? result : [result]) {
    if (!("output" in output)) throw new Error("ビルドの結果が出力でない");
    for (const item of output.output) {
      const content =
        item.type === "chunk"
          ? item.code
          : typeof item.source === "string"
            ? item.source
            : new TextDecoder().decode(item.source);
      files.set(item.fileName, content);
    }
  }
  return files;
}

/** HTML 以外の出力のうち、中身に `marker` を含むただ 1 つのファイルの名前。 */
function fileContaining(files: Map<string, string>, marker: string): string {
  const [found, ...rest] = [...files]
    .filter(([name, content]) => !name.endsWith(".html") && content.includes(marker))
    .map(([name]) => name);
  if (found === undefined || rest.length > 0) {
    throw new Error(`${marker} を含む出力が 1 つでない: ${[found, ...rest].join(", ")}`);
  }
  return found;
}

test("ビルドでは、root の中と外のテンプレートの資産 5 種が、どれもハッシュ付きの資産として出力の HTML から指される", async () => {
  const dir = await tempDir();
  const root = path.join(dir, "site");
  await writeAssetComponent(path.join(root, "components/inner"), "inner");
  await writeAssetComponent(path.join(dir, "lib/outer"), "outer");
  await writeFile(
    path.join(root, "index.html"),
    "<!doctype html><html><head><title>t</title></head>" +
      "<body><flat-inner></flat-inner><flat-outer></flat-outer></body></html>",
  );

  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [flatHtml({ roots: ["components", "../lib"] })],
    // 小さい media 付きの stylesheet は data: URL に埋め込まれるので、ファイルとして出させる
    build: { write: false, assetsInlineLimit: 0 },
  });

  const files = outputFiles(result);
  const html = files.get("index.html") ?? "";
  expect(html).toContain("<title>t</title>");
  expect(html).not.toContain("/@fs/");
  expect(html).not.toContain(dir);
  for (const name of ["inner", "outer"]) {
    for (const marker of ["style", "print", "font", "preload", "main"]) {
      expect(html).toContain(`"/${fileContaining(files, `${name}-${marker}`)}"`);
    }
  }
});
