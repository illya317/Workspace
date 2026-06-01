/**
 * 科目→报表项目映射解析器（最近祖先优先）
 *
 * 规则：给一个叶子科目编码，向上查找最近祖先的 mapping。
 * 无需手动 exclude —— 更深层的 mapping 自动覆盖父级。
 */
import { prisma } from "@/lib/prisma";

let _cache: Map<string, string> | null = null;
let _cacheKey = "";

export async function resolveAccountLine(
  companyCode: string, year: number, statementType: string, accountCode: string,
): Promise<string | null> {
  const map = await loadMappingCache(companyCode, year, statementType);
  // 向上查找最近祖先
  let code = accountCode;
  while (code.length > 0) {
    const line = map.get(code);
    if (line) return line;
    code = code.slice(0, -1);
  }
  return null;
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
