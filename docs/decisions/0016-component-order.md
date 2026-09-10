# ADR-0016: ネイティブで済むものから順に作る

- 状態: 採択
- 日付: 2026-09-10

## 決定

順に、accordion、明暗切り替え、dialog、popover と invoker、customizable select。その後に tabs や combobox など Custom Element が要るものへ進む。見本サイトに必要な文書部品（ナビゲーション、見出し、コードブロック、リンク一覧）は、コンポーネントではなく CSS パッケージの base 層として合間に整える。

## 理由

- 「ネイティブで済むなら JS を持たない」を最初の数個で徹底し、Custom Element を足す判断の基準を自分の手で確かめてから Custom Element に進む。最初の Custom Element の設計が以後の基準になるため
- 見本サイトの都合から作り始めると逆流の入口になる

## 却下した選択肢

- APG の代表パターン（tabs）を先に: ネイティブ側の経験が薄いまま Custom Element の型を決めることになる
- 見本サイトの部品から: 逆流
