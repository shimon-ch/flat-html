# flat-html

素朴な HTML 部品群のモノレポ。設計段階で、実装はまだない。

| パッケージ | 役割 |
|---|---|
| `@flat-html/core` | HTML の解析から変換までを担うツール。展開と集約だけを行う |
| `@flat-html/vite` | core を Vite に接続する薄い皮 |
| `@flat-html/css` | class なしで使える CSS |
| `@flat-html/elements` | ネイティブ優先のコンポーネント |
| `@flat-html/motion` | アニメーション。枠だけ予約 |
| `apps/site` | 見本サイト。GitHub Pages に出す。公開パッケージではない |

## 根底にある問い

> 「これは本当に JS / Custom Element でなければ実現できないのか？」を常に先に問い、答えが No なら足さない。

## 文書

- [docs/design.md](./docs/design.md) — 思想の本文
- [docs/decisions/](./docs/decisions/) — 決定記録（ADR）。1 件 1 ファイル
- [docs/glossary.md](./docs/glossary.md) — 用語集
- [docs/history/](./docs/history/) — 検討の経緯

## 依存の向き

```
core → css → elements → 消費するサイト
```

一方向。サイト固有の都合をライブラリやツールへ逆流させない。
