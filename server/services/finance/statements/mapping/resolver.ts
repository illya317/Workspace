/**
 * M3: 科目→报表项目解析器（最近祖先优先）
 *
 * 优先用 FinanceAccount.parentId 构建 parent chain。
 * parent 缺失时 prefix fallback。
 */
import { prisma } from "@/lib/prisma";
import type { MappingResolveResult } from "./types";

let _cache: Map<string, string> | null = null;
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
  const chain = await buildParentChain(accountCode);

  // Look for nearest ancestor with mapping
  for (const code of chain) {
    const line = map.get(code);
    if (line) {
      return {
        accountCode,
        explicitLineCode: code === accountCode ? line : null,
        resolvedLineCode: line,
        mappingSource: code === accountCode ? "explicit" : "inherited",
        ancestorAccountCode: code === accountCode ? null : code,
      };
    }
  }

  return { accountCode, explicitLineCode: null, resolvedLineCode: null, mappingSource: "none", ancestorAccountCode: null };
}

async function buildParentChain(accountCode: string): Promise<string[]> {
  const chain: string[] = [accountCode];

  // Try parentId-based lookup
  const account = await prisma.financeAccount.findFirst({
    where: { code: accountCode },
    select: { parentId: true, parent: { select: { code: true } } },
  });

  if (account?.parent) {
    const parentChain = await buildParentChain(account.parent.code);
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
): Promise<Map<string, string>> {
  const key = `${companyCode}:${year}:${statementType}`;
  if (_cache && _cacheKey === key) return _cache;

  const mappings = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode, year, statementType },
    select: { accountCode: true, lineCode: true },
    orderBy: { accountCode: "asc" },
  });

  const map = new Map<string, string>();
  for (const m of mappings) map.set(m.accountCode, m.lineCode);
  _cache = map;
  _cacheKey = key;
  return map;
}

export function clearMappingCache() { _cache = null; _cacheKey = ""; }
