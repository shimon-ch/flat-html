import { beforeEach, describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { assetBytes, expand, layoutShiftOf, render, squash } from "../../tests/browser.ts";

const faq = `
<flat-accordion name="faq" open>
  <h3 slot="summary">質問 1</h3>
  <p>答え 1</p>
</flat-accordion>
<flat-accordion name="faq">
  <h3 slot="summary">質問 2</h3>
  <p>答え 2</p>
</flat-accordion>`;

function items(): HTMLDetailsElement[] {
  return [...document.querySelectorAll("details")];
}

function summaryOf(details: HTMLDetailsElement): HTMLElement {
  const summary = details.querySelector("summary");
  if (!summary) throw new Error("summary がない");
  return summary;
}

beforeEach(() => {
  render("");
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
});

describe("構造", () => {
  test("出力の根は <details data-flat=accordion> で、参照名 flat-accordion は残らない", async () => {
    const html = await expand(faq);
    expect(squash(html)).toBe(
      '<details name="faq" open="" data-flat="accordion"><summary><h3>質問 1</h3></summary><p>答え 1</p></details>' +
        '<details name="faq" data-flat="accordion"><summary><h3>質問 2</h3></summary><p>答え 2</p></details>',
    );
    render(html);
    expect(document.querySelector("flat-accordion")).toBeNull();
    expect(items().map((d) => d.dataset["flat"])).toEqual(["accordion", "accordion"]);
  });

  test("name と open はテンプレートが使わないので <details> へ透過する", async () => {
    render(await expand(faq));
    const [first, second] = items();
    expect(first?.getAttribute("name")).toBe("faq");
    expect(second?.getAttribute("name")).toBe("faq");
    expect(first?.open).toBe(true);
    expect(second?.open).toBe(false);
  });

  test("slot=summary の見出しは <summary> の中へ移り、slot 属性は消える", async () => {
    render(await expand(faq));
    expect(document.querySelector("[slot]")).toBeNull();
    const headings = items().map((d) => summaryOf(d).querySelector("h3")?.textContent);
    expect(headings).toEqual(["質問 1", "質問 2"]);
  });
});

describe("JS なしで到達できる状態（ADR-0004 / ADR-0009）", () => {
  test("summary をクリックすると開き、もう一度クリックすると閉じる", async () => {
    render(await expand(faq));
    const [, second] = items();
    if (!second) throw new Error("2 つ目の details がない");
    await userEvent.click(summaryOf(second));
    expect(second.open).toBe(true);
    await userEvent.click(summaryOf(second));
    expect(second.open).toBe(false);
  });

  test("同じ name を持つ項目は排他になり、片方を開くともう片方が閉じる", async () => {
    render(await expand(faq));
    const [first, second] = items();
    if (!first || !second) throw new Error("details が 2 つない");
    expect(first.open).toBe(true);
    await userEvent.click(summaryOf(second));
    expect(second.open).toBe(true);
    expect(first.open).toBe(false);
  });
});

describe("APG（Disclosure / Accordion のキーボード操作）", () => {
  test("Tab で summary にフォーカスが移る", async () => {
    render(await expand(faq));
    const [first] = items();
    if (!first) throw new Error("details がない");
    await userEvent.tab();
    expect(document.activeElement).toBe(summaryOf(first));
  });

  test("フォーカス中の summary は Enter と Space で開閉する", async () => {
    render(await expand(faq));
    const [first] = items();
    if (!first) throw new Error("details がない");
    await userEvent.tab();
    expect(first.open).toBe(true);
    await userEvent.keyboard("{Enter}");
    expect(first.open).toBe(false);
    await userEvent.keyboard("[Space]");
    expect(first.open).toBe(true);
  });
});

describe("Web Vitals（ADR-0021）", () => {
  test("展開結果の描画で累積レイアウトシフトが 0", async () => {
    const html = await expand(faq);
    expect(await layoutShiftOf(html)).toBe(0);
  });

  test("固有の CSS と JS を持たない（base.css で足りる）", async () => {
    const bytes = await assetBytes("accordion");
    expect(bytes.files).toEqual([]);
    expect(bytes.css).toBe(0);
    expect(bytes.js).toBe(0);
  });
});
