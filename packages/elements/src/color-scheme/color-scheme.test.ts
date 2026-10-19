import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { assetBytes, expand, layoutShiftOf, render, squash } from "../../tests/browser.ts";
import "./index.css";

/** 固有資産のバイト上限（ADR-0021）。実測は index.css 867 / index.js 1487 バイト */
const CSS_LIMIT = 1024;
const JS_LIMIT = 2048;

/** localStorage の鍵。index.js と同じ値を、テスト側から独立に書いて突き合わせる */
const KEY = "flat-color-scheme";

const usage = "<flat-color-scheme></flat-color-scheme>";

function radios(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>(`input[name="${KEY}"]`)];
}

function radioOf(value: string): HTMLInputElement {
  const radio = radios().find((r) => r.value === value);
  if (!radio) throw new Error(`value=${value} のラジオがない`);
  return radio;
}

/** `:root` に効いている配色。切り替えの結果はここにしか出ない */
function scheme(): string {
  return getComputedStyle(document.documentElement).colorScheme;
}

/**
 * 固有 JS を `<script type="module">` で読み込む。
 * 同じ URL のモジュールは 1 文書につき 1 回しか評価されないので、`pass` を変えて別の URL にし、
 * 次のページ読み込みと同じく先頭から評価させる。
 */
function loadDefinition(pass: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = `${new URL("./index.js", import.meta.url).href}?pass=${pass}`;
    script.addEventListener("load", () => {
      resolve();
    });
    script.addEventListener("error", () => {
      reject(new Error("固有 JS を読み込めない"));
    });
    document.head.append(script);
  });
}

beforeEach(() => {
  localStorage.removeItem(KEY);
  render("");
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
});

afterEach(() => {
  localStorage.removeItem(KEY);
});

describe("構造", () => {
  test("出力の根は <fieldset data-flat=color-scheme> で、参照名 flat-color-scheme は残らない", async () => {
    const html = await expand(usage);
    expect(squash(html)).toBe(
      '<link rel="stylesheet" href="./index.css">' +
        '<script type="module" src="./index.js"></script>' +
        '<fieldset data-flat="color-scheme"><legend>配色</legend>' +
        '<label><input type="radio" name="flat-color-scheme" value="system" checked=""> 自動 </label>' +
        '<label><input type="radio" name="flat-color-scheme" value="light"> 明 </label>' +
        '<label><input type="radio" name="flat-color-scheme" value="dark"> 暗 </label>' +
        "</fieldset>",
    );
    render(html);
    expect(document.querySelector("flat-color-scheme")).toBeNull();
    expect(document.querySelector("fieldset")?.dataset["flat"]).toBe("color-scheme");
  });

  test("資産の <link> と <script> は出力の根要素とみなされず data-flat が付かない", async () => {
    render(await expand(usage));
    expect(document.querySelector("link")?.dataset["flat"]).toBeUndefined();
    expect(document.querySelector("script")?.dataset["flat"]).toBeUndefined();
  });

  test("ラジオが 3 つあり、既定では system が選ばれている", async () => {
    render(await expand(usage));
    expect(radios().map((r) => r.value)).toEqual(["system", "light", "dark"]);
    expect(
      radios()
        .filter((r) => r.checked)
        .map((r) => r.value),
    ).toEqual(["system"]);
    expect(scheme()).toBe("light dark");
  });
});

/**
 * 固有 JS を読み込まない状態の検証（ADR-0004 / ADR-0009）。
 * `render` は innerHTML で挿入するため、展開結果に含まれる `<script>` は実行されない。
 */
describe("JS なしで到達できる状態", () => {
  test("light を選ぶと :root の color-scheme が light になる", async () => {
    render(await expand(usage));
    await userEvent.click(radioOf("light"));
    expect(scheme()).toBe("light");
  });

  test("dark を選ぶと :root の color-scheme が dark になる", async () => {
    render(await expand(usage));
    await userEvent.click(radioOf("dark"));
    expect(scheme()).toBe("dark");
  });

  test("system に戻すと :root の color-scheme が light dark に戻る", async () => {
    render(await expand(usage));
    await userEvent.click(radioOf("dark"));
    expect(scheme()).toBe("dark");
    await userEvent.click(radioOf("system"));
    expect(scheme()).toBe("light dark");
  });
});

describe("APG（Radio Group のキーボード操作）", () => {
  test("Tab でグループに入り、フォーカスは選択中のラジオに当たる", async () => {
    render(await expand(usage));
    await userEvent.tab();
    expect(document.activeElement).toBe(radioOf("system"));
  });

  test("矢印キーで選択が隣へ移り、配色もそれに従う", async () => {
    render(await expand(usage));
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect(radioOf("light").checked).toBe(true);
    expect(document.activeElement).toBe(radioOf("light"));
    expect(scheme()).toBe("light");
    await userEvent.keyboard("{ArrowDown}");
    expect(radioOf("dark").checked).toBe(true);
    expect(scheme()).toBe("dark");
    await userEvent.keyboard("{ArrowUp}");
    expect(radioOf("light").checked).toBe(true);
    expect(scheme()).toBe("light");
  });
});

describe("JS が足す強化", () => {
  test("選択が localStorage に保存される", async () => {
    render(await expand(usage));
    await loadDefinition(1);
    await userEvent.click(radioOf("dark"));
    expect(localStorage.getItem(KEY)).toBe("dark");
  });

  test("保存された選択が次の読み込みで復元される", async () => {
    localStorage.setItem(KEY, "dark");
    render(await expand(usage));
    expect(radioOf("system").checked).toBe(true);
    await loadDefinition(2);
    expect(radioOf("dark").checked).toBe(true);
    expect(scheme()).toBe("dark");
  });

  test("保存がなければテンプレートの既定（system）のまま", async () => {
    render(await expand(usage));
    await loadDefinition(3);
    expect(radioOf("system").checked).toBe(true);
    expect(scheme()).toBe("light dark");
  });
});

describe("Web Vitals（ADR-0021）", () => {
  test("描画と固有 JS の読み込みを通して累積レイアウトシフトが 0", async () => {
    localStorage.setItem(KEY, "dark");
    const html = await expand(usage);
    expect(await layoutShiftOf(html, () => loadDefinition(4))).toBe(0);
    expect(radioOf("dark").checked).toBe(true);
  });

  test("固有 CSS と JS がバイト上限に収まる", async () => {
    const bytes = await assetBytes("color-scheme");
    expect(bytes.files.map((f) => f.file)).toEqual(["index.css", "index.js"]);
    expect(bytes.css).toBeLessThanOrEqual(CSS_LIMIT);
    expect(bytes.js).toBeLessThanOrEqual(JS_LIMIT);
  });
});
