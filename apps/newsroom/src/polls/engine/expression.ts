/**
 * The XLSForm expression subset Wildcat Polls supports (docs/wildcat-polls.md#expressions).
 *
 * A small hand-written parser and evaluator: an expression from a workbook is
 * never handed to JavaScript, a spreadsheet engine or SQL. Anything outside the
 * documented grammar is a parse error the importer reports with its row.
 *
 *   expr     := or
 *   or       := and ("or" and)*
 *   and      := compare ("and" compare)*
 *   compare  := sum (("=" | "!=" | "<" | "<=" | ">" | ">=") sum)?
 *   sum      := product (("+" | "-") product)*
 *   product  := unary (("*" | "div" | "mod") unary)*
 *   unary    := "-" unary | primary
 *   primary  := number | 'text' | "text" | ${name} | "." | call | "(" expr ")"
 *   call     := selected(a, b) | count-selected(a) | not(a) | string-length(a) | number(a) | true() | false()
 *
 * Values follow XPath 1.0: an unanswered, skipped or hidden question is the
 * empty string; a multiple-choice answer is its choice names separated by
 * spaces (test it with `selected()`); a number question is a number.
 */

export type Value = string | number | boolean;

export type Node =
  | { kind: "literal"; value: Value }
  | { kind: "ref"; name: string }
  | { kind: "dot" }
  | { kind: "unary"; op: "-"; operand: Node }
  | { kind: "binary"; op: BinaryOp; left: Node; right: Node }
  | { kind: "call"; name: FunctionName; args: Node[] };

type BinaryOp = "or" | "and" | "=" | "!=" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "div" | "mod";

const FUNCTIONS = { "selected": 2, "count-selected": 1, "not": 1, "string-length": 1, "number": 1, "true": 0, "false": 0 } as const;
type FunctionName = keyof typeof FUNCTIONS;

export const EXPRESSION_LIMITS = { length: 1000, depth: 32, tokens: 400 } as const;

export class ExpressionError extends Error {}

type Token =
  | { type: "num"; value: number; at: number }
  | { type: "str"; value: string; at: number }
  | { type: "ref"; value: string; at: number }
  | { type: "name"; value: string; at: number }
  | { type: "op"; value: string; at: number }
  | { type: "end"; at: number };

const NAME = /^[A-Za-z_][A-Za-z0-9_.-]*/;

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    if (tokens.length > EXPRESSION_LIMITS.tokens) throw new ExpressionError("The expression is too long.");
    if (c === "$") {
      const match = /^\$\{([A-Za-z_][A-Za-z0-9_.-]*)\}/.exec(source.slice(i));
      if (!match) throw new ExpressionError(`Write a question reference as \${name} (at character ${i + 1}).`);
      tokens.push({ type: "ref", value: match[1], at: i });
      i += match[0].length;
      continue;
    }
    if (c === "'" || c === '"' || c === "‘" || c === "“") {
      // Spreadsheet apps "smarten" quotes; accept the curly pair as the straight one.
      const close = c === "‘" ? "’" : c === "“" ? "”" : c;
      const end = source.indexOf(close, i + 1);
      if (end < 0) throw new ExpressionError(`A quoted value is not closed (at character ${i + 1}).`);
      tokens.push({ type: "str", value: source.slice(i + 1, end), at: i });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(i))!;
      tokens.push({ type: "num", value: Number(match[0]), at: i });
      i += match[0].length;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (two === "!=" || two === "<=" || two === ">=") { tokens.push({ type: "op", value: two, at: i }); i += 2; continue; }
    if ("=<>+-*(),.".includes(c)) { tokens.push({ type: "op", value: c, at: i }); i++; continue; }
    const name = NAME.exec(source.slice(i));
    if (name) { tokens.push({ type: "name", value: name[0], at: i }); i += name[0].length; continue; }
    throw new ExpressionError(`"${c}" is not part of the supported expression syntax (at character ${i + 1}).`);
  }
  tokens.push({ type: "end", at: source.length });
  return tokens;
}

class Parser {
  private index = 0;
  private depth = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token { return this.tokens[this.index]; }
  private next(): Token { return this.tokens[this.index++]; }
  private isOp(value: string) { const t = this.peek(); return t.type === "op" && t.value === value; }
  private isWord(value: string) { const t = this.peek(); return t.type === "name" && t.value === value; }
  private expectOp(value: string) {
    const t = this.next();
    if (t.type !== "op" || t.value !== value) throw new ExpressionError(`Expected "${value}" at character ${t.at + 1}.`);
  }

  parse(): Node {
    const node = this.or();
    const t = this.peek();
    if (t.type !== "end") throw new ExpressionError(`Unexpected ${describe(t)} at character ${t.at + 1}.`);
    return node;
  }

  private nest<T>(run: () => T): T {
    if (++this.depth > EXPRESSION_LIMITS.depth) throw new ExpressionError("The expression is nested too deeply.");
    try { return run(); } finally { this.depth--; }
  }

  private or(): Node {
    let left = this.and();
    while (this.isWord("or")) { this.next(); left = { kind: "binary", op: "or", left, right: this.and() }; }
    return left;
  }

  private and(): Node {
    let left = this.compare();
    while (this.isWord("and")) { this.next(); left = { kind: "binary", op: "and", left, right: this.compare() }; }
    return left;
  }

  private compare(): Node {
    const left = this.sum();
    const t = this.peek();
    if (t.type === "op" && ["=", "!=", "<", "<=", ">", ">="].includes(t.value)) {
      this.next();
      const right = this.sum();
      const after = this.peek();
      if (after.type === "op" && ["=", "!=", "<", "<=", ">", ">="].includes(after.value)) throw new ExpressionError(`Join comparisons with "and" or "or" (at character ${after.at + 1}).`);
      return { kind: "binary", op: t.value as BinaryOp, left, right };
    }
    return left;
  }

  private sum(): Node {
    let left = this.product();
    while (this.isOp("+") || this.isOp("-")) { const op = this.next() as { value: "+" | "-" }; left = { kind: "binary", op: op.value, left, right: this.product() }; }
    return left;
  }

  private product(): Node {
    let left = this.unary();
    while (this.isOp("*") || this.isWord("div") || this.isWord("mod")) { const op = this.next() as { value: "*" | "div" | "mod" }; left = { kind: "binary", op: op.value, left, right: this.unary() }; }
    return left;
  }

  private unary(): Node {
    if (this.isOp("-")) { this.next(); return this.nest(() => ({ kind: "unary", op: "-", operand: this.unary() })); }
    return this.primary();
  }

  private primary(): Node {
    const t = this.next();
    if (t.type === "num") return { kind: "literal", value: t.value };
    if (t.type === "str") return { kind: "literal", value: t.value };
    if (t.type === "ref") return { kind: "ref", name: t.value };
    if (t.type === "op" && t.value === ".") return { kind: "dot" };
    if (t.type === "op" && t.value === "(") return this.nest(() => { const node = this.or(); this.expectOp(")"); return node; });
    if (t.type === "name") {
      if (!this.isOp("(")) {
        if (t.value === "and" || t.value === "or" || t.value === "div" || t.value === "mod") throw new ExpressionError(`"${t.value}" needs a value before it (at character ${t.at + 1}).`);
        throw new ExpressionError(`"${t.value}" is not a value. Refer to a question as \${${t.value}} and quote text as '${t.value}' (at character ${t.at + 1}).`);
      }
      if (!(t.value in FUNCTIONS)) throw new ExpressionError(`${t.value}() is not supported. Use selected, count-selected, not, string-length, number, true or false (at character ${t.at + 1}).`);
      const name = t.value as FunctionName;
      this.expectOp("(");
      const args: Node[] = [];
      if (!this.isOp(")")) {
        do { args.push(this.nest(() => this.or())); } while (this.isOp(",") && this.next());
      }
      this.expectOp(")");
      if (args.length !== FUNCTIONS[name]) throw new ExpressionError(`${name}() takes ${FUNCTIONS[name]} value${FUNCTIONS[name] === 1 ? "" : "s"}, not ${args.length} (at character ${t.at + 1}).`);
      if (name === "selected" || name === "count-selected") {
        if (args[0].kind !== "ref" && args[0].kind !== "dot") throw new ExpressionError(`${name}() needs a question reference such as \${name} first (at character ${t.at + 1}).`);
      }
      return { kind: "call", name, args };
    }
    throw new ExpressionError(`Unexpected ${describe(t)} at character ${t.at + 1}.`);
  }
}

function describe(token: Token): string {
  if (token.type === "end") return "end of the expression";
  if (token.type === "str") return `'${token.value}'`;
  if (token.type === "ref") return `\${${token.value}}`;
  return `"${String(token.value)}"`;
}

export type ParsedExpression = { source: string; ast: Node; refs: string[]; usesDot: boolean; selectedRefs: Array<{ question: string; choice: string | null }> };

export function parseExpression(source: string): ParsedExpression {
  const trimmed = source.trim();
  if (!trimmed) throw new ExpressionError("The expression is empty.");
  if (trimmed.length > EXPRESSION_LIMITS.length) throw new ExpressionError(`Keep expressions under ${EXPRESSION_LIMITS.length} characters.`);
  const ast = new Parser(tokenize(trimmed)).parse();
  const refs = new Set<string>();
  const selectedRefs: Array<{ question: string; choice: string | null }> = [];
  let usesDot = false;
  const visit = (node: Node) => {
    switch (node.kind) {
      case "ref": refs.add(node.name); break;
      case "dot": usesDot = true; break;
      case "unary": visit(node.operand); break;
      case "binary": visit(node.left); visit(node.right); break;
      case "call":
        if (node.name === "selected" && node.args[0].kind === "ref") {
          selectedRefs.push({ question: node.args[0].name, choice: node.args[1].kind === "literal" && typeof node.args[1].value === "string" ? node.args[1].value : null });
        }
        node.args.forEach(visit);
        break;
      case "literal": break;
    }
  };
  visit(ast);
  // `${a} = 'yes'` names a choice too: collect it so the importer can check it exists.
  const visitCompare = (node: Node) => {
    if (node.kind === "binary") {
      if ((node.op === "=" || node.op === "!=") && node.left.kind === "ref" && node.right.kind === "literal" && typeof node.right.value === "string" && node.right.value !== "") selectedRefs.push({ question: node.left.name, choice: node.right.value });
      if ((node.op === "=" || node.op === "!=") && node.right.kind === "ref" && node.left.kind === "literal" && typeof node.left.value === "string" && node.left.value !== "") selectedRefs.push({ question: node.right.name, choice: node.left.value });
      visitCompare(node.left); visitCompare(node.right);
    } else if (node.kind === "unary") visitCompare(node.operand);
    else if (node.kind === "call") node.args.forEach(visitCompare);
  };
  visitCompare(ast);
  return { source: trimmed, ast, refs: [...refs], usesDot, selectedRefs };
}

/* ---------------------------------------------------------------- evaluate */

export type EvaluationContext = {
  /** A question's current value: "" when unanswered, skipped or hidden. */
  value: (name: string) => Value;
  /** The value `.` stands for (the question being constrained). */
  dot?: Value;
};

const toNumber = (value: Value): number => {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const text = value.trim();
  return text === "" ? Number.NaN : Number(text);
};
const toBoolean = (value: Value): boolean => (typeof value === "boolean" ? value : typeof value === "number" ? value !== 0 && !Number.isNaN(value) : value.length > 0);
const toText = (value: Value): string => (typeof value === "string" ? value : typeof value === "boolean" ? String(value) : Number.isFinite(value) ? String(value) : "");

function equal(left: Value, right: Value): boolean {
  if (typeof left === "boolean" || typeof right === "boolean") return toBoolean(left) === toBoolean(right);
  if (typeof left === "number" || typeof right === "number") return toNumber(left) === toNumber(right);
  return left === right;
}

function evaluateNode(node: Node, ctx: EvaluationContext): Value {
  switch (node.kind) {
    case "literal": return node.value;
    case "ref": return ctx.value(node.name);
    case "dot": return ctx.dot ?? "";
    case "unary": return -toNumber(evaluateNode(node.operand, ctx));
    case "binary": {
      if (node.op === "or") return toBoolean(evaluateNode(node.left, ctx)) || toBoolean(evaluateNode(node.right, ctx));
      if (node.op === "and") return toBoolean(evaluateNode(node.left, ctx)) && toBoolean(evaluateNode(node.right, ctx));
      const left = evaluateNode(node.left, ctx);
      const right = evaluateNode(node.right, ctx);
      switch (node.op) {
        case "=": return equal(left, right);
        case "!=": return !equal(left, right);
        case "<": return toNumber(left) < toNumber(right);
        case "<=": return toNumber(left) <= toNumber(right);
        case ">": return toNumber(left) > toNumber(right);
        case ">=": return toNumber(left) >= toNumber(right);
        case "+": return toNumber(left) + toNumber(right);
        case "-": return toNumber(left) - toNumber(right);
        case "*": return toNumber(left) * toNumber(right);
        case "div": return toNumber(left) / toNumber(right);
        case "mod": return toNumber(left) % toNumber(right);
      }
      return false;
    }
    case "call": {
      const args = node.args.map((arg) => evaluateNode(arg, ctx));
      switch (node.name) {
        case "selected": return toText(args[0]).split(" ").filter(Boolean).includes(toText(args[1]).trim());
        case "count-selected": return toText(args[0]).split(" ").filter(Boolean).length;
        case "not": return !toBoolean(args[0]);
        case "string-length": return toText(args[0]).length;
        case "number": return toNumber(args[0]);
        case "true": return true;
        case "false": return false;
      }
    }
  }
}

/** Evaluates a parsed expression as a condition. Never throws for well-formed input. */
export function evaluateCondition(expression: ParsedExpression, ctx: EvaluationContext): boolean {
  return toBoolean(evaluateNode(expression.ast, ctx));
}

/** A bounded cache: definitions are evaluated on every answer change. */
const cache = new Map<string, ParsedExpression | ExpressionError>();
export function compileExpression(source: string): ParsedExpression {
  const hit = cache.get(source);
  if (hit instanceof ExpressionError) throw hit;
  if (hit) return hit;
  try {
    const parsed = parseExpression(source);
    if (cache.size > 2000) cache.clear();
    cache.set(source, parsed);
    return parsed;
  } catch (error) {
    if (error instanceof ExpressionError) cache.set(source, error);
    throw error;
  }
}
