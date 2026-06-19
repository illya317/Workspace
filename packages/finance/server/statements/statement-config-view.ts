/**
 * M5: 报表配置视图服务
 *
 * 组装 GET /api/finance/statement-config 的完整 DTO：
 * - lineConfigs: 报表项目配置
 * - accountTree: L1→L2→L3 科目余额树
 * - mappingPreview: 每个科目节点的报表项目归属
 */
import { prisma } from "@workspace/platform/server/prisma";
import { loadBalanceSheetConfig } from "./config/load-config";
import { checkAccountBalanceTree, type AccountNode } from "./account-balance-check";
import { ensureStatementMappings } from "./mapping/seed-from-config";

// ─── Types ─────────────────────────────────────────────────

export interface MappingNode {
  accountCode: string;
  accountName: string;
  level: number;
  closingDebit: number;
  closingCredit: number;
  net: number;
  resolvedLineCode: string | null;
  explicitLineCode: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  ancestorAccountCode: string | null;
  /** Effective operator: based on nearest ancestor's mapping operator */
  effectiveOperator: "add" | "subtract" | "exclude" | null;
  children: MappingNode[];
}

export interface StatementConfigView {
  lineConfigs: ReturnType<typeof loadBalanceSheetConfig> extends Promise<infer T> ? T : never;
  accountTree: AccountNode[] | null;
  mappingPreview: MappingNode[] | null;
  month: number | null;
}

export interface SaveStatementConfigLineInput {
  lineCode: string;
  prefixes?: unknown[];
  subtractPrefixes?: unknown[];
  reclassSource?: boolean;
  reclassTarget?: boolean;
  label?: string;
  section?: string;
  enabled?: boolean;
}

export interface SaveStatementConfigLinesInput {
  companyCode: string;
  year: number;
  lines: SaveStatementConfigLineInput[];
}

// ─── Main ──────────────────────────────────────────────────

export async function getStatementConfigView(
  companyCode: string,
  year: number,
  statementType: string = "balance",
): Promise<StatementConfigView> {
  // 1. Ensure mappings exist (inherit/copy/migrate if needed)
  await ensureStatementMappings(companyCode, year, statementType);

  // 2. Load line configs (inherit from prev year / seed from TS)
  const lineConfigs = await loadBalanceSheetConfig(companyCode, year);

  // 3. Find a period — prefer month 12, fallback to latest
  const period =
    (await prisma.financePeriod.findFirst({
      where: { companyCode, year, month: 12 },
    })) ??
    (await prisma.financePeriod.findFirst({
      where: { companyCode, year },
      orderBy: { month: "desc" },
    }));

  if (!period) {
    return { lineConfigs, accountTree: null, mappingPreview: null, month: null };
  }

  // 4. Build account tree
  const { tree } = await checkAccountBalanceTree(companyCode, year, period.month);

  // 5. Preload accounts for in-memory parent-chain resolution
  const accounts = await prisma.financeAccount.findMany({
    where: { companyCode, year },
    select: { code: true, parent: { select: { code: true } } },
  });
  const parentMap = new Map<string, string | null>();
  for (const a of accounts) {
    parentMap.set(a.code, a.parent?.code ?? null);
  }

  // 6. Preload mappings with operator
  const mappings = await prisma.financeStatementAccountMapping.findMany({
    where: { companyCode, year, statementType },
    select: { accountCode: true, lineCode: true, operator: true },
  });
  const mappingMap = new Map<string, { lineCode: string; operator: "add" | "subtract" | "exclude" }>();
  for (const m of mappings) mappingMap.set(m.accountCode, { lineCode: m.lineCode, operator: (m.operator as "add" | "subtract" | "exclude") || "add" });

  // 7. Build mapping preview
  const mappingPreview = tree.map((node) =>
    toMappingNode(node, parentMap, mappingMap),
  );

  return { lineConfigs, accountTree: tree, mappingPreview, month: period.month };
}

export async function saveStatementConfigLines(input: SaveStatementConfigLinesInput) {
  for (const line of input.lines) {
    await prisma.financeStatementLineConfig.update({
      where: {
        companyCode_year_reportType_lineCode: {
          companyCode: input.companyCode,
          year: input.year,
          reportType: "balanceSheet",
          lineCode: line.lineCode,
        },
      },
      data: {
        prefixesJson: JSON.stringify(line.prefixes || []),
        subtractPrefixesJson: JSON.stringify(line.subtractPrefixes || []),
        reclassSource: line.reclassSource ?? undefined,
        reclassTarget: line.reclassTarget ?? undefined,
        label: line.label ?? undefined,
        section: line.section ?? undefined,
        enabled: line.enabled ?? undefined,
      },
    });
  }

  return { success: true, updated: input.lines.length };
}

// ─── Mapping resolution ────────────────────────────────────

function buildParentChain(
  accountCode: string,
  parentMap: Map<string, string | null>,
): string[] {
  const chain: string[] = [accountCode];
  const parent = parentMap.get(accountCode);
  if (parent) {
    return [...chain, ...buildParentChain(parent, parentMap)];
  }
  // Prefix fallback for accounts without parentId linkage
  let code = accountCode;
  while (code.length > 1) {
    code = code.slice(0, -1);
    if (code.length > 0) chain.push(code);
  }
  return chain;
}

interface MappingResult {
  resolvedLineCode: string | null;
  explicitLineCode: string | null;
  mappingSource: "explicit" | "inherited" | "none";
  ancestorAccountCode: string | null;
  effectiveOperator: "add" | "subtract" | "exclude" | null;
}

function resolveAccountMapping(
  accountCode: string,
  parentMap: Map<string, string | null>,
  mappingMap: Map<string, { lineCode: string; operator: "add" | "subtract" | "exclude" }>,
): MappingResult {
  const chain = buildParentChain(accountCode, parentMap);
  for (const code of chain) {
    const entry = mappingMap.get(code);
    if (entry) {
      if (entry.operator === "exclude") {
        return { explicitLineCode: null, resolvedLineCode: null, mappingSource: "explicit", ancestorAccountCode: null, effectiveOperator: "exclude" };
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
  return { explicitLineCode: null, resolvedLineCode: null, mappingSource: "none", ancestorAccountCode: null, effectiveOperator: null };
}

// ─── Tree conversion ───────────────────────────────────────

function toMappingNode(
  node: AccountNode,
  parentMap: Map<string, string | null>,
  mappingMap: Map<string, { lineCode: string; operator: "add" | "subtract" | "exclude" }>,
): MappingNode {
  const mapping = resolveAccountMapping(node.code, parentMap, mappingMap);
  return {
    accountCode: node.code,
    accountName: node.name,
    level: node.level,
    closingDebit: node.closingDebit,
    closingCredit: node.closingCredit,
    net: node.net,
    resolvedLineCode: mapping.resolvedLineCode,
    explicitLineCode: mapping.explicitLineCode,
    mappingSource: mapping.mappingSource,
    ancestorAccountCode: mapping.ancestorAccountCode,
    effectiveOperator: mapping.effectiveOperator,
    children: node.children.map((c) => toMappingNode(c, parentMap, mappingMap)),
  };
}
