# flat-html 設計思想

flat-html は「素朴な HTML 部品群」のモノレポである。構成要素は 4 つ。

| パッケージ | 役割 |
|---|---|
| `@flat-html/vite` | HTML の解析から変換までを担う Vite プラグイン。展開と集約だけを行う |
| `@flat-html/css` | class なしで使える CSS |
| `@flat-html/elements` | ネイティブ優先のコンポーネント |
| `@flat-html/motion` | アニメーション。枠だけ予約 |

個々の決定は [decisions/](./decisions/) に 1 件 1 ファイルで記録する。用語は [glossary.md](./glossary.md) に従う。検討の経緯は [history/](./history/) に残す。

## 根底にある問い

**「これは本当に JS / Custom Element でなければ実現できないのか」を常に先に問い、答えが No なら足さない。**

具体的な要件が出てきたときに初めて、その分だけ複雑さを足す。流行っているから、強力だからという理由では足さない。これを「素朴」と呼ぶ。

## 判断の三軸

以下は「ネイティブが既にカバーしているか」という一つの問いに収斂する。

1. ネイティブのプリミティブ（`<button>` `<details>` `<dialog>` `<form>` と Open UI の卒業済み機能）で表現できるか
2. 自分がコントロールできない消費コンテキストからのスタイル隔離が本当に要るか
3. そのプリミティブが持つセマンティクス（role、キーボード操作、フォーカス管理）を捨ててまで得たいものがあるか

ネイティブがカバーしていない場合のみ、Custom Element のコストを払う。その場合も light DOM を既定とし、shadow DOM は隔離が要るときだけ使う（[ADR-0003](./decisions/0003-component-shape.md)）。

補足: cross-root ARIA（Reference Target）は 2026-09 時点で Baseline 未到達（Chrome 152 以降のみ）。shadow DOM を避ける理由の一つ。

## UI の目的を JS なしで果たす

各コンポーネントは、次の 4 項を仕様として必ず書く（[ADR-0004](./decisions/0004-component-spec.md)）。

1. **目的**: この UI が利用者に何をさせるためのものか
2. **JS なしで到達できる状態**: HTML だけで目的のどこまでが成立するか
3. **JS が足す強化**: JS があるとき何が加わるか。なければ「なし」
4. **出力の根要素**: 展開後にどの要素が最上位になるか

例: いいねボタン。目的は「利用者が賛意を表明し、それが記録される」。JS なしで到達できる状態は `<form method="post">` と `<button>` による送信。JS が足す強化は、ページ遷移なしの送信と即時の表示更新。この例の論点は「HTML で目的を果たせるか」であり、サーバーの有無ではない。ライブラリは消費するサイトの構成を仮定しない。

## JS 依存というギャップへの態度

- Declarative Shadow DOM は「見た目と構造の存在」は解決するが、「振る舞いの存在」（アップグレードギャップ）は原理的に解決しない
- 方針は、ギャップを消すのではなく無害化する。MPA を基本にし、ネイティブ要素をベースに実装し、JS 未実行でも壊れて見えない設計にする
- 消す選択肢として `blocking="render"` があるが、初回描画を遅らせる代償があるため、ページ単位の判断とする

## 再利用はビルド時に倒す

ブラウザには「タグ名を書くだけで宣言的に展開される」仕組みが存在しない（Declarative Custom Elements は 10 年以上ドラフトのまま）。再利用はビルド時の展開で行い、ブラウザには展開済みの HTML だけを渡す。展開の場所はビルド時でもリクエスト時でもよく、出力は同じ。配布物は「ツールへの入力」であり「ブラウザへの入力」ではない。

flat-html の責務は展開と集約に限る（[ADR-0002](./decisions/0002-flat-html-scope.md)）。Vite プラグインとして作り、展開と集約の本体は純粋関数として内側に置く（[ADR-0020](./decisions/0020-vite-plugin.md)）。記法は HTML が既に持つ語彙を借り、新しい語彙を最小にする。

- 参照はタグ名（[ADR-0010](./decisions/0010-reference-and-props.md)）
- 差し込みはネイティブの slot と同じ語彙（[ADR-0011](./decisions/0011-slots.md)）
- 資産は普通の `<link>` と `<script>`（[ADR-0013](./decisions/0013-asset-aggregation.md)）
- ページは完全な HTML 文書で、レイアウトは `<link rel="layout">`（[ADR-0019](./decisions/0019-pages-and-layouts.md)）

## CSS

class なしで使える独立パッケージ。正しい HTML を書けばそのまま整う。セレクタは要素と ARIA 状態に当て、見た目の変種だけ data 属性で表す（[ADR-0005](./decisions/0005-css-package.md)）。Baseline に達した機能は、その場面で適切なら躊躇なく使う。

## 層構造

```
1. @flat-html/vite     … HTML 合成。データも reactivity も知らず、展開と集約に徹する
2. @flat-html/css      … class なしの CSS
3. @flat-html/elements … 三軸をコンポーネント単位で適用する層。css に依存する
4. 消費するサイト       … 1 から 3 を組み合わせてページを組む。このリポジトリでは apps/site（見本）
```

依存の向きは上から下への一方向。逆流（サイト固有の都合がライブラリやツールに漏れること）を避ける。見本サイトはこのリポジトリ内で唯一の消費者なので、見本サイトの都合で API を足したくなったら、それが一般の消費者にも要るかを一度問う。

## SPA について

- 画面遷移を滑らかにしたいだけなら View Transitions と Speculation Rules で足りる
- クライアント状態の永続化が具体的要件として出た場合のみ、Solid（`solid-element`）による島の導入を検討する
- 静的コンテンツは Custom Element の light DOM に置き、reactivity が本当に必要な最小限だけをフレームワークに渡す
