import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createLogger,
  resolveConfig,
  type IndexHtmlTransformContext,
  type MinimalPluginContextWithoutEnvironment,
  type Plugin,
} from "vite";
import { expect, test } from "vite-plus/test";
import { flatHtml } from "../src/index.ts";

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
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "flat-html-")));
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

test("テンプレートの隣にある資産は /@fs/ の URL へ書き換わり、/ で始まる URL は触られない", async () => {
  const root = await fixture();
  const plugin = flatHtml({ roots: ["site/components", "lib"] });
  await resolveConfig(
    { root, configFile: false, plugins: [plugin], customLogger: createLogger("silent") },
    "build",
  );

  const ctx: IndexHtmlTransformContext = {
    path: "/index.html",
    filename: path.join(root, "site/index.html"),
  };
  const html =
    "<!doctype html><html><head><title>t</title></head><body><flat-boxed></flat-boxed></body></html>";
  const result = await hookOf(plugin).handler.call(pluginContext, html, ctx);

  const css = path.join(root, "site/components/boxed/index.css");
  expect(result).toBe(
    `<!DOCTYPE html><html><head><title>t</title><link rel="stylesheet" href="/@fs${css}">` +
      '<link rel="stylesheet" href="/site.css"></head>' +
      '<body><div data-flat="boxed">boxed</div></body></html>',
  );
});
