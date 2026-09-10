# ADR-0008: flat-html は最初から自作、初期は TypeScript + parse5

- 状態: 採択
- 日付: 2026-09-10

## 文脈

PostHTML のエコシステムは小規模で、記法も他人の作法に縛られる。flat-html の本質は「解析から変換までの工程を速くする」ことであり、Rust は最適化の段階で入る。

## 決定

- flat-html を最初から自作する。記法は自分で決める
- 初期実装は TypeScript で、解析器は `parse5` に載せる
- 速度が問題になった箇所から Rust に置き換える（napi-rs、`html5ever` 系の解析器）

## 理由

- 初期を TypeScript で書いても製品の形は同じ
- 動く TypeScript 版を Rust に移植する方が、仕様が手元にある分だけ迷いが減る
- `parse5` は仕様準拠の解析器で、ブラウザのエラー回復と一致する。posthtml の解析器（htmlparser2 系）はそうでない

## 却下した選択肢

- posthtml-component を記法の基準にして後から差し替える: 差し替え時に記法の互換を取る作業が残る
- posthtml のプラグインとして自作: 仕様非準拠の解析器を引き受ける

## 却下した Rust 側の候補（経緯）

`kuchiki` は 2023 年にアーカイブ済み。`tl` は仕様準拠の tree construction を完全実装していない。`lol_html` はストリーミング型で複数パスに不向き。`markup5ever_rcdom` は公式に「プロダクション品質ではない」。実務的には `scraper`（html5ever + selectors）が候補。

## 補足

Rolldown のネイティブプラグインは第三者に公開された API ではない（2026-09 時点）。JS と Rust の境界コスト削減を自作の動機にはしない。
