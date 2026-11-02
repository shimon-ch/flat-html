import { beforeEach, describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { assetBytes, expand, layoutShiftOf, render, squash } from "../../tests/browser.ts";

const usage = `
<button type="button" popovertarget="tip">ヒント</button>
<flat-popover id="tip">
  <p>補足の内容</p>
</flat-popover>`;

const usageWithCommand = `
<button type="button" commandfor="tip" command="toggle-popover">ヒント</button>
<flat-popover id="tip">
  <p>補足の内容</p>
</flat-popover>`;

/**
 * 外側の押下に使うボタン。開くボタンのすぐ下に来て、UA 既定で画面の中央に出る popover とは重ならない。
 * popover と重なる位置へ動かすと、押下が外側の押下にならない。
 */
const outside = '<p><button type="button">別の操作</button></p>';

/** popover を DOM 上で開くボタンから離し、間にリンクを挟む。フォーカス順の調整を見るため */
const menu = `
<button type="button" popovertarget="menu">開く</button>
<p><a href="#after">後ろのリンク</a></p>
<flat-popover id="menu">
  <p><a href="#inside">中のリンク</a></p>
  <p><button type="button">中のボタン</button></p>
</flat-popover>`;

const hint = `
<button type="button" popovertarget="menu">メニュー</button>
<flat-popover id="menu"><p>メニューの内容</p></flat-popover>
<button type="button" popovertarget="tip">ヒント</button>
<flat-popover id="tip" popover="hint"><p>補足の内容</p></flat-popover>`;

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`id=${id} の要素がない`);
  return element;
}

function byText(selector: string, text: string): HTMLElement {
  const element = [...document.querySelectorAll<HTMLElement>(selector)].find(
    (e) => e.textContent === text,
  );
  if (!element) throw new Error(`「${text}」の ${selector} がない`);
  return element;
}

function isOpen(popover: HTMLElement): boolean {
  return popover.matches(":popover-open");
}

beforeEach(() => {
  render("");
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
});

describe("構造", () => {
  test("出力の根は <div popover data-flat=popover> で、参照名 flat-popover は残らない", async () => {
    const html = await expand(usage);
    expect(squash(html)).toBe(
      '<button type="button" popovertarget="tip">ヒント</button>' +
        '<div popover="" id="tip" data-flat="popover"><p>補足の内容</p></div>',
    );
    render(html);
    expect(document.querySelector("flat-popover")).toBeNull();
    expect(byId("tip").dataset["flat"]).toBe("popover");
  });

  test("id はテンプレートが使わないので <div> へ透過し、開くボタンの popovertarget と結び付く", async () => {
    render(await expand(usage));
    const popover = byId("tip");
    expect(popover.tagName).toBe("DIV");
    expect(popover.popover).toBe("auto");
    const button = byText("button", "ヒント");
    if (!(button instanceof HTMLButtonElement)) throw new Error("ボタンが <button> でない");
    expect(button.popoverTargetElement).toBe(popover);
  });

  test("参照タグの popover=manual はテンプレートの popover の値を置き換える", async () => {
    const html = await expand(
      '<flat-popover id="note" popover="manual"><p>補足の内容</p></flat-popover>',
    );
    expect(squash(html)).toBe(
      '<div popover="manual" id="note" data-flat="popover"><p>補足の内容</p></div>',
    );
    render(html);
    expect(byId("note").popover).toBe("manual");
  });
});

describe("JS なしで到達できる状態（ADR-0004 / ADR-0009）", () => {
  test("popovertarget のボタンを押すと開き、もう一度押すと閉じる", async () => {
    render(await expand(usage));
    const popover = byId("tip");
    expect(isOpen(popover)).toBe(false);
    await userEvent.click(byText("button", "ヒント"));
    expect(isOpen(popover)).toBe(true);
    await userEvent.click(byText("button", "ヒント"));
    expect(isOpen(popover)).toBe(false);
  });

  test("開いているときに外側を押すと閉じ、押した先の操作も妨げられない", async () => {
    render((await expand(usage)) + outside);
    const popover = byId("tip");
    const other = byText("button", "別の操作");
    let clicks = 0;
    other.addEventListener("click", () => {
      clicks += 1;
    });
    await userEvent.click(byText("button", "ヒント"));
    expect(isOpen(popover)).toBe(true);
    await userEvent.click(other);
    expect(isOpen(popover)).toBe(false);
    expect(clicks).toBe(1);
  });

  test("開いているときに Esc を押すと閉じる", async () => {
    render(await expand(usage));
    const popover = byId("tip");
    await userEvent.click(byText("button", "ヒント"));
    expect(isOpen(popover)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(isOpen(popover)).toBe(false);
  });

  test("commandfor と command=toggle-popover のボタンでも開閉できる", async () => {
    render(await expand(usageWithCommand));
    const popover = byId("tip");
    await userEvent.click(byText("button", "ヒント"));
    expect(isOpen(popover)).toBe(true);
    await userEvent.click(byText("button", "ヒント"));
    expect(isOpen(popover)).toBe(false);
  });
});

describe("APG（Disclosure のキーボード操作と、閉じたときのフォーカス）", () => {
  test("Tab で開くボタンにフォーカスが移り、Enter と Space で開閉する", async () => {
    render(await expand(usage));
    const popover = byId("tip");
    await userEvent.tab();
    expect(document.activeElement).toBe(byText("button", "ヒント"));
    await userEvent.keyboard("{Enter}");
    expect(isOpen(popover)).toBe(true);
    await userEvent.keyboard("[Space]");
    expect(isOpen(popover)).toBe(false);
  });

  test("開いたあとの Tab は開いたボタンの次に popover の中へ移り、中を抜けるとボタンの DOM 上の次へ移る", async () => {
    render(await expand(menu));
    const popover = byId("menu");
    await userEvent.tab();
    expect(document.activeElement).toBe(byText("button", "開く"));
    await userEvent.keyboard("{Enter}");
    expect(isOpen(popover)).toBe(true);
    await userEvent.tab();
    expect(document.activeElement).toBe(byText("a", "中のリンク"));
    await userEvent.tab();
    expect(document.activeElement).toBe(byText("button", "中のボタン"));
    await userEvent.tab();
    expect(document.activeElement).toBe(byText("a", "後ろのリンク"));
    expect(isOpen(popover)).toBe(true);
  });

  test("中にフォーカスがある状態で Esc を押すと閉じ、開いたボタンへフォーカスが戻る", async () => {
    render(await expand(menu));
    const popover = byId("menu");
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await userEvent.tab();
    expect(document.activeElement).toBe(byText("a", "中のリンク"));
    await userEvent.keyboard("{Escape}");
    expect(isOpen(popover)).toBe(false);
    expect(document.activeElement).toBe(byText("button", "開く"));
  });
});

/** hint に対応したブラウザ（Chromium 151 以降、Firefox 153 以降）でだけ通る。テストのブラウザは Playwright の Chromium */
describe("対応ブラウザでの振る舞い（popover=hint）", () => {
  test("hint を開いても、開いている auto の popover は閉じない", async () => {
    render(await expand(hint));
    await userEvent.click(byText("button", "メニュー"));
    expect(isOpen(byId("menu"))).toBe(true);
    // ヒントのボタンを押下で開くと、その押下が menu の外側の押下として menu を閉じるので、キーボードで開く
    byText("button", "ヒント").focus();
    await userEvent.keyboard("{Enter}");
    expect(isOpen(byId("tip"))).toBe(true);
    expect(isOpen(byId("menu"))).toBe(true);
  });

  test("hint は外側を押すと閉じ、Esc でも閉じる", async () => {
    render((await expand(hint)) + outside);
    const tip = byId("tip");
    await userEvent.click(byText("button", "ヒント"));
    expect(isOpen(tip)).toBe(true);
    await userEvent.click(byText("button", "別の操作"));
    expect(isOpen(tip)).toBe(false);
    await userEvent.click(byText("button", "ヒント"));
    expect(isOpen(tip)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(isOpen(tip)).toBe(false);
  });
});

describe("Web Vitals（ADR-0021）", () => {
  test("展開結果の描画で累積レイアウトシフトが 0", async () => {
    const html = await expand(usage);
    expect(await layoutShiftOf(html)).toBe(0);
  });

  test("固有の CSS と JS を持たない（base.css で足りる）", async () => {
    const bytes = await assetBytes("popover");
    expect(bytes.files).toEqual([]);
    expect(bytes.css).toBe(0);
    expect(bytes.js).toBe(0);
  });
});
