# popover

ボタンで開く、非モーダルの重ね表示。開閉はネイティブの `popover` 属性と、それを `id` で指すボタンに任せる。テンプレートは開かれる側だけで、開くボタンは利用者が標準の属性で書く。JS を持たない（ADR-0003）。

## 仕様 4 項（ADR-0004）

### 目的

利用者がボタンで補足の内容を開いて読み、他の操作を妨げずに閉じられるようにする。開いた内容はページの上に重なって出るが、非モーダルなので、開いている間もページの他の部分は操作できる。

利用者に応答を求め、それが済むまでページの他の部分を操作させない場面（確認、入力の要求）はモーダルであり、この部品の目的ではない。モーダルが要るなら dialog（別のコンポーネント）を使う。

### JS なしで到達できる状態

目的のすべて。`popover` 属性と、それを指すボタンだけで次が成立する。

- ボタンを押すと開き、もう一度押すと閉じる
- 開いているときに外側を押すと閉じる。押した先がボタンなら、そのボタンの操作もそのまま行われる
- 開いているときに Esc を押すと閉じる
- キーボードで開閉でき、開いたあとの Tab で popover の中へ移れる。中にフォーカスがある状態で Esc を押して閉じると、開いたボタンへフォーカスが戻る（「APG との対応」の節）
- 開閉状態が支援技術に伝わる（ブラウザが開くボタンに展開状態を与える）

開くボタンは `popovertarget` でも、Invoker Commands の `commandfor` と `command="toggle-popover"` でも同じに動く（「開くボタン」の節）。

### JS が足す強化

なし。

対応ブラウザだけが足す強化として、`@flat-html/css` の `base.css` が `[popover]` に `opacity` と `translate` の遷移を当てており、開閉がアニメーションになる。未対応ブラウザでは即時に開閉するだけで、目的に差はない。`prefers-reduced-motion: reduce` では遷移を切る。

### 出力の根要素

`<div popover data-flat="popover">`。参照名 `flat-popover` は出力に残らない。開くボタンはテンプレートの外で利用者が書くので、出力の根要素に含まれない。CSS や開発者ツールでは `div[data-flat="popover"]` を足がかりにする。

## テンプレート

```html
<div popover><slot></slot></div>
```

- 子要素はすべて `<div>` の中へ移る
- テンプレートが式で使う属性はないので、参照タグの属性はすべて `<div>` へ透過する（ADR-0010）。`id` は開くボタンが指す先なので必ず書く。`aria-*` などもそのまま書ける
- 参照タグに `popover` を書くと、テンプレートの `popover` の値が置き換わる。透過は既にある属性の値を置き換えるため。`popover="manual"` や `popover="hint"` はこれで渡す

### 既定を auto にし、hint にしない理由

テンプレートの `popover` は空の値で、auto 状態になる。auto は外側の押下と Esc で閉じ、開くと他の auto の popover を閉じる。

`popover="hint"` は既定にしない。2026-10 時点で `hint` に対応しているのは Chrome 151 以降と Firefox 153 以降だけで、Safari は対応していない（Chrome 133〜150 と Firefox 149〜152 は古い仕様の実装で、振る舞いが一貫しない）。未対応のブラウザは `hint` を不正な値として扱い、HTML の仕様上、`popover` 属性の不正な値は manual 状態になる。manual は外側の押下でも Esc でも閉じない。つまり `hint` を既定にすると、未対応のブラウザで閉じ方が失われる。対応ブラウザだけが得をする段階的な強化にならず、未対応のブラウザで劣化する。

利用者が参照タグに `popover="hint"` を書くことはできる（透過）。対応ブラウザでの振る舞いは次のとおりで、Chromium で実測してテストしている。

- `hint` を開いても、開いている auto の popover は閉じない
- 外側の押下と Esc で閉じる

ただし、外側の押下で auto が閉じるのは `hint` の開くボタンを押したときも同じなので、auto の外側にある `hint` のボタンを押すと、その押下で auto は閉じる。

## 開くボタン

開くボタンは利用者が書き、`id` で popover を指す。ボタンと popover は `id` で結び付くので、DOM 上で隣り合っていなくてよい。

推奨は `popovertarget`:

```html
<button type="button" popovertarget="tip">ヒント</button>
```

Invoker Commands でも同じに動く:

```html
<button type="button" commandfor="tip" command="toggle-popover">ヒント</button>
```

`popovertarget` を推奨するのは、対応ブラウザの幅が広いため。Popover（`popover` 属性と `popovertarget`）は 2025-01-27 に Baseline に達し、Invoker Commands（`commandfor` と `command`）は 2025-12-12 に達した。Invoker Commands に未対応のブラウザでは、`commandfor` のボタンを押しても何も起きない。

## 使い方

```html
<button type="button" popovertarget="tip">ヒント</button>
<flat-popover id="tip">
  <p>補足の内容</p>
</flat-popover>
```

展開後:

```html
<button type="button" popovertarget="tip">ヒント</button>
<div popover id="tip" data-flat="popover">
  <p>補足の内容</p>
</div>
```

開き方を変える場合:

```html
<flat-popover id="note" popover="manual">
  <p>補足の内容</p>
</flat-popover>
```

展開後は `<div popover="manual" id="note" data-flat="popover">` になる。

## APG との対応

APG には popover そのもののパターンがない。開閉は Disclosure パターンの要件に当てる。Disclosure パターンが定めるキーボード操作は Enter と Space による開閉だけなので、重なって出る内容の閉じ方として、Dialog（Modal）パターンから「Esc で閉じる」と「閉じたら開いた要素へフォーカスが戻る」の 2 つを借りる。Dialog パターンのうち、開いたときにフォーカスを中へ移すことと、Tab を中に閉じ込めることはモーダルのための要件なので借りない。

| 要件 | 出典 | 満たすもの |
|---|---|---|
| 開閉の要素が `button` の役割を持つ | Disclosure | 利用者が書く `<button>` |
| Enter と Space で開閉する | Disclosure | `<button>` の既定の動作と、`popovertarget`（または `command="toggle-popover"`）の切り替え |
| 開閉状態が支援技術に伝わる（`aria-expanded`） | Disclosure | ブラウザが開くボタンに展開状態を与える（HTML-AAM） |
| Esc で閉じる | Dialog | auto 状態の popover の既定の動作 |
| 閉じたら開いた要素へフォーカスが戻る | Dialog | 中にフォーカスがある状態で閉じると、ブラウザが開いたボタンへフォーカスを戻す |

フォーカス順について、Chromium で実測した振る舞い:

- 開いてもフォーカスはボタンに残る。次の Tab で popover の中の最初の要素へ移る。DOM 上でボタンと popover の間に別の要素があっても、ブラウザがフォーカス順を調整し、開いたボタンの直後に popover の中を挟む
- popover の中の最後の要素から Tab を押すと、開いたボタンの DOM 上の次の要素へ移る。フォーカスが外へ出ても popover は閉じない

## 消費側が守ること

- 参照タグに `id` を書き、開くボタンの `popovertarget`（または `commandfor`）で同じ値を指す。`id` はページ内で一意にする
- 開くボタンは `<button type="button">` で書く。フォームの中では `type` のない `<button>` は送信ボタンになり、送信ボタンは popover を開けない
- 開くボタンに `aria-expanded` や `aria-controls` を、popover に `role` を手で書かない。ブラウザが開くボタンに展開状態を与え、ボタンと popover の関係を支援技術へ伝える
- 位置は消費側が `site` 層（ADR-0005）で決める。`base.css` は位置を指定しないので、UA の既定どおり画面の中央に出る。ボタンの近くに出すなどの位置の指定は、このコンポーネントでは持たない
- モーダルが要る場面には使わない。dialog を使う

## 固有資産

なし。`base.css` の `[popover]` のスタイル（枠、余白、背景、幅の上限、開閉の遷移）で足りるため、固有の CSS も JS も持たない。
