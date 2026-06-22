/**
 * M3: 科目→报表项目解析器（最近祖先优先）
 *
 * 优先用 FinanceAccount.parentId 构建 parent chain。
 * parent 缺失时 prefix fallback。
 */
import { prisma } from "@workspace/platform/server/prisma";
import type { MappingResolveResult } from "./types";
import { buildStatementMappingCommand } from "../../domain/finance-validation";

let _cache: Map<string, { lineCode: string; operator: "add" | "subtract" | "exclude" }> | null = null;
let _cacheKey = "";

export async function resolveAccountLine(
  companyCode: string, year: number, statementType: string, accountCode: string,
): Promise<string | null> {
  const result = await resolveAccountMapping(companyCode, year, statementType, accountCode);
  return result.resolvedLineCode;
}

export async function resolveAccountMapping(
  companyCode: string, year: number, statementType: string, accountCode: string,
): Promise<MappingResolveResult> {
  const map = await loadMappingCache(companyCode, year, statementType);

  // Build parent chain (prefer actual hierarchy, fallback to prefix)
  const chain = await buildParentChain(companyCode, year, accountCode);

  // Look for nearest ancestor with mapping
  for (const code of chain) {
    const entry = map.get(code);
    if (entry) {
      // exclude: stop inheritance, this account is explicitly excluded
      if (entry.operator === "exclude") {
        return { accountCode, explicitLineCode: null, resolvedLineCode: null, mappingSource: "explicit", ancestorAccountCode: null, effectiveOperator: "exclude" };
      }
      return {
        accountCode,
        explicitLineCode: code === accountCode ? entry.lineCode : null,
        resolvedLineCode: entry.lineCode,
        mappingSource: code === accountCode ? "explicit" : "inherited",
        ancestorAccountCode: code === accountCode ? null : code,
        effectiveOperator: entry.operator,
      };
    }
  }

  return { accountCode, explicitLineCode: null, resolvedLineCode: null, mappingSource: "none", ancestorAccountCode: null, effectiveOperator: null };
}

async function buildParentChain(companyCode: string, year: number, accountCode: string): Promise<string[]> {
  const chain: string[] = [accountCode];

  // Try parentId-based lookup (must scope by company+year)
  const account = await prisma.financeAccount.findUnique({
    where: { code_companyCode_year: { code: accountCode, companyCode, year } },
    select: { parentId: true, parent: { select: { code: true } } },
  });

  if (account?.parent) {
    const parentChain = await buildParentChain(companyCode, year, account.parent.code);
    return [...chain, ...parentChain];
  }

  // Fallback: prefix slicing for accounts without parentId links
  let code = accountCode;
  while (code.length > 1) {
    code = code.slice(0, -1);
    if (code.length > 0) chain.push(code);
  }
  return chain;
}

async function loadMappingCache(
  companyCode: string, year: number, statementType: string,
): Promise<Map<string, { lineCode: string; operator: "add" | "subtract" | "exclude" }>> {
  const key = `${companyCode}:${year}:${statementType}`;
  if (_cache && _cacheKey === key) return _cache;

  const mappings = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode, year, statementType },
    select: { accountCode: true, lineCode: true, operator: true },
    orderBy: { accountCode: "asc" },
  });

  const map = new Map<string, { lineCode: string; operator: "add" | "subtract" | "exclude" }>();
  for (const m of mappings) map.set(m.accountCode, { lineCode: m.lineCode, operator: (m.operator as "add" | "subtract" | "exclude") || "add" });
  _cache = map;
  _cacheKey = key;
  return map;
}

export function clearMappingCache() {
  const command = buildStatementMappingCommand({ companyCode: "cache", year: new Date().getFullYear() });
  if (!command.ok) throw new Error(command.issue.message);
  _cache = null;
  _cacheKey = "";
}
