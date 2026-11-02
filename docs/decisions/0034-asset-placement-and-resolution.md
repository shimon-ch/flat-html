# ADR-0034: 資産の URL はビルドではページからの相対にし、解決できなければ例外にする。`<head>` の資産も末尾へ移すまま

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

### ビルドでは、資産の URL をページからの相対パスにする（ADR-0024 を補う）

- ビルド（Vite の `command` が `"build"`）では、テンプレートとレイアウトに書かれた資産の URL を、ページのファイル（`transformIndexHtml` の `ctx.filename`）のディレクトリからの相対パスにする。区切りは `/` とし、`./` か `../` で始める
- 開発サーバーでは、従来どおり `/@fs/<絶対パス>` にする
- 変えるのはプラグインが `resolveAsset` で返す URL だけで、純粋関数 `transform` は変えない（ADR-0020）

### ファイルの指定子が解決できなければ例外にする（ADR-0023 / ADR-0024 を補う）

- テンプレートとレイアウトに書かれた資産のうち、ファイルの位置を基準に解決する指定子（空でなく、`/` で始まらず、スキームを持たないもの）について、`resolveAsset` が null を返したら `TemplateError` にする。パスはその資産を書いたファイル、行はその要素の行とする
- `/` で始まる URL とスキームを持つ URL は解決しないので、例外にもしない。書かれたまま Vite に渡る
- `resolveAsset` が渡されなければ、従来どおり何も書き換えず、例外にもしない
- プラグインの `resolveAsset` が null を返すのは、相対パスの先にファイルがないときと、パッケージ名の指定子が Node の解決規則で見つからないときである

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

開発サーバーで `/@fs/` を残すのは、root の外のファイルを配信させるためである。ブラウザは URL のパスの `..` を origin の根より上へたどれないので、相対パスでは root の外のファイルを指せない。

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
- 開発サーバーでも相対パスにする: root の外のファイルを指せない
- 解決できない指定子を警告に留める: 誤字の URL が出力に残ることは変わらない。ADR-0023 の参照の扱いとも揃わない
- 最初から `<head>` にある資産はその場に残し、`<head>` の外の資産だけを末尾へ移す: 本番では Vite が束ねるスタイルシートと module script を `</head>` の直前へ移すので、順序が保たれるのは開発サーバーだけになり、開発と本番で見た目が食い違う

## 影響

- 本番のビルドの出力に `/@fs/` とビルド機の絶対パスが出なくなる。テンプレートとレイアウトの資産は、`<link rel="stylesheet">`（`media` の有無を問わない）、`<link rel="preload">`、`<link rel="modulepreload">`、`<script type="module">` のどれも、root の中でも外でも、ハッシュ付きの資産として出る
- import に変わらない資産の出し方は、ページに直接書いた相対 URL と同じく Vite が決める。小さい `media` 付きのスタイルシートは `build.assetsInlineLimit` に従って `data:` URL に埋め込まれる。`<link rel="preload">` と `<link rel="modulepreload">` は埋め込まれない。`<link rel="modulepreload">` の先の JS と `media` 付きのスタイルシートは、束ねられずにそのままの中身で写される
- テンプレートとレイアウトの資産の指定子に誤字があると、そのファイルと行を示して変換が失敗する
- Vite の別名（`resolve.alias`）の指定子をテンプレートやレイアウトの資産に書くと、例外になる。プラグインの解決はファイルシステムと Node の解決規則で行い、Vite の別名を知らないためである。これまでは書かれたまま Vite に渡り、ビルドでは import に変わる資産に限って Vite が解決していた。テンプレートでは相対パスかパッケージ名で書く
- `transform` を直接使い、自前の `resolveAsset` を渡す呼び出し側は、ファイルの指定子に null を返すと例外になる。書かれたまま残したいときは、受け取った指定子をそのまま返す
- `<head>` の資産の位置は変わらない。資産より後ろに置いたインラインの `<style>` は、資産より前に来る。資産の規則より優先させたいインラインの規則は `@layer site` に書く
