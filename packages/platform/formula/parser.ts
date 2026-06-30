import type { FormulaEvaluationError } from "./types";
import {
  FormulaParseError,
  SUPPORTED_FUNCTIONS,
  normalizeComparisonOperator,
  type FormulaExpression,
  type SupportedFormulaFunction,
} from "./expression";
import { Tokenizer, type Token } from "./tokenizer";

export {
  collectFormulaReferences,
  createReferenceCatalog,
  validateFormulaFunctionArguments,
  type FormulaExpression,
} from "./expression";
export { evaluateFormulaExpression } from "./evaluator";
export { emitHyperFormulaExpression } from "./hyperformula-expression";

class Parser {
  private readonly tokenizer: Tokenizer;
  private current: Token;

  constructor(expression: string) {
    this.tokenizer = new Tokenizer(expression);
    this.current = this.tokenizer.next();
  }

  parse(): FormulaExpression {
    const expression = this.parseOr();
    if (this.current.type !== "eof") {
      throw new FormulaParseError("invalid_expression", "Unexpected trailing expression.");
    }
    return expression;
  }

  private parseOr(): FormulaExpression {
    let expression = this.parseAnd();
    while (this.matchesOperator("||") || this.matchesIdentifier("OR")) {
      this.advance();
      expression = { type: "binary", operator: "or", left: expression, right: this.parseAnd() };
    }
    return expression;
  }

  private parseAnd(): FormulaExpression {
    let expression = this.parseComparison();
    while (this.matchesOperator("&&") || this.matchesIdentifier("AND")) {
      this.advance();
      expression = { type: "binary", operator: "and", left: expression, right: this.parseComparison() };
    }
    return expression;
  }

  private parseComparison(): FormulaExpression {
    let expression = this.parseAdditive();
    while (this.current.type === "operator" && ["<", "<=", ">", ">=", "=", "==", "!=", "<>"].includes(this.current.value)) {
      const operator = normalizeComparisonOperator(this.current.value);
      this.advance();
      expression = { type: "binary", operator, left: expression, right: this.parseAdditive() };
    }
    return expression;
  }

  private parseAdditive(): FormulaExpression {
    let expression = this.parseMultiplicative();
    while (this.matchesOperator("+") || this.matchesOperator("-")) {
      const operator = this.current.value as "+" | "-";
      this.advance();
      expression = { type: "binary", operator, left: expression, right: this.parseMultiplicative() };
    }
    return expression;
  }

  private parseMultiplicative(): FormulaExpression {
    let expression = this.parsePower();
    while (this.matchesOperator("*") || this.matchesOperator("/") || this.matchesOperator("%")) {
      const operator = this.current.value as "*" | "/" | "%";
      this.advance();
      expression = { type: "binary", operator, left: expression, right: this.parsePower() };
    }
    return expression;
  }

  private parsePower(): FormulaExpression {
    const expression = this.parseUnary();
    if (this.matchesOperator("^")) {
      this.advance();
      return { type: "binary", operator: "^", left: expression, right: this.parsePower() };
    }
    return expression;
  }

  private parseUnary(): FormulaExpression {
    if (this.matchesOperator("+") || this.matchesOperator("-")) {
      const operator = this.current.value as "+" | "-";
      this.advance();
      return { type: "unary", operator, argument: this.parseUnary() };
    }
    if (this.matchesOperator("!") || this.matchesIdentifier("NOT")) {
      this.advance();
      return { type: "unary", operator: "not", argument: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaExpression {
    const token = this.current;
    if (token.type === "number") {
      this.advance();
      return { type: "literal", value: token.value };
    }
    if (token.type === "string") {
      this.advance();
      return { type: "literal", value: token.value };
    }
    if (token.type === "reference") {
      this.advance();
      return { type: "field", reference: token.value };
    }
    if (token.type === "identifier") {
      return this.parseIdentifier();
    }
    if (this.matchesParen("(")) {
      this.advance();
      const expression = this.parseOr();
      this.consumeParen(")");
      return expression;
    }
    throw new FormulaParseError("invalid_expression", "Expected value, field reference, or function call.");
  }

  private parseIdentifier(): FormulaExpression {
    if (this.current.type !== "identifier") {
      throw new FormulaParseError("invalid_expression", "Expected identifier.");
    }
    const identifier = this.current.value;
    this.advance();

    if (this.matchesParen("(")) {
      const functionName = identifier.toUpperCase();
      if (!SUPPORTED_FUNCTIONS.has(functionName as SupportedFormulaFunction)) {
        throw new FormulaParseError("invalid_function", `Unsupported formula function "${identifier}".`, identifier);
      }
      this.advance();
      const args: FormulaExpression[] = [];
      if (!this.matchesParen(")")) {
        do {
          args.push(this.parseOr());
          if (!this.matchesComma()) break;
          this.advance();
        } while (!this.matchesParen(")"));
      }
      this.consumeParen(")");
      return { type: "call", functionName: functionName as SupportedFormulaFunction, args };
    }

    if (/^TRUE$/i.test(identifier)) return { type: "literal", value: true };
    if (/^FALSE$/i.test(identifier)) return { type: "literal", value: false };
    return { type: "field", reference: identifier };
  }

  private consumeParen(value: "(" | ")") {
    if (!this.matchesParen(value)) {
      throw new FormulaParseError("invalid_expression", `Expected "${value}".`);
    }
    this.advance();
  }

  private matchesOperator(value: string) {
    return this.current.type === "operator" && this.current.value === value;
  }

  private matchesIdentifier(value: string) {
    return this.current.type === "identifier" && this.current.value.toUpperCase() === value;
  }

  private matchesParen(value: "(" | ")") {
    return this.current.type === "paren" && this.current.value === value;
  }

  private matchesComma() {
    return this.current.type === "comma";
  }

  private advance() {
    this.current = this.tokenizer.next();
  }
}

export function parseFormulaExpression(expression: string): FormulaExpression {
  return new Parser(expression).parse();
}

export function parseFormulaError(error: unknown, fieldKey?: string, expression?: string): FormulaEvaluationError {
  if (error instanceof FormulaParseError) {
    return {
      type: error.errorType,
      fieldKey,
      functionName: error.functionName,
      expression,
      message: error.message,
    };
  }
  return {
    type: "invalid_expression",
    fieldKey,
    expression,
    message: error instanceof Error ? error.message : "Invalid formula expression.",
  };
}
