# ADR-0031: customizable select は、解析器が新しい `<select>` の解析に対応するまで保留する

- 状態: 採択（ADR-0016 の順序のうち customizable select を保留）
- 日付: 2026-11-02

## 文脈

ADR-0016 は、accordion と明暗切り替えの次に、dialog、popover と invoker、customizable select を順に作ると決めた。customizable select は、`<select>` に `appearance: base-select` を当て、`<select>` の中に `<button>` と `<selectedcontent>` を置いて、選択肢の一覧と選ばれた値の見た目を作る。HTML の仕様は、そのために `<select>` の中身の解析を緩めた。

flat-html は、テンプレートとページを parse5 で解析し、直列化し直して出力する（ADR-0008、ADR-0020）。parse5 は、緩めた `<select>` の解析を実装していない。2026-11-02 時点の最新の 8.1.0（2026-11-01 公開）のリリースノートにも含まれていない。古い解析は、`<select>` の中にある `<option>`、`<optgroup>`、`<hr>`、`<template>`、`<script>` 以外の開始タグを捨てる。捨てたタグの中の文字は残る。parse5 側の実装の PR（#1317、#1610）は open のままである。

手元の parse5 8.0.1 で確かめた結果:

```
入力: <select><button><selectedcontent></selectedcontent></button><slot></slot><option>a</option><div><option>b</option></div></select>
出力: <select><option>a</option><option>b</option></select>
```

このため、次の 2 つが成り立たない。

- テンプレートの `<select>` の中に `<slot>` を置けない。利用者が参照タグの子に書いた `<option>` の行き先がなく、捨てられる（ADR-0023 の「差し込み先のない子要素は捨てる」）
- 利用者がページに `<button>` と `<selectedcontent>` を書いても、flat-html を通ると消える

対応ブラウザは、2026-11 時点で Chrome 135 と Safari 27 で、Firefox は未対応である。Baseline に達していない。

## 決定

- customizable select のコンポーネントは作らない。parse5 が緩めた `<select>` の解析を実装するまで保留する
- 保留の間、flat-html を通るテンプレートとページでは、`<select>` の中に `<option>`、`<optgroup>`、`<hr>`、`<template>`、`<script>` 以外の要素を書けない。選択肢を `<template each>` で作る書き方は、今の解析でも使える。これを既知の制約とし、`packages/vite/tests/known-constraints.test.ts` で今の振る舞いを固定する。parse5 を上げてこのテストが落ちたら、それが再開の合図になる
- 再開するときは、customizable select の対応ブラウザも見直す
- ADR-0016 の順序の残りは、ADR-0016 のとおり Custom Element が要るもの（tabs、combobox）へ進む。customizable select は、再開の条件がそろった時点で差し込む

## 理由

- テンプレートで組めないものを、コンポーネントとして出せない。差し込みの仕組み（ADR-0011）が `<select>` の中で働かない
- 解析器を替えたり parse5 に手を入れたりする費用は、まだ Baseline に達していない機能 1 つのために払う大きさではない
- 保留しても、`<select>` そのものは `base.css` の規則でそのまま整う。利用者が失うのは、選択肢の一覧の見た目を作り込む手段だけである

## 却下した選択肢

- `<select>` の中に差し込み口を置くテンプレート: `<slot>` が解析で捨てられる（文脈の結果）
- 解析器を替える（htmlparser2 など）: 仕様どおりの解析を前提にした ADR-0008 の判断を崩す。展開と集約の全体に及ぶ
- parse5 に手を入れて使う（pnpm の patch など）: 手元のビルドには効くが、`@flat-html/vite` を使う人には届かない。上流の実装と食い違ったときの保守も要る
- `base.css` で、すべての `<select>` に `appearance: base-select` を当てる: 利用者のマークアップを変えずに済むが、携帯端末の OS が出す選択の UI が、Web が描く一覧に置き換わる。class なしの基礎の層で、全員に強いる変更ではない。Firefox が未対応で、Baseline にも達していない
- 印を付けた `<select>` だけを、data 属性で `appearance: base-select` に切り替える: `<button>` と `<selectedcontent>` を書けない状態では、選択肢の一覧の見た目の一部しか変えられない。コンポーネントとしての価値が薄く、再開するときにまとめて決めるほうが確か

## 影響

- issue #10 の 3 項目のうち、customizable select は作らずに閉じる。再開の手がかりは、この ADR と `known-constraints.test.ts` に置く
- `<select>` の制約は、ADR-0023 の「既知の制約」（foster parenting）と同じ種類の、解析器に由来する制約である
