# ADR-0003: コンポーネントは場合分け、Custom Element は light DOM 既定

- 状態: 採択
- 日付: 2026-09-10

## 文脈

コンポーネント 1 つが何で構成されるかを決める必要がある。判断の三軸（design.md）を個々のコンポーネントに適用する形を定める。

## 決定

- ネイティブ要素と Open UI 卒業済み機能で目的を果たせるものは、HTML テンプレートと CSS だけで構成し、JS を持たない
- APG がキーボード操作やフォーカス管理を要求し、ネイティブに対応物がないものだけ Custom Element を足す
- Custom Element は light DOM を既定とし、shadow DOM は隔離が要ると判断したときだけ使う

## 理由

- 三軸の思想そのもの
- Popover、Invoker Commands、Exclusive Accordion、Customizable Select を使えば、相当数の UI が JS なしで組める
- light DOM なら JS 未実行でも子要素がそのまま描画され、グローバル CSS がそのまま当たり、cross-root ARIA（Baseline 未到達）の問題を避けられる

## 却下した選択肢

- 常に JS なし: Tabs や Combobox の APG 要件を満たせない
- 常に Custom Element: ネイティブで済むものに JS を足すことになる
- shadow DOM 既定: ラベル参照と CSS の当て方が複雑になる

## 影響

- Custom Element を足す判断は、仕様 4 項（ADR-0004）の「JS が足す強化」に理由を書く
