# 決定記録（ADR）

1 件 1 ファイル。決定を覆すときは新しいファイルを足し、古いものは「置換済み」にして残す。
書式: 状態 / 日付 / 文脈 / 決定 / 理由 / 却下した選択肢 / 影響。

| 番号 | 題名 |
|---|---|
| [0001](./0001-monorepo-and-name.md) | リポジトリはライブラリ群のモノレポ flat-html |
| [0002](./0002-flat-html-scope.md) | flat-html の責務は展開と集約まで |
| [0003](./0003-component-shape.md) | コンポーネントは場合分け、Custom Element は light DOM 既定 |
| [0004](./0004-component-spec.md) | 各コンポーネントに仕様 4 項と JS なしテストを必須にする |
| [0005](./0005-css-package.md) | CSS は class なしで使える独立パッケージ |
| [0006](./0006-motion-package.md) | アニメーションは独立パッケージとして枠だけ予約 |
| [0007](./0007-toolchain-and-first-slice.md) | 操作は vp 経由、最初の縦切りは accordion |
| [0008](./0008-build-flat-html-ourselves.md) | flat-html は最初から自作、初期は TypeScript + parse5 |
| [0009](./0009-testing.md) | テストは vitest ブラウザモード |
| [0010](./0010-reference-and-props.md) | 参照名は出力要素名と同じ、属性はそのまま引数 |
| [0011](./0011-slots.md) | 差し込みはネイティブ slot と同じ語彙 |
| [0012](./0012-expressions.md) | 式は `{{ }}` と `<template if/each>` の最小範囲 |
| [0013](./0013-asset-aggregation.md) | 集約は普通の `<link>` と `<script>` を head へ移すだけ |
| [0014](./0014-css-tokens-and-color-scheme.md) | トークンは最小粒度、明暗は light-dark() で一元化 |
| [0015](./0015-package-layout.md) | パッケージの並びと elements の入口モジュール |
| [0016](./0016-component-order.md) | ネイティブで済むものから順に作る |
| [0017](./0017-rename-publish-license.md) | 改名は今、公開は見本サイトを出す時点、MIT |
| [0018](./0018-docs-layout.md) | 文書の置き場 |
| [0019](./0019-pages-and-layouts.md) | ページは完全な HTML 文書、レイアウトは `<link rel="layout">` |
| [0020](./0020-vite-plugin.md) | flat-html は Vite プラグインとして作る（0002 の一部を置換） |
| [0021](./0021-web-vitals.md) | Web Vitals の検査を 2 段階で入れる |
| [0022](./0022-color-scheme-control.md) | 明暗の切り替えは 3 状態のラジオグループ（0014 の一部を置換） |
| [0023](./0023-notation-details.md) | 記法の細目（実装で確定した解釈） |
| [0024](./0024-asset-resolution-and-layer-order.md) | 資産の解決はテンプレート基準、層の順序は各スタイルシートが宣言（0005 / 0013 を補う） |
