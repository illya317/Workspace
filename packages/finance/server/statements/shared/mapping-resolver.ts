export type StatementMappingOperator = "add" | "subtract" | "exclude";

export interface StatementMappingEntry {
  lineCode: string;
  operator: StatementMappingOperator;
}

export interface InMemoryMappingResult {
  resolvedLineCode: string | null;
  explicitLineCode: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  ancestorAccountCode: string | null;
  effectiveOperator: StatementMappingOperator | null;
}

export function buildParentChain(
  accountCode: string,
  parentMap: Map<string, string | null>,
): string[] {
  const chain: string[] = [accountCode];
  const parent = parentMap.get(accountCode);
  if (parent) return [...chain, ...buildParentChain(parent, parentMap)];

  let code = accountCode;
  while (code.length > 1) {
    code = code.slice(0, -1);
    if (code.length > 0) chain.push(code);
  }
  return chain;
}

export function resolveMappedLineCode(
  accountCode: string,
  parentMap: Map<string, string | null>,
  mappingMap: Map<string, string>,
): string | null {
  const chain = buildParentChain(accountCode, parentMap);
  for (const code of chain) {
    const line = mappingMap.get(code);
    if (line) return line;
  }
  return null;
}

export function resolveMappedLineWithOperator(
  accountCode: string,
  parentMap: Map<string, string | null>,
  mappingMap: Map<string, string>,
  operatorMap: Map<string, StatementMappingOperator>,
): { lineCode: string; operator: "add" | "subtract" } | null {
  const chain = buildParentChain(accountCode, parentMap);
  for (const code of chain) {
    const line = mappingMap.get(code);
    if (line) {
      const operator = operatorMap.get(code) || "add";
      if (operator === "exclude") return null;
      return { lineCode: line, operator };
    }
  }
  return null;
}

export function resolveInMemoryAccountMapping(
  accountCode: string,
  parentMap: Map<string, string | null>,
  mappingMap: Map<string, StatementMappingEntry>,
): InMemoryMappingResult {
  const chain = buildParentChain(accountCode, parentMap);
  for (const code of chain) {
    const entry = mappingMap.get(code);
    if (entry) {
      if (entry.operator === "exclude") {
        return {
          explicitLineCode: null,
          resolvedLineCode: null,
          mappingSource: "explicit",
          ancestorAccountCode: null,
          effectiveOperator: "exclude",
        };
      }
      return {
        explicitLineCode: code === accountCode ? entry.lineCode : null,
        resolvedLineCode: entry.lineCode,
        mappingSource: code === accountCode ? "explicit" : "inherited",
        ancestorAccountCode: code === accountCode ? null : code,
        effectiveOperator: entry.operator,
      };
    }
  }
  return {
    explicitLineCode: null,
    resolvedLineCode: null,
    mappingSource: "none",
    ancestorAccountCode: null,
    effectiveOperator: null,
  };
}
