import { expect, test } from "vite-plus/test";
import { expand } from "./helpers.ts";

/**
 * 解析器 parse5 の既知の制約を固定する（ADR-0031）。
 * これらが落ちたら、parse5 が新しい `<select>` の解析を実装した合図である。
 * 期待値を書き換えて通すのではなく、ADR-0031 の再開の条件を見直す。
 */

test("<select> の中の <button> と <selectedcontent> は解析で落ちる", async () => {
  const html = await expand(
    "<select><button><selectedcontent></selectedcontent></button><option>a</option></select>",
    {},
  );
  expect(html).toBe("<select><option>a</option></select>");
});

test("テンプレートの <select> の中に置いた <slot> は解析で落ち、差し込んだ <option> の行き先がない", async () => {
  const html = await expand("<flat-picker><option>a</option></flat-picker>", {
    picker: "<select><slot></slot></select>",
  });
  expect(html).toBe('<select data-flat="picker"></select>');
});
