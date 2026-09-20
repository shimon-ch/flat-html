# color-scheme

ページの配色を利用者が選ぶ要素。ネイティブのラジオグループと `:root:has(:checked)` だけで切り替わり、Custom Element は持たない（ADR-0003）。固有の CSS と、選択を保存する固有の JS を持つ。

## 仕様 4 項（ADR-0004）

### 目的

利用者がページの配色を選べる。OS の設定に従う「自動」と、それを上書きする「明」「暗」の 3 つから選ぶ。

### JS なしで到達できる状態

そのページ内での目的のすべて。3 つのラジオから選ぶと、`index.css` の `:root:has(…:checked)` が `:root` の `color-scheme` を上書きし、選択が即座に反映される。`@flat-html/css` の `tokens.css` が色を `light-dark()` で定義しているので、`color-scheme` が変わるだけで文字色・背景色・境界線と、ブラウザが描く部品（フォーム部品の枠、キャレット、スクロールバー）がまとめて追従する（ADR-0014）。

### JS が足す強化

選択の保存と、次のページ以降への引き継ぎ。`index.js` が選択を `localStorage` に書き、次のページ読み込み時に読み戻してラジオの選択を復元する。

このモジュールは `<script type="module">` なので遅延して実行される。したがって**保存された選択が復元されるまでの一瞬だけ、テンプレートの既定である「自動」の配色が見える**。暗い配色を保存した利用者が、OS が明るい設定なら、復元までの間だけ明るい画面を見る。これはアップグレードギャップと同じ性質の制約で、消していない（design.md の「ギャップを消すのではなく無害化する」）。消したい場合は消費側が `blocking="render"` を足す判断になるが、初回描画を遅らせる代償があるのでライブラリ側では持たない。

`localStorage` が遮断された文脈（埋め込み、私用閲覧）では参照そのものが例外になる。その場合は保存も復元もされず、JS なしの状態と同じになる。

### 出力の根要素

`<fieldset data-flat="color-scheme">`。参照名 `flat-color-scheme` は出力に残らない。テンプレートが持つ `<link rel="stylesheet">` と `<script type="module">` は資産として `<head>` へ集約されるため（ADR-0013）、出力の根要素とはみなされず、`data-flat` も参照タグの属性の透過も受けない。CSS や開発者ツールでは `fieldset[data-flat="color-scheme"]` を足がかりにする。

## 2 状態ではなく 3 状態にする理由

ADR-0014 は「基礎は `<input type="checkbox" switch>` と `:root:has(:checked)`」と書いているが、実装は 3 状態のラジオグループにした。

チェックボックスは 2 状態しか表せない。`:root` の既定が `color-scheme: light dark`（OS に従う）なので、2 状態で表せるのは「OS に従う」と「暗」の組か、「OS に従う」と「明」の組のどちらかに限られる。前者では OS を暗い設定にしている利用者が明を選べず、後者では明るい設定の利用者が暗を選べない。どちらも「利用者がページの配色を選べる」という目的を半分しか果たさない。

「自動 / 明 / 暗」は排他の 3 択であり、それを表すネイティブの部品はラジオグループである。Switch 属性の見た目を取るために目的を削るのは、判断の三軸の順序が逆になる。

## テンプレート

```html
<link rel="stylesheet" href="@flat-html/elements/color-scheme/index.css" />
<script type="module" src="@flat-html/elements/color-scheme/index.js"></script>
<fieldset>
  <legend><slot name="legend">配色</slot></legend>
  <label>
    <input type="radio" name="flat-color-scheme" value="system" checked />
    <slot name="system">自動</slot>
  </label>
  <label>
    <input type="radio" name="flat-color-scheme" value="light" />
    <slot name="light">明</slot>
  </label>
  <label>
    <input type="radio" name="flat-color-scheme" value="dark" />
    <slot name="dark">暗</slot>
  </label>
</fieldset>
```

- 文言は `legend`、`system`、`light`、`dark` の 4 つの名前付き差し込みで入れ替えられる。差し込みがなければ既定の日本語が残る（ADR-0011）
- `<input>` を `<label>` の中に入れているので `for` と `id` が要らない。1 ページに 2 つ以上置かれても `id` が衝突しない
- テンプレートが式で使う属性はないので、参照タグの属性はすべて `<fieldset>` へ透過する（ADR-0010）。`id`、`aria-*` などをそのまま書ける

### `name` を固定にしている理由と、その帰結

`name="flat-color-scheme"` は固定で、引数では変えられない。固有 CSS のセレクタ `input[name="flat-color-scheme"]` と固有 JS の `localStorage` の鍵が同じ名前に結び付いているためで、可変にすると CSS を生成するか属性セレクタを緩めるかのどちらかが要る。

帰結として、**1 ページに 2 つ置くと壊れる**。ラジオグループは「同じ form owner の中で同じ `name` を持つもの」という単位なので、どちらの `<fieldset>` も `<form>` の外にあれば 2 つ合わせて 1 グループになり、片方を選ぶともう片方の選択が消えて「どれも選ばれていない」見た目になる。逆に 2 つを別々の `<form>` の中に置くと別グループになり、両方が同時に選択されうる。そのとき CSS は後に書かれた規則（`value="dark"`）が勝つので、見た目と選択が食い違う。

1 ページに 1 つだけ置くこと。ヘッダーとフッターの両方に置きたい、といった要求が実際に出たら、そのときに `name` を引数にするか別の仕組みを足すかを決める。

## 固有 CSS

```css
@layer components {
  :root:has(input[name="flat-color-scheme"][value="light"]:checked) {
    color-scheme: light;
  }

  :root:has(input[name="flat-color-scheme"][value="dark"]:checked) {
    color-scheme: dark;
  }
}
```

`value="system"` に規則がないのは、`tokens.css` の `:root { color-scheme: light dark }` がそのまま既定として残るため。切り替えで書き換えるのは `color-scheme` の 1 プロパティだけで、色そのものには触れない。消費側が `site` 層でトークンを上書きしていても、`light-dark()` の中身が入れ替わるだけなので上書きは保たれる。

見た目の CSS は持たない。`<fieldset>`、`<legend>`、`<label>`、`<input type="radio">` は `@flat-html/css` の `base.css` がすでに整えている。

## 固有 JS

`customElements.define` は呼ばない。この要素は Custom Element ではなく、JS は保存と復元だけを足す。

- 読み込み時に `localStorage` の `flat-color-scheme` を読み、一致する値のラジオを選択状態にする
- `document` の `change` を 1 つだけ監視し、`name` が一致する `<input>` の変更を保存する

監視を `document` に置いているのは、要素ごとに登録先を探さずに済み、差し替えられた DOM でも効くため。

## 使い方

```html
<flat-color-scheme></flat-color-scheme>
```

文言を差し替える場合:

```html
<flat-color-scheme>
  <span slot="legend">Theme</span>
  <span slot="system">Auto</span>
  <span slot="light">Light</span>
  <span slot="dark">Dark</span>
</flat-color-scheme>
```

展開後:

```html
<fieldset data-flat="color-scheme">
  <legend><span>Theme</span></legend>
  <label><input type="radio" name="flat-color-scheme" value="system" checked /><span>Auto</span></label>
  <label><input type="radio" name="flat-color-scheme" value="light" /><span>Light</span></label>
  <label><input type="radio" name="flat-color-scheme" value="dark" /><span>Dark</span></label>
</fieldset>
```

`<link>` と `<script>` は `<head>` へ移る。

## APG との対応

APG の Radio Group パターンの要件のうち、`<fieldset>` と `<input type="radio">` がネイティブで満たすもの:

- Tab でグループに入り、もう一度 Tab でグループを出る。グループ内のラジオはまとめて 1 つのタブ停止になる（ローミングタブインデックスを自分で書かなくてよい）
- グループに入ったときフォーカスが当たるのは選択中のラジオ
- 矢印キー（上下左右）で選択が隣へ移り、フォーカスも一緒に移る。端では反対側へ回り込む
- `<legend>` がグループの名前として支援技術に伝わる（`<fieldset>` は `group` として扱われ、`<legend>` がその名前になる）
- `<label>` が `<input>` を包んでいるので、文言を押しても選択できる
- 選択状態が支援技術に伝わる

APG は「グループ名を必ず与える」ことを求めている。`<legend>` の既定文言「配色」がそれに当たり、差し込みで置き換えても `<legend>` である限り名前として機能する。

## 消費側が守ること

- 1 ページに 1 つだけ置く（理由は上の「`name` を固定にしている理由と、その帰結」）
- 差し込みで文言を置き換えるときも、`slot="legend"` の中身はグループ名として意味の通る語にする
- ページが `<meta name="color-scheme" content="light dark">` を宣言していること。`@flat-html/css` を読み込むページの前提であり、この要素はその宣言を変えない

## 固有資産

`index.css` と `index.js` の 2 つ。バイト数の上限は `color-scheme.test.ts` に定数として書き、テストで検査する（ADR-0021）。
