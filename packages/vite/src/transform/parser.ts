/**
 * 式の構文木。ADR-0012 の範囲（プロパティ参照、比較、否定、論理、リテラル）だけを表す。
 */
export type Expr =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "path"; segments: string[] }
  | { kind: "not"; operand: Expr }
  | { kind: "binary"; op: "==" | "!=" | "&&" | "||"; left: Expr; right: Expr };

/** 式の構文誤り。位置はテンプレート側で補う。 */
export class ExpressionSyntaxError extends Error {
  constructor(message: string, source: string) {
    super(`${message}: ${source.trim()}`);
    this.name = "ExpressionSyntaxError";
  }
}

type Token =
  | { type: "ident"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "op"; value: "==" | "!=" | "&&" | "||" | "!" | "." | "(" | ")" }
  | { type: "end" };

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const pair = source.slice(i, i + 2);
    if (pair === "==" || pair === "!=" || pair === "&&" || pair === "||") {
      tokens.push({ type: "op", value: pair });
      i += 2;
      continue;
    }
    if (ch === "!" || ch === "." || ch === "(" || ch === ")") {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = source.indexOf(ch, i + 1);
      if (end === -1) throw new ExpressionSyntaxError("文字列が閉じていない", source);
      tokens.push({ type: "string", value: source.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (DIGIT.test(ch)) {
      let j = i;
      while (j < source.length && (DIGIT.test(source[j]!) || source[j] === ".")) j += 1;
      const text = source.slice(i, j);
      const value = Number(text);
      if (Number.isNaN(value))
        throw new ExpressionSyntaxError(`数値として読めない「${text}」`, source);
      tokens.push({ type: "number", value });
      i = j;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < source.length && IDENT_PART.test(source[j]!)) j += 1;
      tokens.push({ type: "ident", value: source.slice(i, j) });
      i = j;
      continue;
    }
    throw new ExpressionSyntaxError(`許可しない記号「${ch}」`, source);
  }
  tokens.push({ type: "end" });
  return tokens;
}

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly source: string,
  ) {}

  parse(): Expr {
    const expr = this.parseOr();
    if (this.peek().type !== "end") throw this.error("式の途中に余分な記号がある");
    return expr;
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.takeOp("||")) left = { kind: "binary", op: "||", left, right: this.parseAnd() };
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseEquality();
    while (this.takeOp("&&"))
      left = { kind: "binary", op: "&&", left, right: this.parseEquality() };
    return left;
  }

  private parseEquality(): Expr {
    let left = this.parseUnary();
    for (;;) {
      if (this.takeOp("==")) left = { kind: "binary", op: "==", left, right: this.parseUnary() };
      else if (this.takeOp("!="))
        left = { kind: "binary", op: "!=", left, right: this.parseUnary() };
      else return left;
    }
  }

  private parseUnary(): Expr {
    if (this.takeOp("!")) return { kind: "not", operand: this.parseUnary() };
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.next();
    switch (token.type) {
      case "string":
        return { kind: "literal", value: token.value };
      case "number":
        return { kind: "literal", value: token.value };
      case "ident":
        return this.parsePath(token.value);
      case "op":
        if (token.value === "(") {
          const inner = this.parseOr();
          if (!this.takeOp(")")) throw this.error("括弧が閉じていない");
          return inner;
        }
        throw this.error(`ここに「${token.value}」は置けない`);
      case "end":
        throw this.error("式が途中で終わっている");
    }
  }

  private parsePath(first: string): Expr {
    if (first === "true") return { kind: "literal", value: true };
    if (first === "false") return { kind: "literal", value: false };
    if (first === "null") return { kind: "literal", value: null };
    const segments = [first];
    while (this.takeOp(".")) {
      const token = this.next();
      if (token.type !== "ident") throw this.error("「.」の後には名前が要る");
      segments.push(token.value);
    }
    return { kind: "path", segments };
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    const token = this.peek();
    if (token.type !== "end") this.pos += 1;
    return token;
  }

  private takeOp(value: string): boolean {
    const token = this.peek();
    if (token.type === "op" && token.value === value) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  private error(message: string): ExpressionSyntaxError {
    return new ExpressionSyntaxError(message, this.source);
  }
}

/** 式の文字列を構文木にする。許可しない構文は `ExpressionSyntaxError` を投げる。 */
export function parseExpression(source: string): Expr {
  if (source.trim() === "") throw new ExpressionSyntaxError("式が空", source);
  return new Parser(tokenize(source), source).parse();
}
