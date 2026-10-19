import { append, detach, findAll, findFirst, getAttr, type Document, type Element } from "./dom.ts";

const LINK_RELS = ["stylesheet", "modulepreload", "preload"];

/**
 * 集約の対象なら、種類と URL を組にした鍵を返す（ADR-0013）。
 * 同じ URL でも `<link rel="modulepreload">` と `<script type="module">` は別物なので、種類を鍵に含める。
 */
export function assetKey(el: Element): string | undefined {
  if (el.tagName === "link") {
    const rels = (getAttr(el, "rel") ?? "").split(/\s+/);
    const kind = LINK_RELS.find((r) => rels.includes(r));
    const href = getAttr(el, "href");
    return kind !== undefined && href !== undefined ? `link:${kind}:${href}` : undefined;
  }
  if (el.tagName === "script" && getAttr(el, "type") === "module") {
    const src = getAttr(el, "src");
    return src !== undefined ? `script:module:${src}` : undefined;
  }
  return undefined;
}

/**
 * 文書中の資産（`<link rel="stylesheet|modulepreload|preload">` と `src` 付き `<script type="module">`）を
 * 文書順のまま `<head>` の末尾へ移し、同じ種類と URL のものは最初の 1 つだけ残す。`<head>` がなければ何もしない。
 */
export function aggregate(document: Document): void {
  const head = findFirst(document, "head");
  if (!head) return;
  const seen = new Set<string>();
  for (const el of findAll(document, (e) => assetKey(e) !== undefined)) {
    const key = assetKey(el)!;
    if (seen.has(key)) {
      detach(el);
      continue;
    }
    seen.add(key);
    append(head, el);
  }
}
