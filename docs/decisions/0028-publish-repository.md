# ADR-0028: リポジトリを公開し、見本サイトをこのリポジトリの Pages から配信する

- 状態: 採択（ADR-0025 と ADR-0026 を置換。npm への公開を見送る ADR-0027 は有効）
- 日付: 2026-11-01

## 文脈

ADR-0025 は、旧メールが履歴と PR の参照から読めることを理由に、リポジトリを非公開に保つと決めた。ADR-0026 はそのうえで、見本サイトだけを公開用リポジトリ `flat-html-site` から配信すると決めた。

所有者は、旧メールは表に出ても構わないアドレスだと判断した。公開前の点検（ADR-0025）では、旧メールのほかに個人に結びつく情報は見つかっていない。

ADR-0026 の方式では、別のリポジトリへ push するための書き込み鍵が要り、リポジトリが 2 つに分かれる。無料プランでも、公開リポジトリなら Pages を使える。

## 決定

- このリポジトリを公開する
- 見本サイトは、このリポジトリの Pages から GitHub Actions で配信する。URL は `https://shimon-ch.github.io/flat-html/`
- 配信の流れは、ビルド、Lighthouse の予算検査（ADR-0021）、配信の順にする。予算で落ちたら配信しない
- npm への公開は引き続き見送る（ADR-0027）。名前がまだ確定していない

## 表に出るもの

- ソース、全履歴、issue、PR、Actions のログと成果物
- 旧メール。作者かコミッターとして、コミット 29 個に残る
- Claude のセッション URL。コミットメッセージと PR の本文にある。開くには所有者のログインが要る
- 名前「shimon」。コミットの作者名と LICENSE の著作権者に出る

## 却下した選択肢

- 履歴を書き換えた新しいリポジトリを公開する: 旧メールを隠す必要がなくなった。PR と issue の経緯が公開側に残らない
- 公開用リポジトリからの配信を続ける: 書き込み鍵の登録と、2 つのリポジトリの管理が要る

## 影響

- リポジトリを改名すると、Pages の URL は新しい名前に転送されない（[Renaming a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)）。名前を確定させるまでは、URL が変わりうる
- 公開用リポジトリ `flat-html-site` は削除する。旧 URL `https://shimon-ch.github.io/flat-html-site/` は表示されなくなる
- 秘密情報 `SITE_DEPLOY_KEY` とリポジトリ変数 `PAGES_DEPLOY` は使わなくなった
