# ADR-0029: 値全体が 1 つの `{{ }}` の属性は、結果が null か undefined なら出さない

- 状態: 採択（ADR-0012 / ADR-0023 を補う。置換はしない）
- 日付: 2026-11-02

## 文脈

見本サイトのナビで、現在位置の項目にだけ `aria-current="page"` を付けたかった。ADR-0012 の式には、属性を条件付きで出す書き方がない。`{{ }}` は結果が `null` か `undefined` でも空文字を出すので、属性は空の値で必ず残る。そこで `<template if>` を使い、同じ `<a>` を「属性を付ける版」と「付けない版」の 2 通り書いていた。

挙がった選択肢は 3 つだった。

- 条件付き属性の新しい記法を足す
- 式に三項演算子を足す
- 何もしない

## 決定

- 属性の値**全体**がちょうど 1 つの `{{ … }}` でできていて、評価の結果が `null` か `undefined` なら、その属性を出力しない
- 値に他の文字が混ざる属性は従来どおりにする。前後の空白も他の文字に数える。`href="{{ base }}pages/"`、`title="{{ a }}{{ b }}"`、`title=" {{ x }} "` は消えず、`null` と `undefined` は空文字になる
- それ以外の結果は従来どおり文字列にする。`false` は `"false"`、`true` は `"true"` になり、空文字列は空の値として残る
- テキストの `{{ }}` は変えない
- 式の文法（ADR-0012）は広げない。条件付きで出すには、すでにある `&&` `||` と `null` を組み合わせる

```html
<a href="{{ base }}" aria-current="{{ current == 'home' && 'page' || null }}">はじめに</a>
```

`current` が `'home'` なら `aria-current="page"` が付き、それ以外では属性ごと付かない。`&&` と `||` は被演算子を返す（ADR-0023）ので、この形で書ける。

- ページ側の `flat-*` 参照タグの属性にも同じ規則が当たる。属性が消えると、コンポーネントからは引数を省いたのと同じに見える。根要素への透過（ADR-0010）もされない

## 理由

### null と undefined で属性を消す

- 値によって属性の有無を表す点は、主要なテンプレートの仕組みに共通する
  - Vue 3 は、束縛した値が `null` か `undefined` なら属性を消す（[Template Syntax](https://vuejs.org/guide/essentials/template-syntax.html#attribute-bindings)）
  - React は、`null` と `undefined` を `removeAttribute` で消す（react-dom の [`setValueForAttribute`](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom-bindings/src/client/DOMPropertyOperations.js)）
  - Svelte は、真偽属性以外は値が `null` か `undefined` なら付けない（[Basic markup](https://svelte.dev/docs/svelte/basic-markup)）
  - Lit は、`null` と `undefined` を空文字として属性に出す。消すには専用の値 `nothing` を使う。`ifDefined(v)` は `v ?? nothing` の簡略形である（[Expressions](https://lit.dev/docs/templates/expressions/#removing-attribute)）
- 消すための専用の値を持つのは Lit だけである。flat-html の式に専用の値を足すと、新しい語彙になる。すでに式で書ける `null` を使えば、語彙は増えない
- DOM の反映と同じ向きである。HTML 仕様では、`DOMString?` 型で内容属性を反映する IDL 属性に `null` を設定すると、内容属性が消える（[Reflecting content attributes in IDL attributes](https://html.spec.whatwg.org/multipage/common-dom-interfaces.html#reflecting-content-attributes-in-idl-attributes)）。`aria-current` を反映する `ariaCurrent` はこの型なので（[WAI-ARIA の ARIAMixin](https://w3c.github.io/aria/#ARIAMixin)）、`el.ariaCurrent = null` で属性が消える
- 値全体が 1 つの `{{ }}` の属性に限るのは、既存の出力が変わる範囲を、値を丸ごと式に任せた属性に絞るため。値の一部が `null` の属性まで消すと、`href="{{ base }}pages/"` のように文字列を組み立てる属性が、一部の欠けで丸ごと消える

### false は消さない

- ARIA の真偽の状態では、`"false"` と属性なしの意味が違う。`aria-expanded` は、`false` なら制御する要素が閉じていることを表し、属性なし（既定の `undefined`）なら開閉する要素を持たないことを表す（[WAI-ARIA の aria-expanded](https://w3c.github.io/aria/#aria-expanded)）
- Vue 3 は 3.x への移行で、真偽属性以外の `false` を消さずに `"false"` を出すよう変え、消すには `null` か `undefined` を使うとした。理由に `aria-*` が書きにくかったことを挙げている（[Attribute Coercion Behavior](https://v3-migration.vuejs.org/breaking-changes/attribute-coercion.html)）
- React は、`aria-*` と `data-*`、それに `"true"` と `"false"` を値に取る列挙属性の一覧（`contentEditable` `draggable` `spellCheck` など）に限って `false` を `"false"` として残し、他の属性では消す（react-dom の [`setValueForAttribute`](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom-bindings/src/client/DOMPropertyOperations.js) と [`setProp`](https://github.com/facebook/react/blob/v19.3.1/packages/react-dom-bindings/src/client/ReactDOMComponent.js)）。Svelte は真偽属性だけ、偽なら消す
- React と Svelte は、真偽属性の一覧や属性名の接頭辞といった属性の種類で振る舞いを分ける。flat-html は展開に徹し（ADR-0002）、属性の種類を知らない。一覧に頼らず、`false` は常に `"false"` に揃える

### 今足す

- 具体的な必要（見本サイトのナビ）が出た。足すのは評価結果の扱いの規則 1 つで、文法は広げない

## 却下した選択肢

- 条件付き属性の新しい記法を足す: 書く側の語彙が増える。`null` で消す規則なら、すでにある式だけで書ける
- 式に三項演算子を足す: ADR-0012 の式の範囲を広げる。三項演算子があっても、値で属性を消す規則がなければ `cond ? 'page' : ''` は空の属性を残す。規則があれば、分岐は `&&` と `||` で足りる
- 何もしない（`<template if>` で 2 通り書く）: 同じ要素を 2 回書くので、片方だけ直す誤りが起きる。条件付きの属性が 2 つになれば 4 通り要る
- `false` も消す: `aria-expanded="false"` のような ARIA の偽の状態を、真偽値からそのまま出せなくなる。真偽属性だけ消すには属性の種類の一覧が要り、flat-html は属性の種類を知らない（ADR-0002）

## 影響

- 引数を省いたときの属性は、空の値ではなく「属性なし」になる。たとえばテンプレートの `<img src="…" alt="{{ alt }}">` は、参照側が `alt` を省くと `alt` が付かない。装飾画像として空の代替テキストにするなら、参照側で `alt=""` を明示する。空文字列の引数は空の値として残る
- 真偽属性（`disabled` `hidden` など）を比較の結果で出すと、偽のとき `"false"` になって属性が残り、真偽属性としては真になる。偽のとき消すには `|| null` を付ける。ただし `{{ cond || null }}` では真のときの値が `"true"` になり、HTML 仕様は真偽属性の値に `"true"` と `"false"` を許さない（[Boolean attributes](https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#boolean-attributes)）。値を属性名にして `disabled="{{ cond && 'disabled' || null }}"` と書く
- 見本サイトのナビは、各項目を `<a>` 1 つで書く形に改めた
