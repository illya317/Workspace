import type { StatementMappingOperator } from "../shared/mapping-resolver";
import {
  BALANCE_SHEET_LINES,
  type BalanceSheetLineConfig,
  type LineSide,
} from "./balance-sheet-lines";

export interface FixedBalanceAssignments {
  mappingMap: Map<string, string>;
  operatorMap: Map<string, StatementMappingOperator>;
}

/** The statutory balance-sheet assignment is a checked-in product invariant. */
export function buildFixedBalanceAssignments(
  lines: readonly BalanceSheetLineConfig[] = BALANCE_SHEET_LINES,
): FixedBalanceAssignments {
  const mappingMap = new Map<string, string>();
  const operatorMap = new Map<string, StatementMappingOperator>();

  for (const line of lines) {
    registerPrefixes(mappingMap, operatorMap, line, line.prefixes, "add");
    registerPrefixes(mappingMap, operatorMap, line, line.subtractPrefixes, "subtract");
  }

  return { mappingMap, operatorMap };
}

export function buildFixedBalanceLineSideMap(
  lines: readonly BalanceSheetLineConfig[] = BALANCE_SHEET_LINES,
): Map<string, LineSide> {
  return new Map(lines.map((line) => [line.lineCode, line.side]));
}

function registerPrefixes(
  mappingMap: Map<string, string>,
  operatorMap: Map<string, StatementMappingOperator>,
  line: BalanceSheetLineConfig,
  prefixes: readonly string[] | undefined,
  operator: StatementMappingOperator,
): void {
  for (const prefix of prefixes ?? []) {
    if (!prefix) continue;
    const existing = mappingMap.get(prefix);
    if (existing && existing !== line.lineCode) {
      throw new Error(`固定报表配置重复映射：${prefix} 同时属于 ${existing} 和 ${line.lineCode}`);
    }
    mappingMap.set(prefix, line.lineCode);
    operatorMap.set(prefix, operator);
  }
}
