import { prisma } from "@workspace/platform/server/prisma";
import type {
  ConsolidationEntityCoverage,
  ConsolidationOverview,
  ConsolidationPeriodOption,
  StatementSourceCoverage,
} from "@workspace/finance/types";

interface ConsolidationOverviewInput {
  year?: number;
  month?: number;
}

const REPORT_TYPES = ["balanceSheet", "incomeStatement", "cashFlow"] as const;

function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function sourceCoverage(
  workpaper: {
    status: string;
    lines: {
      manualAmount: number;
      importedAmount: number;
      formulaText: string | null;
      source: string | null;
    }[];
  } | undefined,
  systemCount: number,
): StatementSourceCoverage {
  if (workpaper) {
    const submitted = workpaper.status === "submitted";
    const lineCount = workpaper.lines.length;
    const sourcedLineCount = workpaper.lines.filter((line) => Boolean(line.source?.trim())).length;
    const manualLineCount = workpaper.lines.filter((line) => Math.abs(line.manualAmount) > 0.005).length;
    const importedLineCount = workpaper.lines.filter((line) => Math.abs(line.importedAmount) > 0.005).length;
    const formulaLineCount = workpaper.lines.filter((line) => Boolean(line.formulaText?.trim())).length;
    const lineage = [
      `${lineCount} 行`,
      `${sourcedLineCount} 行有来源`,
      `${importedLineCount} 行导入`,
      `${manualLineCount} 行手工`,
      `${formulaLineCount} 行公式`,
    ].join(" · ");
    return {
      kind: "workpaper",
      status: submitted ? "submitted" : "draft",
      label: submitted ? "已提交底稿" : "底稿草稿",
      detail: lineage,
      lineCount,
      sourcedLineCount,
      manualLineCount,
      importedLineCount,
      formulaLineCount,
    };
  }
  if (systemCount > 0) {
    return {
      kind: "system",
      status: "available",
      label: "系统账回退",
      detail: `${systemCount} 条期间事实；尚未形成可复核底稿来源链`,
      lineCount: 0,
      sourcedLineCount: 0,
      manualLineCount: 0,
      importedLineCount: 0,
      formulaLineCount: 0,
    };
  }
  return {
    kind: "missing",
    status: "missing",
    label: "缺少来源",
    detail: "当前期间既无底稿，也无可用系统账事实",
    lineCount: 0,
    sourcedLineCount: 0,
    manualLineCount: 0,
    importedLineCount: 0,
    formulaLineCount: 0,
  };
}

function entityStatus(entity: Pick<ConsolidationEntityCoverage, "balanceSheet" | "incomeStatement" | "cashFlow" | "role" | "shareRatio">) {
  const sources = [entity.balanceSheet, entity.incomeStatement, entity.cashFlow];
  if (entity.role === "子公司" && entity.shareRatio === null) return "blocked" as const;
  if (sources.some((source) => source.kind === "missing")) return "blocked" as const;
  if (sources.some((source) => source.kind === "system" || source.status === "draft")) return "attention" as const;
  return "ready" as const;
}

export async function loadConsolidationOverview(
  input: ConsolidationOverviewInput = {},
): Promise<ConsolidationOverview> {
  const relations = await prisma.companyRelation.findMany({
    where: { isConsolidated: true },
    include: {
      parent: { select: { id: true, code: true, name: true, fullName: true, sortOrder: true } },
      child: { select: { code: true, name: true, fullName: true, sortOrder: true } },
    },
    orderBy: [{ parentId: "asc" }, { child: { sortOrder: "asc" } }],
  });

  const grouped = new Map<number, typeof relations>();
  for (const relation of relations) {
    const group = grouped.get(relation.parentId) ?? [];
    group.push(relation);
    grouped.set(relation.parentId, group);
  }
  const scopeRelations = [...grouped.values()].sort((left, right) => {
    const countDifference = right.length - left.length;
    if (countDifference !== 0) return countDifference;
    return (left[0]?.parent.sortOrder ?? 0) - (right[0]?.parent.sortOrder ?? 0);
  })[0] ?? [];
  const parent = scopeRelations[0]?.parent ?? null;
  const companyCodes = parent
    ? [parent.code, ...scopeRelations.map((relation) => relation.child.code)]
    : [];

  const [factPeriods, workpaperPeriods] = companyCodes.length > 0
    ? await Promise.all([
        prisma.financePeriod.findMany({
          where: {
            companyCode: { in: companyCodes },
            OR: [
              { balances: { some: {} } },
              { vouchers: { some: {} } },
              { cashFlowAllocations: { some: {} } },
            ],
          },
          select: { year: true, month: true },
        }),
        prisma.financeStatementWorkpaper.findMany({
          where: { companyCode: { in: companyCodes } },
          select: { year: true, month: true },
        }),
      ])
    : [[], []];
  const periodMap = new Map<string, ConsolidationPeriodOption>();
  for (const period of [...factPeriods, ...workpaperPeriods]) {
    periodMap.set(periodKey(period.year, period.month), {
      year: period.year,
      month: period.month,
      label: `${period.year}年${period.month}月`,
    });
  }
  const availablePeriods = [...periodMap.values()].sort((left, right) =>
    right.year - left.year || right.month - left.month,
  );
  const requestedPeriod = input.year && input.month
    ? periodMap.get(periodKey(input.year, input.month))
    : undefined;
  const now = new Date();
  const latestCurrentPeriod = availablePeriods.find((period) =>
    period.year < now.getFullYear()
      || (period.year === now.getFullYear() && period.month <= now.getMonth() + 1),
  );
  const selectedPeriod = requestedPeriod ?? latestCurrentPeriod ?? availablePeriods[0] ?? {
    year: input.year ?? now.getFullYear(),
    month: input.month ?? 12,
    label: `${input.year ?? now.getFullYear()}年${input.month ?? 12}月`,
  };

  const [periodFacts, workpapers] = companyCodes.length > 0
    ? await Promise.all([
        prisma.financePeriod.findMany({
          where: {
            companyCode: { in: companyCodes },
            year: selectedPeriod.year,
            month: selectedPeriod.month,
          },
          select: {
            companyCode: true,
            _count: { select: { balances: true, vouchers: true, cashFlowAllocations: true } },
          },
        }),
        prisma.financeStatementWorkpaper.findMany({
          where: {
            companyCode: { in: companyCodes },
            year: selectedPeriod.year,
            month: selectedPeriod.month,
            reportType: { in: [...REPORT_TYPES] },
          },
          select: {
            companyCode: true,
            reportType: true,
            status: true,
            lines: {
              select: {
                manualAmount: true,
                importedAmount: true,
                formulaText: true,
                source: true,
              },
            },
          },
        }),
      ])
    : [[], []];
  const factsByCompany = new Map(periodFacts.map((period) => [period.companyCode, period._count]));
  const workpapersByCompanyAndType = new Map(
    workpapers.map((workpaper) => [`${workpaper.companyCode}:${workpaper.reportType}`, workpaper]),
  );
  const companyRows = parent
    ? [
        { code: parent.code, name: parent.fullName || parent.name, role: "母公司" as const, shareRatio: 1 },
        ...scopeRelations.map((relation) => ({
          code: relation.child.code,
          name: relation.child.fullName || relation.child.name,
          role: "子公司" as const,
          shareRatio: relation.shareRatio,
        })),
      ]
    : [];
  const entities: ConsolidationEntityCoverage[] = companyRows.map((company) => {
    const facts = factsByCompany.get(company.code);
    const row = {
      ...company,
      balanceSheet: sourceCoverage(
        workpapersByCompanyAndType.get(`${company.code}:balanceSheet`),
        facts?.balances ?? 0,
      ),
      incomeStatement: sourceCoverage(
        workpapersByCompanyAndType.get(`${company.code}:incomeStatement`),
        facts?.vouchers ?? 0,
      ),
      cashFlow: sourceCoverage(
        workpapersByCompanyAndType.get(`${company.code}:cashFlow`),
        facts?.cashFlowAllocations ?? 0,
      ),
    };
    return { ...row, status: entityStatus(row) };
  });
  const sources = entities.flatMap((entity) => [entity.balanceSheet, entity.incomeStatement, entity.cashFlow]);
  const coveredSources = sources.filter((source) => source.kind !== "missing").length;
  const submittedWorkpapers = sources.filter((source) => source.status === "submitted").length;
  const missingOwnership = scopeRelations.filter((relation) => relation.shareRatio === null).length;
  const missingSources = sources.filter((source) => source.kind === "missing").length;
  const fallbackSources = sources.filter((source) => source.kind === "system" || source.status === "draft").length;
  const checks: ConsolidationOverview["checks"] = [
    {
      key: "scope",
      label: "合并范围",
      status: parent && scopeRelations.length > 0 ? "ready" : "blocked",
      detail: parent
        ? `${parent.fullName || parent.name}及 ${scopeRelations.length} 家纳入合并的子公司`
        : "未找到已标记纳入合并的母子公司关系",
    },
    {
      key: "ownership",
      label: "股权比例与少数股东口径",
      status: missingOwnership === 0 && scopeRelations.length > 0 ? "ready" : "blocked",
      detail: missingOwnership === 0
        ? "纳入合并的子公司均已维护持股比例"
        : `${missingOwnership} 家子公司缺少持股比例，无法计算少数股东权益和损益`,
    },
    {
      key: "sources",
      label: "个别三表与来源链",
      status: missingSources > 0 ? "blocked" : fallbackSources > 0 ? "attention" : sources.length > 0 ? "ready" : "blocked",
      detail: missingSources > 0
        ? `${missingSources} 份个别报表缺少来源`
        : fallbackSources > 0
          ? `${fallbackSources} 份报表仍是草稿或系统账回退，需形成并提交底稿`
          : `${submittedWorkpapers} 份个别报表底稿已提交`,
    },
    {
      key: "fx",
      label: "外币折算与汇率复核",
      status: "blocked",
      detail: "尚无外币本位币、历史汇率、期末折算价和折算差额的可追溯主数据",
    },
    {
      key: "eliminations",
      label: "合并抵销与税务影响",
      status: "blocked",
      detail: "尚无内部往来、内部交易、投资与权益、未实现损益及递延所得税抵销底稿",
    },
    {
      key: "review",
      label: "编制、复核、锁定与发布",
      status: "blocked",
      detail: "尚无合并批次、复核人、复核意见、锁定版本和发布记录",
    },
  ];
  const blockerCount = checks.filter((check) => check.status === "blocked").length;

  return {
    scope: {
      parent: parent ? { code: parent.code, name: parent.name, fullName: parent.fullName } : null,
      year: selectedPeriod.year,
      month: selectedPeriod.month,
      periodLabel: `${selectedPeriod.year}年${selectedPeriod.month}月`,
      availablePeriods,
    },
    metrics: {
      entityCount: entities.length,
      coveredSources,
      totalSources: entities.length * 3,
      submittedWorkpapers,
      blockerCount,
    },
    entities,
    checks,
    eliminations: [
      { key: "investment-equity", label: "长期股权投资与子公司权益", description: "抵销母公司投资与子公司所有者权益，并拆分少数股东权益。", status: "notStarted" },
      { key: "intercompany-balances", label: "内部往来与减值", description: "核对并抵销应收应付、借款、资金往来及相关坏账准备。", status: "notStarted" },
      { key: "internal-trading", label: "内部交易与未实现损益", description: "抵销内部收入成本、存货和长期资产未实现损益及后续折旧摊销。", status: "notStarted" },
      { key: "income-dividend", label: "投资收益、利息与股利", description: "抵销内部利息、股利和投资收益，保留对外交易结果。", status: "notStarted" },
      { key: "cash-flow", label: "内部现金流", description: "抵销母子公司及子公司之间的内部现金收付。", status: "notStarted" },
      { key: "tax", label: "所得税影响", description: "计算抵销分录产生的递延所得税影响。", status: "notStarted" },
    ],
    fxPolicy: {
      pair: "CAD/CNY",
      sourceName: "中国银行外汇牌价",
      sourceField: "中行折算价",
      unit: "人民币/100外币",
      sourceUrl: "https://www.boc.cn/sourcedb/whpj/",
      status: "notConfigured",
      closingRate: null,
      historicalRateCount: 0,
      note: "汇率源和取数时点尚未持久化；当前仅展示应执行的折算规则，不自动抓取或入账。",
    },
    outputs: [
      { key: "balanceSheet", label: "合并资产负债表", status: "unpublished", description: "完成范围、折算、抵销和复核锁定后生成。" },
      { key: "incomeStatement", label: "合并利润表", status: "unpublished", description: "完成内部交易、投资收益、少数股东损益等抵销后生成。" },
      { key: "cashFlow", label: "合并现金流量表", status: "unpublished", description: "完成内部现金流抵销和外币现金折算影响后生成。" },
    ],
    outputStatus: "blocked",
    outputMessage: `当前有 ${blockerCount} 项合并前置条件未满足；系统不会将母公司个别报表或未抵销汇总冒充合并报表。`,
  };
}
