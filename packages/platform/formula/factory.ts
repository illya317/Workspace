import { HyperFormulaAdapter } from "./hyperformula-adapter";
import { SimpleFormulaAdapter } from "./simple-adapter";
import type { FormulaEngineAdapter, FormulaEngineOptions } from "./types";

export function createSimpleFormulaEngine(): FormulaEngineAdapter {
  return new SimpleFormulaAdapter();
}

export function createFormulaEngine(options: FormulaEngineOptions = {}): FormulaEngineAdapter {
  if (options.preferred === "simple") return new SimpleFormulaAdapter();

  try {
    return new HyperFormulaAdapter();
  } catch {
    return new SimpleFormulaAdapter();
  }
}
