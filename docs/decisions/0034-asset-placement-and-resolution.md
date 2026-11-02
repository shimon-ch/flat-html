# ADR-0034: 資産の URL はページからの相対を基本にし、解決できなければ例外にする。`<head>` の資産も末尾へ移すまま

- 状態: 採択（ADR-0013 / ADR-0020 / ADR-0023 / ADR-0024 を補う。置換はしない）
- 日付: 2026-11-02

## 文脈

コードレビューで、`@flat-html/vite` の資産の扱いについて 3 つの指摘があった。穴 1 と穴 2 は直し、指摘 3 は今の振る舞いを保つ。

### 穴 1: 本番のビルドで、資産の URL が `/@fs/<絶対パス>` のまま残る

ADR-0024 は、テンプレートとレイアウトに書かれた資産を、そのファイルの位置を基準に解決すると決めた。プラグインは解決したファイルを、開発サーバーでもビルドでも `/@fs/<絶対パス>` の URL にしていた。

ビルドがこの URL を解決できるのは、import に変わる資産（`media` も `disabled` もない `<link rel="stylesheet">` と `<script type="module">`）だけだった。`<link rel="preload">`、`<link rel="modulepreload">`、`media` 付きの `<link rel="stylesheet">` は URL が書き換わらないまま出力に残る。本番では 404 になり、ビルド機の絶対パスが公開物に出る。

### 穴 2: 解決できない資産を黙って残す

`resolveAsset` が null を返すと、URL は書かれたまま残り、後で Vite がページの位置から解決していた。テンプレートの `href="./indx.css"` のような誤字は、ページの隣に同じ名前のファイルがあれば黙ってそれを読み込み、なければページの側でエラーや警告になる。どちらの場合も、誤字のあるテンプレートとその行は示されない。ADR-0023 が `flat-*` 参照について決めた「誤字を黙って通さない」と食い違う。

### 指摘 3: 最初から `<head>` にある資産も末尾へ動き、カスケードの順序が変わる

ADR-0013 の集約は、文書中のすべての資産を `<head>` の末尾へ移していた。`<head>` が `<link rel="stylesheet" href="/lib.css"><style>p{color:red}</style>` なら、出力では `<link>` が `<style>` の後ろに回る。lib.css の同じ詳細度の規則が後に来て、ページ側の上書きに勝つ。ADR-0013 の理由に書いた「移動は書いた HTML の意味を変えない」に反する。レイアウトの `<head>` の資産も同じで、合流でページ側 `<head>` の子が後ろに入ったあと、その後ろへ回っていた。

## 決定

### 資産の URL をページからの相対パスにする（ADR-0024 を補う）

- テンプレートとレイアウトに書かれた資産の URL を、ページのファイル（`transformIndexHtml` の `ctx.filename`）のディレクトリからの相対パスにする。区切りは `/` とし、`./` か `../` で始める
- ビルド（Vite の `command` が `"build"`）では、資産のファイルが Vite の root の外にあっても相対パスにする
- 開発サーバーでは、資産のファイルが root の中にあるときだけ相対パスにする。root の外にあるときは `/@fs/<絶対パス>` にする
- 相対パスにできないとき（Windows でページと資産のドライブが違い、`path.relative` が絶対パスを返すとき）は、ビルドでも開発サーバーでも `/@fs/<絶対パス>` にする
- flat-html は URL に `base` を付けない
- 変えるのはプラグインが `resolveAsset` で返す URL だけで、純粋関数 `transform` は変えない（ADR-0020）

### ファイルの指定子が解決できなければ例外にする（ADR-0023 / ADR-0024 を補う）

- テンプレートとレイアウトに書かれた資産のうち、ファイルの位置を基準に解決する指定子（空でなく、`/` で始まらず、スキームを持たず、`{{` を含まないもの）について、`resolveAsset` が null を返したら `TemplateError` にする。パスはその資産を書いたファイル、行はその要素の行とする
- `/` で始まる URL とスキームを持つ URL は解決しないので、例外にもしない。書かれたまま Vite に渡る
- `{{` を含む URL も解決せず、例外にもしない。式の評価の後の値のまま Vite に渡る。解決は式の評価より前に行うので、評価の後の値はファイルの位置から解決できない
- `resolveAsset` が渡されなければ、従来どおり何も書き換えず、例外にもしない
- プラグインは、`./` か `../` で始まる指定子をファイルシステムで、それ以外（パッケージ名の指定子と Vite の別名）を Vite の解決器（`config.createResolver()`）で解決する。Vite の解決器は、`resolve.alias` と、`exports` の `import` 条件などの Vite の解決条件を使う
- どちらも、指定子の最初の `?` か `#` から後ろを外して解決し、URL を作るときに付け直す
- プラグインの `resolveAsset` が null を返すのは、解決先が実在するファイルでないときである

### `<head>` にある資産も、今のまま末尾へ移す（ADR-0013 を確かめる）

- 集約は、最初から `<head>` にある資産も含めて、すべての資産を文書順のまま `<head>` の末尾へ移す。ADR-0013 の決定を変えない
- 資産とインラインの `<style>` のどちらを勝たせるかは、文書の順序ではなく層（ADR-0024）で決める。インラインの `<style>` で上書きしたいときは、`@layer site` の中に書く

## 理由

### 穴 1: Vite のビルドは、相対 URL ならどの種類の資産も解決する

Vite のビルドが HTML を処理するのは `vite:build-html` プラグイン（Vite の `plugins/html.ts` の `buildHtmlPlugin`）の `transform` である。このリポジトリが使う `@voidzero-dev/vite-plus-core` 1.3.0 で読んで確かめた。

- `<script type="module" src>` は、ページの入口モジュールに `import "<src>"` を足す。解決は `this.resolve(url, id)` で、モジュールの解決規則が HTML ファイルの位置から行う
- `<link href>`（`getNodeAssetAttributes` が拾う属性）は、`isCSSRequest(url)` が真で `media` も `disabled` もなければ、同じく `import` に変わる。それ以外は `processAssetUrl` から `urlToBuiltUrl(this, url, id, shouldInline)` へ渡る
- `urlToBuiltUrl`（`plugins/asset.ts`）は、`url` が `/` で始まれば `path.join(root, url)`、そうでなければ `path.join(path.dirname(importer), url)` をファイルとみなし、`fileToBuiltUrl` で読み込んでハッシュ付きの資産として出す。`/@fs/<絶対パス>` は `<root>/@fs/<絶対パス>` という存在しないファイルになり、読み込みの ENOENT を `processAssetUrl` が握りつぶして、URL をそのまま返す

したがって `/@fs/` は import に変わる資産でしか通らず、相対パスはどちらの経路でも通る。相対パスはファイルシステムのパスとして結合されるので、root の外（別パッケージのコンポーネント）のファイルも指せる。出力の URL には Vite が `base` を付ける。

開発サーバーで root の外のファイルに `/@fs/` を使うのは、それらを配信させるためである。ブラウザは URL のパスの `..` を origin の根より上へたどれないので、相対パスでは root の外のファイルを指せない。`/@fs/` の URL には、Vite の開発時の HTML 変換が `base` を付ける。

root の中のファイルは、開発サーバーでも相対パスで指せる。ブラウザがページの URL から解決した URL を、Vite が root の中のファイルとして配信する。開発とビルドで同じ URL になるので、ページに直接書いた相対 URL と、テンプレートやレイアウトから同じファイルを指す URL が同じ文字列になり、重複除去（ADR-0013）で 1 つにまとまる。開発サーバーでだけ `/@fs/` にすると、同じ資産が開発では 2 つ残り、ビルドでは 1 つにまとまる。

### 穴 2: 誤字を見つけられるのはツールだけである

ADR-0023 は、解決できない `flat-*` 参照を例外にした。誤字が出力から静かに消えるのを避けるためである。資産の指定子も同じで、解決できなかった URL を残すと、Vite はそれをページの位置から解決する。テンプレートの位置を知っているのは flat-html だけなので、テンプレートのパスと行を示せるのも flat-html だけである。

残した URL が後でどうなるかも、種類によってばらばらだった。ビルドでは `<script type="module">` は解決の失敗で止まり、`media` のない `<link rel="stylesheet">` は警告を出して URL を残し、`media` 付きの `<link rel="stylesheet">` と `<link rel="preload">` と `<link rel="modulepreload">` は何も言わずに URL を残す。

### 指摘 3: 本番の Vite も同じ位置へ移すので、開発と本番の順序を揃える

- 本番のビルドでは、Vite 自身が import に変わる資産（`media` も `disabled` もない `<link rel="stylesheet">` と `<script type="module">`）を元の位置から外し、束ねた CSS と JS の要素を `</head>` の直前に入れる（`buildHtmlPlugin` の `generateBundle` の `injectToHead`）。flat-html を使わないページで確かめた。`<link rel="stylesheet" href="./lib.css"><style>…</style>` は `<style>…</style><link href="/assets/index-….css">` になる
- `<head>` の資産をその場に残しても、本番で順序が保たれるのは Vite が束ねない資産だけで、多くを占めるスタイルシートの順序は本番で変わる。開発サーバーでだけ順序が保たれると、開発と本番で見た目が食い違う。開発で正しく見えたものが本番で崩れるほうが、どちらでも同じ順序になるより危うい
- このライブラリは、層の順序（ADR-0024）でカスケードを決める。`@flat-html/css` と `@flat-html/elements` の規則はすべて層の中にあり、層の外の規則と `site` 層の規則は、文書の順序によらず勝つ

## 却下した選択肢

- ビルドでも `/@fs/` のまま、import に変わらない資産だけ別扱いにする: どの資産が import に変わるか（`isCSSRequest`、`media` と `disabled` の有無）を Vite の内部と同じに判定し続けることになり、ADR-0020 の「Vite は薄く使う」に反する。相対パスなら種類を問わず、ページに直接書いた相対 URL と同じ経路で解決される
- ビルドの URL を root からの `/` 始まりのパスにする: root の外のファイルを表せない
- 開発サーバーで、root の外のファイルも相対パスにする: root の外のファイルを指せない。開発サーバーの相対パスは root の中に限る
- 解決できない指定子を警告に留める: 誤字の URL が出力に残ることは変わらない。ADR-0023 の参照の扱いとも揃わない
- 最初から `<head>` にある資産はその場に残し、`<head>` の外の資産だけを末尾へ移す: 本番では Vite が束ねるスタイルシートと module script を `</head>` の直前へ移すので、順序が保たれるのは開発サーバーだけになり、開発と本番で見た目が食い違う

## 影響

- 本番のビルドの出力に `/@fs/` とビルド機の絶対パスが出なくなる。テンプレートとレイアウトの資産は、`<link rel="stylesheet">`（`media` の有無を問わない）、`<link rel="preload">`、`<link rel="modulepreload">`、`<script type="module">` のどれも、root の中でも外でも、ハッシュ付きの資産として出る
- import に変わらない資産の出し方は、ページに直接書いた相対 URL と同じく Vite が決める。小さい `media` 付きのスタイルシートは `build.assetsInlineLimit` に従って `data:` URL に埋め込まれる。`<link rel="preload">` と `<link rel="modulepreload">` は埋め込まれない。`<link rel="modulepreload">` の先の JS と `media` 付きのスタイルシートは、束ねられずにそのままの中身で写される
- 開発サーバーでも、root の中にあるテンプレートとレイアウトの資産は相対 URL になる。ページに直接書いた同じファイルの相対 URL と、重複除去で 1 つにまとまる。root の外の資産は `/@fs/` の URL になる
- Windows でページと資産のドライブが違うと、ビルドでも `/@fs/` の URL になる。この URL は、import に変わる資産でしか解決されない
- テンプレートとレイアウトの資産の指定子に誤字があると、そのファイルと行を示して変換が失敗する
- Vite の別名（`resolve.alias`）の指定子も、テンプレートやレイアウトの資産に書ける。パッケージ名の指定子と同じく Vite の解決器で解決するので、別名と、`exports` に `import` 条件しかないパッケージも解決される。解決先が実在するファイルでなければ例外になる
- 指定子の `?` と `#` から後ろ（`./a.css?inline`、`./font.woff2?v=1` など）は、解決した URL に残る
- `{{ }}` を含む資産の URL は例外にならず、式の評価の後の値のまま Vite に渡る。重複除去の鍵も評価の後の値になる
- `transform` を直接使い、自前の `resolveAsset` を渡す呼び出し側は、ファイルの指定子に null を返すと例外になる。書かれたまま残したいときは、受け取った指定子をそのまま返す
- `<head>` の資産の位置は変わらない。資産より後ろに置いたインラインの `<style>` は、資産より前に来る。資産の規則より優先させたいインラインの規則は `@layer site` に書く
- Vite の `ResolvedConfig.createResolver()` は、Vite の型で非推奨（`@deprecated`）になっている。推奨の `createIdResolver` は環境（`PartialEnvironment`）を引数に取り、`transformIndexHtml` の中から型の上で届かないので、今は非推奨の API を使う。Vite がこの API を外したら、解決の手段を見直す
- 本番のビルドでは、Vite が `<template shadowrootmode>` の中の `<link rel="stylesheet">` も CSS の import にして `<head>` へ移すので、宣言的 Shadow DOM のスタイルは影の木に残らない。flat-html は集約しないが、Vite の振る舞いで変わる。flat-html を使わないページでも同じで、この ADR の前からある
