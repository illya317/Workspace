import { BoundedReferenceCombinationSolver } from "./bounded-reference-adapter";
import type { CombinationSolverAdapter } from "./types";

export interface CombinationSolverFactoryOptions {
  /**
   * Injected adapter: a fake in unit tests, or a future optional dpss/WASM
   * implementation. Callers never construct adapters directly.
   */
  adapter?: CombinationSolverAdapter;
}

export function createCombinationSolver(options: CombinationSolverFactoryOptions = {}): CombinationSolverAdapter {
  return options.adapter ?? createBoundedReferenceCombinationSolver();
}

export function createBoundedReferenceCombinationSolver(): CombinationSolverAdapter {
  return new BoundedReferenceCombinationSolver();
}
