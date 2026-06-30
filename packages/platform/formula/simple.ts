import { SimpleFormulaAdapter } from "./simple-adapter";

export function createSimpleFormulaEngine() {
  return new SimpleFormulaAdapter();
}

export { SimpleFormulaAdapter };
export type {
  FormulaEngineAdapter,
  FormulaEvaluationError,
  FormulaEvaluationInput,
  FormulaEvaluationResult,
  FormulaField,
  FormulaModel,
  FormulaValue,
} from "./types";
