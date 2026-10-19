/** 解決されたテンプレートのファイルパスと内容。 */
export interface TemplateSource {
  path: string;
  source: string;
}

/** `transform` に渡す解決関数とデータ。 */
export interface TransformOptions {
  /** 参照名（`flat-` 接頭辞を除いた名前）からテンプレートを探す。探索先の先頭優先は呼び出し側が実装する */
  resolve(name: string): Promise<TemplateSource | null>;
  /** `<link rel="layout" href>` の `href` を、参照元ファイル `fromPath` からの相対パスとして解決する。省略時はレイアウトを使えない */
  resolveLayout?(href: string, fromPath?: string): Promise<TemplateSource | null>;
  /**
   * テンプレートやレイアウトに書かれた資産の URL を、解決後の URL に直す。
   * `specifier` は書かれたままの値、`fromPath` はそれが書かれていたファイルのパス。
   * 触らない場合は null を返す。渡されなければ URL は書き換えられない。
   */
  resolveAsset?(specifier: string, fromPath: string): Promise<string | null>;
  /** ページに渡すデータ。ページとレイアウトのテンプレートからだけ見える */
  data?: Record<string, unknown>;
  /** 入力 HTML のファイルパス。エラー表示とレイアウトの相対解決に使う */
  path?: string;
}

/** `transform` の結果。 */
export interface TransformResult {
  html: string;
  /** どの参照名がどのファイルに解決されたかの一覧（ADR-0019 の解決一覧） */
  resolved: Array<{ name: string; path: string }>;
  /** どの `<link rel="layout" href>` がどのファイルに解決されたかの一覧 */
  layouts: Array<{ href: string; path: string }>;
}

/** テンプレートの構文・参照の誤りを、ファイルパスと行番号つきで表す例外。 */
export class TemplateError extends Error {
  readonly path: string | undefined;
  readonly line: number | undefined;

  constructor(message: string, path?: string, line?: number) {
    const where = path === undefined ? "" : line === undefined ? `${path}: ` : `${path}:${line}: `;
    super(`${where}${message}`);
    this.name = "TemplateError";
    this.path = path;
    this.line = line;
  }
}
