import { beforeEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { assetBytes, expand, layoutShiftOf, render, squash } from "../../tests/browser.ts";

/** 開くボタンは利用者が標準の属性で書く。ダイアログの外のページ要素として、前後にボタンを 1 つずつ置く */
const usage = `
<button type="button" commandfor="notice" command="show-modal">開く</button>
<flat-dialog id="notice">
  <span slot="title">お知らせ</span>
  <p>本文 <a href="#more">詳しく</a></p>
</flat-dialog>
<button type="button">後ろのボタン</button>`;

interface Parts {
  dialog: HTMLDialogElement;
  opener: HTMLButtonElement;
  link: HTMLAnchorElement;
  close: HTMLButtonElement;
}

function parts(): Parts {
  const dialog = document.querySelector("dialog");
  const opener = document.querySelector<HTMLButtonElement>('button[command="show-modal"]');
  const link = dialog?.querySelector("a");
  const close = dialog?.querySelector<HTMLButtonElement>('button[command="close"]');
  if (!dialog || !opener || !link || !close) throw new Error("dialog の部品が揃っていない");
  return { dialog, opener, link, close };
}

/** 開くボタンへ Tab で移り、Enter で開く。閉じたときに戻る先を開くボタンにするため、キーボードで開く */
async function openByKeyboard(): Promise<void> {
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
}

/**
 * Tab（`shift` なら Shift+Tab）を `count` 回押し、押すたびのフォーカス先を返す。
 * フォーカスが文書の外（ブラウザの UI。テストでは vitest の親の文書）にあるときは `null`。
 */
async function tabStops(count: number, shift: boolean): Promise<(Element | null)[]> {
  const stops: (Element | null)[] = [];
  for (let i = 0; i < count; i++) {
    await userEvent.tab({ shift });
    stops.push(document.hasFocus() ? document.activeElement : null);
  }
  return stops;
}

beforeEach(() => {
  render("");
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
});

describe("構造", () => {
  test("出力の根は <dialog data-flat=dialog> で、参照名 flat-dialog は残らない", async () => {
    const html = await expand(usage);
    expect(squash(html)).toBe(
      '<button type="button" commandfor="notice" command="show-modal">開く</button>' +
        '<dialog id="notice" aria-labelledby="notice-title" data-flat="dialog">' +
        '<h2 id="notice-title"><span>お知らせ</span></h2>' +
        '<p>本文 <a href="#more">詳しく</a></p>' +
        '<button type="button" commandfor="notice" command="close"> 閉じる </button>' +
        "</dialog>" +
        '<button type="button">後ろのボタン</button>',
    );
    render(html);
    expect(document.querySelector("flat-dialog")).toBeNull();
    expect(parts().dialog.dataset["flat"]).toBe("dialog");
  });

  test("id は <dialog> に載り、aria-labelledby が題の <h2> を、閉じるボタンが <dialog> を指す", async () => {
    render(await expand(usage));
    const { dialog, close } = parts();
    expect(dialog.id).toBe("notice");
    const title = document.getElementById(dialog.getAttribute("aria-labelledby") ?? "");
    expect(title?.tagName).toBe("H2");
    expect(title?.textContent).toBe("お知らせ");
    expect(close.getAttribute("commandfor")).toBe("notice");
    expect(document.querySelector("[slot]")).toBeNull();
  });

  test("テンプレートが使わない closedby や aria-describedby は <dialog> へ透過する", async () => {
    const html = await expand(
      '<flat-dialog id="notice" closedby="any" aria-describedby="notice-body">' +
        '<span slot="title">お知らせ</span><p id="notice-body">本文</p>' +
        "</flat-dialog>",
    );
    expect(squash(html)).toContain(
      '<dialog id="notice" aria-labelledby="notice-title" closedby="any" aria-describedby="notice-body" data-flat="dialog">',
    );
  });
});

describe("JS なしで到達できる状態（ADR-0004 / ADR-0009）", () => {
  test("利用者の書いた command=show-modal のボタンを押すとモーダルとして開く", async () => {
    render(await expand(usage));
    const { dialog, opener } = parts();
    expect(dialog.open).toBe(false);
    await userEvent.click(opener);
    expect(dialog.open).toBe(true);
    expect(dialog.matches(":modal")).toBe(true);
  });

  test("閉じるボタンを押すと閉じる", async () => {
    render(await expand(usage));
    const { dialog, opener, close } = parts();
    await userEvent.click(opener);
    await userEvent.click(close);
    expect(dialog.open).toBe(false);
  });

  test("Esc で閉じる", async () => {
    render(await expand(usage));
    const { dialog, opener } = parts();
    await userEvent.click(opener);
    await userEvent.keyboard("{Escape}");
    expect(dialog.open).toBe(false);
  });
});

describe("APG（Dialog (Modal) のキーボード操作とフォーカス管理）", () => {
  test("開くとフォーカスがダイアログの中の最初のフォーカス可能な要素へ移る", async () => {
    render(await expand(usage));
    const { dialog, link } = parts();
    await openByKeyboard();
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(link);
  });

  test("開いている間は Tab と Shift+Tab を繰り返してもダイアログ外のページ要素へフォーカスが行かない", async () => {
    render(await expand(usage));
    const { dialog, link, close } = parts();
    await openByKeyboard();
    for (const shift of [false, true]) {
      link.focus();
      const inDocument = (await tabStops(6, shift)).filter((stop) => stop !== null);
      expect(inDocument.filter((stop) => !dialog.contains(stop))).toEqual([]);
      expect(inDocument).toEqual(expect.arrayContaining([link, close]));
    }
    // 文書の外へ出たフォーカスを残すと、後続のテストの userEvent.tab() が文書に入らない
    link.focus();
  });

  test("閉じると、開いたボタンへフォーカスが戻る", async () => {
    render(await expand(usage));
    const { dialog, opener, close } = parts();
    await openByKeyboard();
    await userEvent.keyboard("{Escape}");
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);

    await userEvent.keyboard("{Enter}");
    await userEvent.tab();
    expect(document.activeElement).toBe(close);
    await userEvent.keyboard("{Enter}");
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  test("ダイアログの名前は slot=title で入れた題になる", async () => {
    render(await expand(usage));
    const { dialog, opener } = parts();
    await userEvent.click(opener);
    expect(page.getByRole("dialog", { name: "お知らせ" }).element()).toBe(dialog);
  });
});

describe("余白（base.css）", () => {
  test("題の上と閉じるボタンの下で、枠からの距離が揃う", async () => {
    render(await expand(usage));
    const { dialog, opener, close } = parts();
    await userEvent.click(opener);
    const title = dialog.querySelector("h2");
    if (!title) throw new Error("題の h2 がない");
    const box = dialog.getBoundingClientRect();
    const top = title.getBoundingClientRect().top - box.top;
    const bottom = box.bottom - close.getBoundingClientRect().bottom;
    expect(top).toBeCloseTo(bottom, 1);
  });
});

describe("Web Vitals（ADR-0021）", () => {
  test("展開結果の描画で累積レイアウトシフトが 0", async () => {
    const html = await expand(usage);
    expect(await layoutShiftOf(html)).toBe(0);
  });

  test("固有の CSS と JS を持たない（base.css で足りる）", async () => {
    const bytes = await assetBytes("dialog");
    expect(bytes.files).toEqual([]);
    expect(bytes.css).toBe(0);
    expect(bytes.js).toBe(0);
  });
});
