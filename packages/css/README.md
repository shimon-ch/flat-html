# @flat-html/css

class なしで使える CSS。正しい HTML を書けばそのまま整う。

## 使い方

```html
<meta name="color-scheme" content="light dark" />
<link rel="stylesheet" href="…/flat.css" />
```

または CSS から:

```css
@import "@flat-html/css";
```

`<meta name="color-scheme" content="light dark">` はページ側に必ず書く。トークンは `light-dark()` で定義されているので、`color-scheme` を切り替えるだけで全体が追従する。

## 層

`flat.css` が `@layer reset, base, components, site;` を宣言する。順序はここでだけ決まり、後の層が必ず勝つ。

| 層 | 中身 |
|---|---|
| `reset` | 最小の初期化 |
| `base` | トークンと、ネイティブ要素・ARIA 状態への既定スタイル |
| `components` | `@flat-html/elements` が使う |
| `site` | 消費するサイトが書く。常に最後に勝つ |

上書きは `site` 層に書く。打ち消し用の属性はない。

```css
@layer site {
  :root {
    --flat-accent: rebeccapurple;
  }
  button {
    border-radius: 0;
  }
}
```

## セレクタ

要素と ARIA 状態にだけ当てる（`details[open]`、`[role="tab"][aria-selected="true"]` など）。クラスは使わない。見た目の変種は data 属性で表す（`button[data-variant="primary"]`）。

## トークン

| 名前 | 既定値 |
|---|---|
| `--flat-bg` | `light-dark(#ffffff, #121212)` |
| `--flat-fg` | `light-dark(#1a1a1a, #e6e6e6)` |
| `--flat-accent` | `light-dark(#0b57d0, #8ab4f8)` |
| `--flat-border` | `light-dark(#c8c8c8, #444444)` |
| `--flat-space` | `0.5rem`。倍数は `calc()` で使う側が導く |
| `--flat-radius` | `0.25rem` |
| `--flat-font` | `system-ui, sans-serif` |
| `--flat-font-size` | `1rem` |
| `--flat-line-height` | `1.6` |
