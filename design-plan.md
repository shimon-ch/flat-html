# 個人サイト設計思想 たたき台

## 根底にある問い

**「これは本当にJS/Custom Elementでなければ実現できないのか？」を常に先に問い、答えがNoなら足さない。**

具体的な要件が出てきた時に初めてその分だけ複雑さを足す。流行っているから・強力だからという理由では足さない。

---

## 判断の三軸

以下は実質、同じ一つの問い（「ネイティブが既にカバーしているか」）に収斂する。

1. ネイティブのプリミティブ（`<button>` `<details>` `<dialog>` `<form>`）で表現できるか
2. 自分がコントロールできない消費コンテキストからのスタイル隔離（カプセル化）が本当に要るか
3. そのプリミティブが持つセマンティクス（role・キーボード操作・フォーカス管理）を捨ててまで得たいものがあるか

ネイティブがカバーしていない場合のみ、Custom Elementのコストを払う価値が出てくる。その際は ElementInternals / cross-root ARIA delegation など、正しく作るための道具は現在揃っている（両者ともBaseline到達済み）。

---

## JS依存というギャップへの態度

- Declarative Shadow DOM（DSD）は「見た目・構造の存在」は解決するが、「振る舞いの存在」（アップグレードギャップ）は原理的に解決しない
- 方針: **ギャップを消す**のではなく**ギャップを無害化する**
  - MPAを基本にする（SPAはナビゲーションのたびにギャップを再生成する構造そのものを持ち込むため過剰）
  - ネイティブ要素をベースに実装し、JS未実行でも壊れて見えない設計にする（参照例: GitHubのいいねボタンのform実装 = Hijaxパターン）
  - Custom Elementのlight DOM/ネイティブslotに静的コンテンツを置く場合、slot投影自体はJS実行を待たない（アップグレードギャップの影響を受けない）

---

## 再利用（コンポジション）の設計

- ブラウザネイティブに「タグ名を書くだけで宣言的に展開される」仕組みは現状存在しない（Declarative Custom Elements / HTML Modulesは10年以上ドラフトのまま、ブラウザベンダーの正式コミットなし）
- 再利用は**ビルド/サーバー時に倒す**のが結論
- Astroのようなフルフレームワーク（クライアントランタイム・ルーター・ハイドレーションモデルを抱える）は過剰
- 候補として検討したもの:
  - **11ty + WebC**: Custom Element風の構文で書き、ビルド時に完全展開、クライアントJSはデフォルトゼロ。`is-land` と組み合わせて選択的hydrationも可能。11ty本体の枯れた機能群（Markdown処理・コレクション・ページネーション等）を活かせる
  - **Enhance**: 本物のCustom Element構文をサーバーサイドテンプレート言語として使う、より素のプラットフォームAPIに近い設計
  - **PostHTML**: 「PostCSSのHTML版」。コアはパーサー+ツリーAPI+シリアライザのみで、Markdown処理やデータカスケードのような11tyの「過剰」を持たない。`posthtml-include` / `posthtml-extend` / `posthtml-custom-elements` などプラグインで必要な変換だけ足す。ただしエコシステムは小規模・低調気味
  - （検討したが不採用）ox-content: Rust製の高速Markdown/MDXエンジン+SSG。ただし「component islands」はReact/Vue/Svelte等のJSXベースで、Custom Element/Web Components路線とは軸が異なる

### 現在の方向性: PostHTML + Vite

- 責務を完全分離: PostHTML＝「HTMLがどう組み立てられているか」、Vite＝「どう配信・バンドル・最適化するか」
- 実装: `@vituum/vite-plugin-posthtml`（`transformIndexHtml`フックに接続）、マルチページ構成には`Vituum`
- 注意点: PostHTMLが解決する間接的な依存関係（include先のパーシャル等）はViteのモジュールグラフに乗らない。`server.watcher.add()` + `server.ws.send({ type: 'full-reload' })` で明示的に橋渡しが必要

### 自作ツール（検討中）

PostHTMLのエコシステムが小規模・低調気味なため、自作を検討。

**動機**
1. Rustでツール自体をbuildすることによる配布物（node_modules）サイズの最小化・依存パッケージ数の削減（esbuildがBabel系を置き換えた時と同じパターン。posthtml-*の連鎖を単一ネイティブバイナリに畳む）
2. Vite+/oxcエコシステムネイティブ（Rolldownのネイティブプラグインとして書ければ、JS↔Rust境界コストを削減できる）
3. TSネイティブなプラグイン作者体験（napi-rsの型自動生成を活用。既存PostHTMLプラグインは型なしの素のJSが多い）
4. Rustの学習を兼ねる

**設計方針**
- パーサーは自作せず、既存クレート（`html5ever`ベース、実務的には`scraper`＝html5ever + selectors + CSSセレクタクエリAPI）に乗せる
  - `markup5ever_rcdom`は公式に「プロダクション品質ではない」と明記されているため学習用CLIの最初の一歩には良いが、実プロダクトの土台にはscraperを検討
  - `kuchiki`は2023年アーカイブ済み、非推奨
  - `tl`は高速だが仕様準拠のtree construction algorithm（foster parenting等のエラー回復ルール）を完全実装していないため、ブラウザの実際の描画結果とズレる可能性がある → 今回の用途には不向き
  - `lol_html`はストリーミング型でフルなミュータブルツリーを保持しないため、複数パスの変換には不向き
- 定番の変換（include/extend/カスタムタグ展開）はRustのコア機能として組み込み、境界を一切またがない設計に
- ユーザーが書くカスタム変換ロジックのみNAPI経由でJS/TSコールバックを呼ぶ（ox-contentの`@ox-content/napi`と同様の構造）
- 配布: NAPI-RS + `optionalDependencies`パターン（本体は薄いJSラッパー、実バイナリはプラットフォーム別パッケージとして分離。esbuild/swc/oxcと同じ方式）

**学習の進め方**
1. The Rust Book + rustlingsで所有権・借用・ライフタイムを先に通す（1〜2週間、プロジェクトには触らない）
2. `html5ever` + `markup5ever_rcdom`で「読み込んでそのままシリアライズし直すだけ」のCLIから開始
3. `include`タグの単純な変換を1つ実装（`Rc<RefCell<Node>>`によるツリーのミュータブル操作の壁を経験する）
4. NAPI-RSでNode向けバインディングを公開
5. Viteプラグインとしてラップ

---

## Webサイト全体の階層構造

```
1. Rustツール       … HTML合成レイヤー（データもreactivityも知らない、静的合成に徹する）
2. コンポーネントライブラリ … 判断の三軸をコンポーネント単位で適用する層
3. Webサイト        … 1と2を組み合わせて実際にページを組む層
```

依存の向きは下から上への一方向。逆流（サイト固有の都合がツール/ライブラリに漏れる）を避ける。

---

## SPAについて

- 「画面遷移を滑らかにしたいだけ」なら **View Transitions API** で十分（MPAのまま、フレームワーク不要）
- 「クライアント状態の永続化」が具体的要件としてある場合のみ、フレームワーク導入を検討
  - **Solid（`solid-element`）**: Solidコンポーネントを直接本物のCustom Elementにコンパイルできる。「タグ名を書けば振る舞いが解決する」というメンタルモデルを崩さない
  - React: `react-to-webcomponent`のようなラッパーが必要になり、Solidほど自然にCustom Element化しない
- 現時点の結論: **SSR（DSD）はあってよいが、SPAは用途に対して過剰**。View Transitions APIで様子を見て、reactivityが本当に必要になった時点でSolidアイランドをピンポイント導入する

### アイランドとの接続パターン

- 静的コンテンツをCustom Elementの**light DOM/ネイティブslot**経由で子要素として渡す場合、slot投影はJS実行を待たない＝アップグレードギャップの影響を受けない
- フレームワークの`props.children`として取り込む場合は、その瞬間からreactiveシステムの管理下に入る＝ギャップの影響を丸ごと引き受ける
- 境界をどこに置くかで影響範囲が変わる。slotで止められる部分は極力止め、本当にreactivityが必要な最小限だけをフレームワークに渡す

### データ取得の扱い

- ビルド時に確定しているデータ: ツールの外（ビルドスクリプト側）でfetchし、テンプレートにデータとして注入する。ツール自体に「データ取得」機能は持たせない
- クライアントでリアクティブに取得するデータ（フィルタ変更・ページネーション・ポーリング等）: 100% Solidコンポーネント内部（`createResource`等）で完結。HTML合成ツールとは時間軸上重なる瞬間がないため、「繋ぐ」仕組み自体が不要
- SSRで初期データを見せたい場合は `<script type="application/json">` で初期データを埋め込み、アイランド起動時に読ませる（これも静的データ注入と同じ扱いで専用プラグイン不要）

---

## 命名

**仮決定: `flat-html`**（publish 前なので変更可能。実装が進んで違和感がなければ本採用）

採用理由:

- ツールの動作そのものを指す。ネストしたタグ参照をビルド時に展開して**平坦な HTML にする**
- 思想も同時に表す。ランタイムの層を重ねない = flat
- レイヤー1（HTML 合成ツール）の動作を、レイヤー1 の語彙で名付けている

空き状況（確認日 2026-09-10）: npm・crates.io ともに `flat-html` / `flat_html` 空き。crates.io に単体の `flat`（11,669 DL、多次元データを平坦なテキスト平面に投影）は存在するが `flat-*` の兄弟エコシステムはないため、誤認リスクは低い。

### 名前が確定を要するタイミング

`cargo publish` / `npm publish` の時点。それまでは `Cargo.toml` の 1 行で変更できる。crates.io は削除・名前の再利用が不可のため npm より厳しい。

### 検討して却下した候補

- `island-html` — 空きはあるが、アイランドアーキテクチャの本質は選択的ハイドレーション。**レイヤー1 のツールが「知らない」と明言している関心事**であり、レイヤー3 の語彙でレイヤー1 を名付けることになる。npm で見た人は `client:load` 相当のハイドレーション指示子を期待する
- `twilight-html` — crates.io に `twilight` エコシステム（Discord API ライブラリ群、`twilight-http` / `twilight-gateway` 等）が確立済み。その公式コンポーネントと誤認される
- `bits-html` — 衝突はない（npm・crates.io ともに空き）が、Rust／システム文脈では「ビット」が第一義。`bits` クレート自体が x86 BMI ビット操作
- 以前に却下: super-html, fiber-html, bliz-html, wonder-html, htm1, hpml, lightning-html, weave-html, splice-html, graft-html, 組む(kumu) 等（既存プロダクト/ライブラリとの衝突、または本人の好みに合わず）
