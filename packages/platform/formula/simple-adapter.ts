import {
  collectFormulaReferences,
  createReferenceCatalog,
  evaluateFormulaExpression,
  parseFormulaError,
  parseFormulaExpression,
  validateFormulaFunctionArguments,
} from "./parser";
import type {
  FormulaEngineAdapter,
  FormulaEvaluationError,
  FormulaEvaluationInput,
  FormulaEvaluationResult,
  FormulaField,
  FormulaValue,
} from "./types";

export class SimpleFormulaAdapter implements FormulaEngineAdapter {
  readonly kind = "simple" as const;

  evaluate(input: FormulaEvaluationInput): FormulaEvaluationResult {
    const fields = input.model.fields;
    const catalog = createReferenceCatalog(fields);
    const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
    const expressions = new Map<string, ReturnType<typeof parseFormulaExpression>>();
    const values = createInitialValues(fields, input.values);
    const errors: FormulaEvaluationError[] = [];
    const erroredFields = new Set<string>();

    for (const field of fields) {
      if (!field.formula) continue;
      try {
        const expression = parseFormulaExpression(field.formula);
        validateFormulaFunctionArguments(expression, (reference) => isInputReference(reference, catalog, fieldByKey));
        expressions.set(field.fieldKey, expression);
        for (const reference of collectFormulaReferences(expression)) {
          if (!catalog.resolve(reference)) {
            errors.push(missingFieldError(field.fieldKey, reference, field.formula));
            erroredFields.add(field.fieldKey);
            values[field.fieldKey] = null;
          }
        }
      } catch (error) {
        errors.push(parseFormulaError(error, field.fieldKey, field.formula));
        erroredFields.add(field.fieldKey);
        values[field.fieldKey] = null;
      }
    }

    const targets = input.targetFieldKeys?.length ? input.targetFieldKeys : fields.map((field) => field.fieldKey);
    const visiting = new Set<string>();
    const resolved = new Set<string>();

    const evaluateField = (fieldKey: string): FormulaValue => {
      if (resolved.has(fieldKey)) return values[fieldKey] ?? null;
      const field = fieldByKey.get(fieldKey);
      if (!field) {
        throw missingFieldRuntimeError(fieldKey);
      }
      const expression = expressions.get(fieldKey);
      if (!expression) {
        if (!(fieldKey in values) || values[fieldKey] == null) throw missingFieldRuntimeError(fieldKey);
        resolved.add(fieldKey);
        return values[fieldKey] ?? null;
      }
      if (visiting.has(fieldKey)) {
        throw formulaRuntimeError("circular_dependency", `Circular formula dependency at "${fieldKey}".`, fieldKey);
      }

      visiting.add(fieldKey);
      try {
        const value = evaluateFormulaExpression(expression, (reference) => {
          const resolvedFieldKey = catalog.resolve(reference);
          if (!resolvedFieldKey) throw missingFieldRuntimeError(reference);
          return evaluateField(resolvedFieldKey);
        });
        values[fieldKey] = value;
        resolved.add(fieldKey);
        return value;
      } finally {
        visiting.delete(fieldKey);
      }
    };

    for (const fieldKey of targets) {
      if (erroredFields.has(fieldKey)) continue;
      try {
        evaluateField(fieldKey);
      } catch (error) {
        const field = fieldByKey.get(fieldKey);
        errors.push(runtimeErrorToEvaluationError(error, fieldKey, field?.formula ?? undefined));
        erroredFields.add(fieldKey);
        values[fieldKey] = null;
      }
    }

    return { adapter: this.kind, ok: errors.length === 0, values, errors: dedupeErrors(errors) };
  }
}

function createInitialValues(fields: FormulaField[], overrides?: Record<string, FormulaValue | undefined>) {
  const values: Record<string, FormulaValue> = {};
  for (const field of fields) {
    if (field.value !== undefined) values[field.fieldKey] = field.value;
  }
  for (const [fieldKey, value] of Object.entries(overrides ?? {})) {
    if (value !== undefined) values[fieldKey] = value;
  }
  return values;
}

function isInputReference(reference: string, catalog: ReturnType<typeof createReferenceCatalog>, fieldByKey: Map<string, FormulaField>) {
  if (/^x\d+$/i.test(reference.trim())) return true;
  const field = fieldByKey.get(catalog.resolve(reference) ?? "");
  if (!field) return false;
  if (field.slotKind === "variable") return true;
  return field.attr === "fillable" && (field.valueType === "number" || field.inputType === "number" || field.inputType === "field");
}

function missingFieldError(fieldKey: string, reference: string, expression?: string): FormulaEvaluationError {
  return {
    type: "missing_field",
    fieldKey,
    reference,
    expression,
    message: `Formula references missing field "${reference}".`,
  };
}

function runtimeErrorToEvaluationError(error: unknown, fieldKey: string, expression?: string): FormulaEvaluationError {
  if (isFormulaRuntimeError(error)) {
    return {
      type: error.errorType,
      fieldKey,
      reference: error.reference,
      expression,
      message: error.message,
    };
  }
  return parseFormulaError(error, fieldKey, expression);
}

function formulaRuntimeError(errorType: FormulaEvaluationError["type"], message: string, reference?: string) {
  return { formulaRuntimeError: true, errorType, message, reference };
}

function missingFieldRuntimeError(reference: string) {
  return formulaRuntimeError("missing_field", `Formula references missing field "${reference}".`, reference);
}

function isFormulaRuntimeError(error: unknown): error is ReturnType<typeof formulaRuntimeError> {
  return typeof error === "object" && error != null && "formulaRuntimeError" in error;
}

function dedupeErrors(errors: FormulaEvaluationError[]) {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.type}:${error.fieldKey ?? ""}:${error.reference ?? ""}:${error.functionName ?? ""}:${error.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
