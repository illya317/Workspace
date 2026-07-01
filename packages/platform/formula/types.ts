export type FormulaValue = number | string | boolean | null;

export type FormulaErrorType =
  | "missing_field"
  | "invalid_function"
  | "invalid_expression"
  | "circular_dependency";

export type FormulaEngineKind = "hyperformula" | "simple";

export interface FormulaField {
  fieldKey: string;
  label?: string;
  aliases?: string[];
  formula?: string | null;
  value?: FormulaValue;
  slotKind?: string;
  valueType?: string;
  inputType?: string;
  numberFormat?: string;
  attr?: string;
}

export interface FormulaModel {
  fields: FormulaField[];
}

export interface FormulaEvaluationInput {
  model: FormulaModel;
  values?: Record<string, FormulaValue | undefined>;
  targetFieldKeys?: string[];
}

export interface FormulaEvaluationError {
  type: FormulaErrorType;
  fieldKey?: string;
  reference?: string;
  functionName?: string;
  expression?: string;
  message: string;
}

export interface FormulaEvaluationResult {
  adapter: FormulaEngineKind;
  ok: boolean;
  values: Record<string, FormulaValue>;
  errors: FormulaEvaluationError[];
}

export interface FormulaEngineAdapter {
  readonly kind: FormulaEngineKind;
  evaluate(input: FormulaEvaluationInput): FormulaEvaluationResult;
}

export interface FormulaEngineOptions {
  preferred?: FormulaEngineKind;
}
