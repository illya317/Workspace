import {
  CellError,
  DetailedCellError,
  ErrorType,
  FunctionArgumentType,
  FunctionPlugin,
  type FunctionPluginDefinition,
  HyperFormula,
} from "hyperformula";
import {
  collectFormulaReferences,
  createReferenceCatalog,
  emitHyperFormulaExpression,
  parseFormulaError,
  parseFormulaExpression,
  validateFormulaFunctionArguments,
} from "./parser";
import { durationUnit } from "./date-difference";
import { SimpleFormulaAdapter } from "./simple-adapter";
import type {
  FormulaEngineAdapter,
  FormulaEvaluationError,
  FormulaEvaluationInput,
  FormulaEvaluationResult,
  FormulaField,
  FormulaValue,
} from "./types";

let formulaPluginsRegistered = false;

class AvgPlugin extends FunctionPlugin {
  static implementedFunctions = {
    AVG: {
      method: "avg",
      parameters: [{ argumentType: FunctionArgumentType.NUMBER }],
      repeatLastArgs: 1,
    },
  };

  avg(ast: { args: unknown[] }, state: unknown) {
    return this.runFunction(ast.args as never[], state as never, this.metadata("AVG"), (...args: number[]) => {
      if (args.length < 1) return new CellError(ErrorType.VALUE, "AVG received an invalid argument count.");
      return calculateAverage(args);
    });
  }
}

class MeanPlugin extends FunctionPlugin {
  static implementedFunctions = {
    MEAN: {
      method: "mean",
      parameters: [{ argumentType: FunctionArgumentType.NUMBER }],
      repeatLastArgs: 1,
    },
  };

  mean(ast: { args: unknown[] }, state: unknown) {
    return this.runFunction(ast.args as never[], state as never, this.metadata("MEAN"), (...args: number[]) => {
      if (args.length < 1) return new CellError(ErrorType.VALUE, "MEAN received an invalid argument count.");
      return calculateAverage(args);
    });
  }
}

class SdPlugin extends FunctionPlugin {
  static implementedFunctions = {
    SD: {
      method: "sd",
      parameters: [{ argumentType: FunctionArgumentType.NUMBER }],
      repeatLastArgs: 1,
    },
    STDEV: {
      method: "stdev",
      parameters: [{ argumentType: FunctionArgumentType.NUMBER }],
      repeatLastArgs: 1,
    },
  };

  sd(ast: { args: unknown[] }, state: unknown) {
    return this.runFunction(ast.args as never[], state as never, this.metadata("SD"), (...args: number[]) => {
      if (args.length < 2) return new CellError(ErrorType.VALUE, "SD received an invalid argument count.");
      return calculateSampleStandardDeviation(args);
    });
  }

  stdev(ast: { args: unknown[] }, state: unknown) {
    return this.runFunction(ast.args as never[], state as never, this.metadata("STDEV"), (...args: number[]) => {
      if (args.length < 2) return new CellError(ErrorType.VALUE, "STDEV received an invalid argument count.");
      return calculateSampleStandardDeviation(args);
    });
  }
}

class RdPlugin extends FunctionPlugin {
  static implementedFunctions = {
    RD: {
      method: "rd",
      parameters: [{ argumentType: FunctionArgumentType.NUMBER }],
      repeatLastArgs: 1,
    },
  };

  rd(ast: { args: unknown[] }, state: unknown) {
    return this.runFunction(ast.args as never[], state as never, this.metadata("RD"), (...args: number[]) => {
      if (args.length < 2) return new CellError(ErrorType.VALUE, "RD received an invalid argument count.");
      const denominator = calculateAverage(args);
      if (denominator === 0) return new CellError(ErrorType.DIV_BY_ZERO, "RD denominator is zero.");
      return ((Math.max(...args) - Math.min(...args)) / Math.abs(denominator)) * 100;
    });
  }
}

class RsdPlugin extends FunctionPlugin {
  static implementedFunctions = {
    RSD: {
      method: "rsd",
      parameters: [{ argumentType: FunctionArgumentType.NUMBER }],
      repeatLastArgs: 1,
    },
  };

  rsd(ast: { args: unknown[] }, state: unknown) {
    return this.runFunction(ast.args as never[], state as never, this.metadata("RSD"), (...args: number[]) => {
      if (args.length < 2) return 0;
      const mean = calculateAverage(args);
      if (mean === 0) return new CellError(ErrorType.DIV_BY_ZERO, "RSD mean is zero.");
      return (calculateSampleStandardDeviation(args) / Math.abs(mean)) * 100;
    });
  }
}

export class HyperFormulaAdapter implements FormulaEngineAdapter {
  readonly kind = "hyperformula" as const;

  evaluate(input: FormulaEvaluationInput): FormulaEvaluationResult {
    registerFormulaPlugins();

    const fields = input.model.fields;
    if (fields.some((field) => field.formula && durationUnit(field))) {
      return new SimpleFormulaAdapter().evaluate(input);
    }
    const catalog = createReferenceCatalog(fields);
    const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
    const values = createInitialValues(fields, input.values);
    const cellByFieldKey = createTemporaryCellMap(fields);
    const errors: FormulaEvaluationError[] = [];
    const sheet = fields.map((field) => {
        if (!field.formula) return [values[field.fieldKey] ?? null];
      try {
        const expression = parseFormulaExpression(field.formula);
        validateFormulaFunctionArguments(expression, (reference) => isInputReference(reference, catalog, fieldByKey));
        let hasMissingReference = false;
        for (const reference of collectFormulaReferences(expression)) {
          if (!catalog.resolve(reference)) {
            errors.push(missingFieldError(field.fieldKey, reference, field.formula));
            hasMissingReference = true;
          }
        }
        if (hasMissingReference) return [null];
        const formula = emitHyperFormulaExpression(expression, (reference) => {
          const fieldKey = catalog.resolve(reference);
          if (!fieldKey) throw new Error(`Formula references missing field "${reference}".`);
          return cellByFieldKey.get(fieldKey) ?? "";
        });
        return [`=${formula}`];
      } catch (error) {
        errors.push(parseFormulaError(error, field.fieldKey, field.formula));
        return [null];
      }
    });

    const hf = HyperFormula.buildFromArray(sheet, { licenseKey: "gpl-v3" });
    const targets = new Set(input.targetFieldKeys?.length ? input.targetFieldKeys : fields.map((field) => field.fieldKey));

    for (const [row, field] of fields.entries()) {
      if (!targets.has(field.fieldKey)) continue;
      const value = hf.getCellValue({ sheet: 0, row, col: 0 });
      if (value instanceof DetailedCellError) {
        errors.push(mapHyperFormulaError(value, field));
        values[field.fieldKey] = null;
      } else {
        values[field.fieldKey] = normalizeHyperFormulaValue(value);
      }
    }

    hf.destroy();
    const resultErrors = dedupeErrors(errors);
    return { adapter: this.kind, ok: resultErrors.length === 0, values, errors: resultErrors };
  }
}

function registerFormulaPlugins() {
  if (formulaPluginsRegistered) return;
  registerFunctionPlugin("AVG", AvgPlugin);
  registerFunctionPlugin("MEAN", MeanPlugin);
  registerSdPlugin();
  registerFunctionPlugin("RD", RdPlugin);
  registerFunctionPlugin("RSD", RsdPlugin);
  formulaPluginsRegistered = true;
}

function registerFunctionPlugin(functionName: string, plugin: FunctionPluginDefinition) {
  if (!HyperFormula.getFunctionPlugin(functionName)) {
    HyperFormula.registerFunctionPlugin(plugin, { enGB: { [functionName]: functionName } });
  }
}

function registerSdPlugin() {
  if (!HyperFormula.getFunctionPlugin("SD")) {
    HyperFormula.registerFunctionPlugin(SdPlugin, { enGB: { SD: "SD", STDEV: "STDEV" } });
  }
}

function calculateAverage(numbers: number[]) {
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function calculateSampleStandardDeviation(numbers: number[]) {
  const mean = calculateAverage(numbers);
  return Math.sqrt(numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (numbers.length - 1));
}

function createTemporaryCellMap(fields: FormulaField[]) {
  const map = new Map<string, string>();
  for (const [index, field] of fields.entries()) {
    map.set(field.fieldKey, `A${index + 1}`);
  }
  return map;
}

function isInputReference(reference: string, catalog: ReturnType<typeof createReferenceCatalog>, fieldByKey: Map<string, FormulaField>) {
  if (/^[xypz]\d+$/i.test(reference.trim())) return true;
  const field = fieldByKey.get(catalog.resolve(reference) ?? "");
  if (!field) return false;
  if (field.slotKind === "variable" || field.slotKind === "parameter") return true;
  return field.attr === "fillable" && (field.valueType === "number" || field.inputType === "number" || field.inputType === "field");
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

function normalizeHyperFormulaValue(value: unknown): FormulaValue {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  return null;
}

function mapHyperFormulaError(error: DetailedCellError, field: FormulaField): FormulaEvaluationError {
  if (error.type === ErrorType.CYCLE) {
    return {
      type: "circular_dependency",
      fieldKey: field.fieldKey,
      expression: field.formula ?? undefined,
      message: "Formula contains a circular dependency.",
    };
  }
  if (error.type === ErrorType.NAME && /Function name/i.test(error.message)) {
    return {
      type: "invalid_function",
      fieldKey: field.fieldKey,
      expression: field.formula ?? undefined,
      message: error.message,
    };
  }
  if (error.type === ErrorType.NAME || error.type === ErrorType.REF) {
    return {
      type: "missing_field",
      fieldKey: field.fieldKey,
      expression: field.formula ?? undefined,
      message: error.message || "Formula references a missing field.",
    };
  }
  return {
    type: "invalid_expression",
    fieldKey: field.fieldKey,
    expression: field.formula ?? undefined,
    message: error.message || "Invalid formula expression.",
  };
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

function dedupeErrors(errors: FormulaEvaluationError[]) {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.type}:${error.fieldKey ?? ""}:${error.reference ?? ""}:${error.functionName ?? ""}:${error.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
