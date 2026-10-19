import type { Expr } from "./parser.ts";

/**
 * 式から見える変数の集合。親を持てるのは `each` が導入する変数のためで、
 * 親をたどっても名前が見つからなければ `undefined` になる。
 * 根の変数の参照は `used` に記録され、引数の透過判定に使う。
 */
export class Scope {
  readonly used = new Set<string>();

  constructor(
    private readonly vars: Record<string, unknown>,
    private readonly parent?: Scope,
  ) {}

  child(vars: Record<string, unknown>): Scope {
    return new Scope(vars, this);
  }

  lookup(name: string): unknown {
    if (Object.hasOwn(this.vars, name)) {
      this.used.add(name);
      return this.vars[name];
    }
    return this.parent?.lookup(name);
  }
}

function property(target: unknown, key: string): unknown {
  if (target === null || target === undefined) return undefined;
  if (typeof target === "object" || typeof target === "function") {
    return Object.hasOwn(target, key) ? Reflect.get(target, key) : undefined;
  }
  return undefined;
}

/** 構文木を `scope` のもとで評価する。`==` と `!=` は型も含めて比べる。 */
export function evaluate(expr: Expr, scope: Scope): unknown {
  switch (expr.kind) {
    case "literal":
      return expr.value;
    case "path": {
      const [first, ...rest] = expr.segments;
      return rest.reduce<unknown>(property, scope.lookup(first!));
    }
    case "not":
      return !evaluate(expr.operand, scope);
    case "binary": {
      switch (expr.op) {
        case "&&":
          return evaluate(expr.left, scope) && evaluate(expr.right, scope);
        case "||":
          return evaluate(expr.left, scope) || evaluate(expr.right, scope);
        case "==":
          return evaluate(expr.left, scope) === evaluate(expr.right, scope);
        case "!=":
          return evaluate(expr.left, scope) !== evaluate(expr.right, scope);
      }
    }
  }
}

/** 値を `{{ }}` の出力文字列にする。`null` と `undefined` は空文字。 */
export function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
}
