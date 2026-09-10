# ADR-0015: パッケージの並びと elements の入口モジュール

- 状態: 採択
- 日付: 2026-09-10

## 決定

```
packages/core       @flat-html/core      flat-html 本体。API と CLI
packages/vite       @flat-html/vite      Vite プラグイン（薄い皮）
packages/css        @flat-html/css       class なしで使える CSS
packages/elements   @flat-html/elements  コンポーネント
packages/motion     @flat-html/motion    アニメーション。枠だけ
apps/site                                見本サイト。公開しない
```

- core と vite は分ける
- elements は 1 パッケージ。コンポーネントごとに独立した入口モジュールを持ち、barrel（全部を読み込む index）を作らない
- package.json に `sideEffects` を書かない。既定（すべて副作用あり）のままにする

## 理由

- core と vite を分けるのは、ADR-0002 の「核は Vite に依存しない」を依存関係の形でも表すため
- テンプレートと CSS は「参照した分だけ展開される」ので、パッケージを分けなくても使わないものはページに入らない
- JS の読み込みは ADR-0013 のとおりテンプレートの `<script type="module" src>` で行う。Vite にとってはエントリなので、ファイル単位で消されることがなく、ツリーシェイキングの設定に依存しない
- `customElements.define` は副作用であり、`sideEffects: false` を書くと束ね器が定義モジュールを丸ごと落としうる。書かなければ既定で保持される。barrel を作らない限り、消したい無駄なファイルも存在しないので、列挙する必要もない
- 消費側は何も書かない。`sideEffects` はライブラリ側の package.json の事項であり、しかも書かないのが正しい
