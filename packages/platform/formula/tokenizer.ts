import { FormulaParseError, normalizeFormulaText } from "./expression";

export type Token =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "identifier"; value: string }
  | { type: "reference"; value: string }
  | { type: "operator"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma"; value: "," }
  | { type: "eof"; value: "" };

export class Tokenizer {
  private readonly source: string;
  private index = 0;

  constructor(expression: string) {
    this.source = normalizeFormulaText(expression);
  }

  next(): Token {
    this.skipWhitespace();
    if (this.index >= this.source.length) return { type: "eof", value: "" };

    const char = this.source[this.index];
    const next = this.source[this.index + 1];

    if (char === "(" || char === ")") {
      this.index += 1;
      return { type: "paren", value: char };
    }
    if (char === ",") {
      this.index += 1;
      return { type: "comma", value: "," };
    }
    if (char === "[" || char === "{") {
      return this.readBracketReference(char, char === "[" ? "]" : "}");
    }
    if (char === '"' || char === "'") {
      return this.readString(char);
    }
    if (isNumberStart(char, next)) {
      return this.readNumber();
    }

    const two = `${char}${next ?? ""}`;
    if (["<=", ">=", "!=", "<>", "==", "&&", "||"].includes(two)) {
      this.index += 2;
      return { type: "operator", value: two };
    }
    if (["+", "-", "*", "/", "%", "^", "<", ">", "=", "!"].includes(char)) {
      this.index += 1;
      return { type: "operator", value: char };
    }
    if (isIdentifierChar(char)) {
      return this.readIdentifier();
    }

    throw new FormulaParseError("invalid_expression", `Unexpected token "${char}".`);
  }

  private skipWhitespace() {
    while (/\s/u.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private readBracketReference(open: string, close: string): Token {
    const start = this.index;
    this.index += 1;
    if (open === "{" && this.source[this.index] === "{") {
      this.index += 1;
      close = "}}";
    }

    const end = close === "}}"
      ? this.source.indexOf("}}", this.index)
      : this.source.indexOf(close, this.index);
    if (end < 0) {
      throw new FormulaParseError("invalid_expression", `Unclosed field reference at ${start}.`);
    }

    const value = this.source.slice(this.index, end).trim();
    this.index = end + close.length;
    if (!value) throw new FormulaParseError("invalid_expression", "Empty field reference.");
    return { type: "reference", value };
  }

  private readString(quote: string): Token {
    this.index += 1;
    let value = "";
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === "\\") {
        const escaped = this.source[this.index + 1];
        if (escaped == null) break;
        value += escaped;
        this.index += 2;
        continue;
      }
      if (char === quote) {
        this.index += 1;
        return { type: "string", value };
      }
      value += char;
      this.index += 1;
    }
    throw new FormulaParseError("invalid_expression", "Unclosed string literal.");
  }

  private readNumber(): Token {
    const start = this.index;
    if (this.source[this.index] === ".") this.index += 1;
    while (isDigit(this.source[this.index])) this.index += 1;
    if (this.source[this.index] === ".") {
      this.index += 1;
      while (isDigit(this.source[this.index])) this.index += 1;
    }
    if (/e/i.test(this.source[this.index] ?? "")) {
      const exponentStart = this.index;
      this.index += 1;
      if (this.source[this.index] === "+" || this.source[this.index] === "-") this.index += 1;
      const digitsStart = this.index;
      while (isDigit(this.source[this.index])) this.index += 1;
      if (digitsStart === this.index) this.index = exponentStart;
    }
    const value = Number(this.source.slice(start, this.index));
    if (!Number.isFinite(value)) {
      throw new FormulaParseError("invalid_expression", "Invalid numeric literal.");
    }
    return { type: "number", value };
  }

  private readIdentifier(): Token {
    const start = this.index;
    while (isIdentifierChar(this.source[this.index])) this.index += 1;
    return { type: "identifier", value: this.source.slice(start, this.index) };
  }
}

function isNumberStart(char: string, next?: string) {
  return isDigit(char) || (char === "." && isDigit(next));
}

function isDigit(char?: string) {
  return char != null && /[0-9]/.test(char);
}

function isIdentifierChar(char?: string) {
  return char != null && /[\p{L}\p{N}_.$]/u.test(char);
}
