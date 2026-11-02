# dialog

モーダルのダイアログ。ネイティブの `<dialog>` を Invoker Commands（`commandfor` と `command`）で開閉し、JS を持たない（ADR-0003）。テンプレートは開かれる側の `<dialog>` だけを持ち、開くボタンは利用者が標準の属性で書く。

## 仕様 4 項（ADR-0004）

### 目的

利用者が、背後のページを操作できない状態でダイアログの内容を読み、応答し、閉じて開く前の場所へ戻れるようにする。

### JS なしで到達できる状態

Invoker Commands に対応したブラウザでは、目的のすべて。利用者が書いた `<button commandfor="…" command="show-modal">` を押すと `<dialog>` がモーダルとして開き、テンプレートの閉じるボタン（`command="close"`）か Esc で閉じる。

次のものはネイティブのモーダルの `<dialog>` が持つので、テンプレートは書かない。`role="dialog"`、`aria-modal`、フォーカスの閉じ込め、背後への `inert` の手当てはどれも書かない。

- 背後のページの不活性化
- 開いたときにフォーカスをダイアログの中へ移すことと、ダイアログの外のページ要素へ出さないこと
- 最上位層への表示と `::backdrop`
- Esc と戻る操作で閉じること
- 閉じたときに、開いたボタンへフォーカスを戻すこと
- ダイアログであることと、モーダルであることの支援技術への伝達

`@flat-html/css` の `base.css` は `dialog:modal` と `dialog::backdrop` に `overscroll-behavior: contain` を当て、モーダルの間、ダイアログの上でも背景の上でもホイール操作が背後のページのスクロールへ連鎖しないようにしている。`overscroll-behavior` はスクロールコンテナにしか効かないので、`::backdrop` には `overflow: hidden` も当てて、スクロールコンテナにしている。

Invoker Commands に対応していないブラウザ（Chrome 134 以前、Firefox 143 以前、Safari 26.1 以前）では、開くボタンを押しても何も起きず、内容に到達できない。このコンポーネントは JS を持たないので、これを補わない。

### JS が足す強化

なし。

対応ブラウザだけが足す強化:

- 参照タグに `closedby="any"` を書くと `<dialog>` へ透過し、ダイアログの外側（`::backdrop`）を押しても閉じるようになる。`closedby` は Chrome 134 と Firefox 141 から対応し、Safari は対応していない。対応していないブラウザでは属性が無視されるだけで、Esc、戻る操作、閉じるボタンでは変わらず閉じる（段階的強化）。テンプレートは `closedby` を書かないので、既定は `showModal()` の既定と同じく、Esc と戻る操作で閉じ、外側の押下では閉じない
- `base.css` が `dialog` と `::backdrop` に不透明度、位置、背景色の遷移を当てており、開閉がアニメーションになる。未対応ブラウザでは即時に開閉するだけで、目的に差はない。`prefers-reduced-motion: reduce` では遷移を切る

### 出力の根要素

`<dialog data-flat="dialog">`。参照名 `flat-dialog` は出力に残らない。CSS や開発者ツールでは `dialog[data-flat="dialog"]` を足がかりにする。開くボタンは利用者が書くもので、このコンポーネントの出力には含まれない。

## テンプレート

```html
<dialog id="{{ id }}" aria-labelledby="{{ id }}-title">
  <h2 id="{{ id }}-title"><slot name="title"></slot></h2>
  <slot></slot>
  <button type="button" commandfor="{{ id }}" command="close">
    <slot name="close">閉じる</slot>
  </button>
</dialog>
```

- `id` は必須の引数。テンプレートは `{{ id }}` を `<dialog>` の `id`、題の `<h2>` の `id`（`{{ id }}-title`）、`aria-labelledby`、閉じるボタンの `commandfor` に使う。式で使った引数は透過しない（ADR-0010）ので、`<dialog>` の `id` はテンプレート自身が書いている
- `id` を書き忘れても展開は失敗しない。値が `{{ id }}` だけの属性は、`id` がないと属性ごと出力されない（ADR-0029）。そのため `<dialog>` の `id` と閉じるボタンの `commandfor` が付かず、値に他の文字が混ざる `aria-labelledby` と題の `id` は `-title` になる。開くボタンからも閉じるボタンからも `<dialog>` を指せず、`id` のない dialog が 2 つあると `-title` が重複する
- `slot="title"` の要素が `<h2>` の中へ移る。`<h2>` の `id` と `<dialog>` の `aria-labelledby` が結び付き、題がダイアログの名前になる。color-scheme の `legend` と同じく、`<span>` など見出しの中に置ける要素で差し込む
- 見出しの水準は `<h2>` に固定する。ダイアログの題の水準を、どのダイアログでも揃えるため。水準を変える引数は持たない
- それ以外の子要素は `<dialog>` の直下、`<h2>` と閉じるボタンの間へ移る
- 閉じるボタンの文言は `slot="close"` で入れ替えられる。差し込みがなければ既定の「閉じる」が残る（ADR-0011）
- テンプレートが式で使う属性は `id` だけなので、それ以外の参照タグの属性はすべて `<dialog>` へ透過する（ADR-0010）。`closedby`、`aria-describedby` などをそのまま書ける

### 閉じるボタンを包まない理由

閉じるボタンは `<dialog>` の直下に置き、`<div>` や `<p>` で包まない。

`base.css` は `button` を `display: inline-block` にし、`div` には規則を持たない。本文の最後の要素が `<p>` などなら、その `margin-block-end`（`--flat-space` の 2 倍）が本文と閉じるボタンの間を空け、閉じるボタンの下には `dialog` の `padding`（`--flat-space` の 3 倍）だけが残る。

- `<div>` で包んでも、本文が要素である限り余白は変わらない。要素が 1 つ増えるだけになる
- `<p>` で包むと、`<p>` の `margin-block-end` が `dialog` の `padding` に足され、下端の余白が `padding` より広くなる。ボタン 1 つだけの段落という意味の合わない構造にもなる

この前提の裏返しとして、名前なしの差し込みには要素（`<p>` など）を入れる。素のテキストや行内の要素だけを入れると、閉じるボタンと同じ行に並ぶ。

## 使い方

```html
<button type="button" commandfor="notice" command="show-modal">お知らせを開く</button>
<flat-dialog id="notice">
  <span slot="title">お知らせ</span>
  <p>11 月 3 日の 2 時から 4 時まで、保守のため停止する。</p>
</flat-dialog>
```

展開後:

```html
<button type="button" commandfor="notice" command="show-modal">お知らせを開く</button>
<dialog id="notice" aria-labelledby="notice-title" data-flat="dialog">
  <h2 id="notice-title"><span>お知らせ</span></h2>
  <p>11 月 3 日の 2 時から 4 時まで、保守のため停止する。</p>
  <button type="button" commandfor="notice" command="close">閉じる</button>
</dialog>
```

外側の押下でも閉じ、文言を差し替える場合:

```html
<flat-dialog id="notice" closedby="any">
  <span slot="title">Notice</span>
  <p>Service will be down for maintenance.</p>
  <span slot="close">Close</span>
</flat-dialog>
```

展開後:

```html
<dialog id="notice" aria-labelledby="notice-title" closedby="any" data-flat="dialog">
  <h2 id="notice-title"><span>Notice</span></h2>
  <p>Service will be down for maintenance.</p>
  <button type="button" commandfor="notice" command="close"><span>Close</span></button>
</dialog>
```

## APG との対応

APG の Dialog (Modal) パターンの要件のうち、ネイティブのモーダルの `<dialog>` が満たすもの:

- 開くと、フォーカスがダイアログの中へ移る。`autofocus` を持つ要素がなければ、ダイアログの中で最初のフォーカス可能な要素へ移り、ダイアログ自身には移らない。本文にリンクなどがあればそこへ、なければ閉じるボタンへ移る
- Tab と Shift+Tab は、ダイアログの中のフォーカス可能な要素を巡る。ダイアログの外のページ要素（開くボタンなど）へは移らない
- Esc で閉じる
- 閉じると、開いたボタンへフォーカスが戻る
- `<dialog>` は `dialog` の役割を持ち、`showModal()` で開いたものはモーダルとして扱われる。`role="dialog"` と `aria-modal="true"` を書く必要がない
- `aria-labelledby` が題の `<h2>` を指し、題がダイアログの名前になる。APG はダイアログに名前を求めており、テンプレートがこの結び付きを持つ
- `aria-describedby` は APG でも任意。要るときは参照タグに書けば `<dialog>` へ透過する

APG と異なる点が 1 つある。APG は、最後の要素で Tab を押すと最初の要素へ、最初の要素で Shift+Tab を押すと最後の要素へ回り込むことを求める。Chromium 156 のネイティブのモーダルでは、端の要素から先へ進むとフォーカスがいったん文書の外へ出て、次の Tab（Shift+Tab）でダイアログの反対の端へ戻る（下の「テストしたブラウザと対応状況」）。ダイアログの外のページ要素へ移らない点は満たしている。フォーカスの閉じ込めを JS で書き足すことはしない。

## テストしたブラウザと対応状況

テストは Playwright の Chromium 156 だけで行う（ADR-0009）。`dialog.test.ts` が Chromium で確かめていること:

- `command="show-modal"` のボタンを押すと開き、`:modal` に一致する。閉じるボタンと Esc で閉じる
- キーボードで開くと、本文の最初のリンクへフォーカスが移る
- 開いている間、Tab と Shift+Tab を 6 回ずつ押しても、文書の中でフォーカスが当たるのはダイアログの中の要素だけで、端から反対の端へ戻る。端から先へ進んだとき、テストの環境では vitest の親の文書へフォーカスが出る。最上位の文書でどこへ出るか（ブラウザの UI など）は確かめていない
- Esc でも閉じるボタンでも、閉じると開いたボタンへフォーカスが戻る
- vitest の `page.getByRole("dialog", { name: "お知らせ" })` が展開した `<dialog>` を指す。これは DOM から役割と名前を計算するもので、ブラウザが支援技術へ渡す情報そのものではない
- 展開結果の描画で累積レイアウトシフトが 0

同じ Chromium 156 で実測したが、テストには含めていないこと:

- `autofocus` と `tabindex="-1"` を書いた本文の `<p>` があれば、開いたときのフォーカスはそこへ移る
- `closedby="any"` を書くと外側の押下で閉じ、書かなければ閉じない
- `base.css` の規則がある状態では、ダイアログの上でも背景の上でもホイール操作で背後のページがスクロールしない。`overscroll-behavior` を `auto` に戻すとどちらの上でもスクロールし、`::backdrop` の `overflow` を `visible` に戻すと背景の上でスクロールする

他のブラウザはテストしていない。対応状況は次のとおり。

- `<dialog>` と `showModal()` は広く利用できる
- Invoker Commands（`commandfor` と `command`）は Baseline 2025-12-12（Chrome 135、Firefox 144、Safari 26.2）
- `closedby` は Chrome 134 と Firefox 141 から対応し、Safari は対応していない

## 消費側が守ること

- `id` を必ず書き、ページの中で一意にする。開くボタンの `commandfor` にも同じ値を書く
- 開くボタンは `<button type="button" commandfor="…" command="show-modal">` で書く。`type="button"` は、`<form>` の中に置いたときに送信ボタンとして扱われないようにするため
- 参照タグに `open` を書かない。`open` 属性で開いた `<dialog>` はモーダルにならず、背後の不活性化もフォーカスの移動も起きない
- `slot="title"` には必ず題を入れる。入れなければ `<h2>` が空になり、ダイアログに名前がなくなる
- 名前なしの差し込みには要素（`<p>` など）を入れる（理由は上の「閉じるボタンを包まない理由」）
- 本文が長く、最初のフォーカス可能な要素へ移るとダイアログの冒頭が見えなくなる場合や、最初のフォーカス可能な要素が取り消せない操作のボタンである場合は、開いたときにフォーカスを当てたい要素に `autofocus` を書く。フォーカス可能でない要素なら `tabindex="-1"` も書く。APG の初期フォーカスの指針に従うため
- 外側の押下でも閉じたいときだけ `closedby="any"` を書く。Safari では外側を押しても閉じないので、閉じる手段を外側の押下だけに頼らない

## 固有資産

なし。`base.css` の `dialog` と `::backdrop` のスタイル、開閉の遷移、背後へのスクロールの連鎖を止める規則で足りるため、固有の CSS も JS も持たない。
