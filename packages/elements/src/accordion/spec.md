# accordion

1 項目 = 1 コンポーネント。排他はネイティブの `<details name>` に任せる（Exclusive Accordion）。JS を持たない（ADR-0003）。

## 仕様 4 項（ADR-0004）

### 目的

利用者が見出しを選んで、その内容を開いて読み、閉じて畳めるようにする。同じ `name` を与えた項目群では、開いているのが常に 1 つになる。

### JS なしで到達できる状態

目的のすべて。`<details>` と `<summary>` だけで、開閉、キーボード操作、フォーカス、開閉状態の支援技術への伝達、`name` による排他が成立する。

### JS が足す強化

なし。

対応ブラウザだけが足す強化として、`@flat-html/css` の `base.css` が `::details-content` に `block-size` と `content-visibility` の遷移を当てており、開閉がアニメーションになる。未対応ブラウザでは即時に開閉するだけで、目的に差はない。`prefers-reduced-motion: reduce` では遷移を切る。

### 出力の根要素

`<details data-flat="accordion">`。参照名 `flat-accordion` は出力に残らない。CSS や開発者ツールでは `details[data-flat="accordion"]` を足がかりにする。

## テンプレート

```html
<details>
  <summary><slot name="summary"></slot></summary>
  <slot></slot>
</details>
```

- `slot="summary"` の要素が `<summary>` の中へ移る
- それ以外の子要素が `<details>` の直下、`<summary>` の後ろへ移る
- テンプレートが式で使う属性はないので、参照タグの属性はすべて `<details>` へ透過する（ADR-0010）。`name`、`open`、`id`、`aria-*` などをそのまま書ける

### 内容を `<div>` で包まない理由

`base.css` は `details > :not(summary)` に内側の余白を、`details > summary + :not(summary)` と `details > :last-child:not(summary)` に上下の余白を当てている。つまり `<details>` の直下に内容の要素が並ぶ前提で書かれている。内容を `<div>` で包むと、`:last-child` の `margin-block-end: 0` が `<div>` に当たって内側の最後の `<p>` の下余白が残り、下端の余白が二重になる。包まずに直下へ置けば、内容の要素数によらず余白が正しく付く。

この前提の裏返しとして、名前なしの差し込みには要素（`<p>` など）を入れる。要素に包まれていない素のテキストには余白が付かない。

## 使い方

```html
<flat-accordion name="faq" open>
  <h3 slot="summary">質問 1</h3>
  <p>答え 1</p>
</flat-accordion>
<flat-accordion name="faq">
  <h3 slot="summary">質問 2</h3>
  <p>答え 2</p>
</flat-accordion>
```

展開後:

```html
<details name="faq" open data-flat="accordion">
  <summary><h3>質問 1</h3></summary>
  <p>答え 1</p>
</details>
<details name="faq" data-flat="accordion">
  <summary><h3>質問 2</h3></summary>
  <p>答え 2</p>
</details>
```

## APG との対応

APG の Accordion パターンと Disclosure パターンの要件のうち、`<details>` / `<summary>` がネイティブで満たすもの:

- Enter と Space で開閉する（`<summary>` の既定の動作）
- Tab で `<summary>` にフォーカスが移る
- 開閉状態が支援技術に伝わる（`<summary>` は `button` 相当として扱われ、展開状態を持つ）
- `name` を共有する項目は、片方を開くともう片方が閉じる

消費側が守ること:

- `slot="summary"` には見出し要素（`<h2>`〜`<h6>`）を入れ、文書の見出し階層を保つ。APG の Accordion は各ヘッダーが見出しであることを求める
- 排他にしたい項目群には同じ `name` を与える。独立に開閉させたい項目には `name` を付けない
- 初期状態で開いておく項目には `open` を書く。`name` を共有する項目群では `open` を 1 つだけにする

## 固有資産

なし。`base.css` の `details` と `summary` のスタイルで足りるため、固有の CSS も JS も持たない。
