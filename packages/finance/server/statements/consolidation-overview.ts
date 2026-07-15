import { prisma } from "@workspace/platform/server/prisma";
import type {
  ConsolidationEntityCoverage,
  ConsolidationOverview,
  ConsolidationPeriodOption,
  StatementSourceCoverage,
} from "@workspace/finance/types";
import { statementExchangeRateSnapshot } from "./exchange-rates";

interface ConsolidationOverviewInput {
  year?: number;
  month?: number;
}

const REPORT_TYPES = ["balanceSheet", "incomeStatement", "cashFlow"] as const;

function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function periodEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function isClosingRateNearPeriodEnd(rateDate: string, closingDate: string) {
  const day = 24 * 60 * 60 * 1000;
  const difference = (Date.parse(`${closingDate}T00:00:00Z`) - Date.parse(`${rateDate}T00:00:00Z`)) / day;
  return difference >= 0 && difference <= 7;
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
  const canadaCompanyCode = scopeRelations.find((relation) =>
    relation.child.code === "05" || (relation.child.fullName || relation.child.name).includes("加拿大"),
  )?.child.code ?? null;
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

  const selectedPeriodEnd = periodEndDate(selectedPeriod.year, selectedPeriod.month);
  const [periodFacts, workpapers, exchangeRateRows, investmentRows, canadaCurrencyAccountCount] = companyCodes.length > 0
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
        prisma.financeStatementExchangeRate.findMany({
          where: {
            baseCurrency: "CAD",
            quoteCurrency: "CNY",
            rateDate: { lte: selectedPeriodEnd },
          },
          orderBy: [{ rateDate: "desc" }, { updatedAt: "desc" }],
          take: 100,
        }),
        prisma.financeVoucherItem.findMany({
          where: {
            AND: [
              { voucher: { companyCode: { in: companyCodes }, date: { lte: selectedPeriodEnd } } },
              { account: { code: { startsWith: "1511" } } },
              {
                OR: [
                  { description: { contains: "北美研究院" } },
                  { voucher: { description: { contains: "北美研究院" } } },
                ],
              },
            ],
          },
          select: {
            id: true,
            debit: true,
            credit: true,
            description: true,
            currencyCode: true,
            exchangeRate: true,
            originalDebit: true,
            originalCredit: true,
            account: { select: { code: true } },
            voucher: {
              select: {
                voucherNo: true,
                date: true,
                description: true,
                companyCode: true,
              },
            },
          },
          orderBy: [{ voucher: { date: "desc" } }, { id: "desc" }],
          take: 100,
        }),
        canadaCompanyCode
          ? prisma.financeAccount.count({
              where: {
                companyCode: canadaCompanyCode,
                currency: { in: ["CAD", "加元"] },
              },
            })
          : Promise.resolve(0),
      ])
    : [[], [], [], [], 0];
  const factsByCompany = new Map(periodFacts.map((period) => [period.companyCode, period._count]));
  const workpapersByCompanyAndType = new Map(
    workpapers.map((workpaper) => [`${workpaper.companyCode}:${workpaper.reportType}`, workpaper]),
  );
  const companyRows = parent
    ? [
        {
          relationId: null,
          code: parent.code,
          name: parent.fullName || parent.name,
          role: "母公司" as const,
          parentCode: null,
          parentName: null,
          shareRatio: 1,
        },
        ...scopeRelations.map((relation) => ({
          relationId: relation.id,
          code: relation.child.code,
          name: relation.child.fullName || relation.child.name,
          role: "子公司" as const,
          parentCode: relation.parent.code,
          parentName: relation.parent.fullName || relation.parent.name,
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
  const rates = exchangeRateRows.map(statementExchangeRateSnapshot);
  const closingRate = rates.find((rate) =>
    rate.rateKind === "closing"
      && rate.status === "verified"
      && isClosingRateNearPeriodEnd(rate.rateDate, selectedPeriodEnd),
  ) ?? null;
  const historicalRateCount = new Set(rates
    .filter((rate) => rate.rateKind === "historicalInvestment" && rate.status === "verified")
    .map((rate) => rate.rateDate)).size;
  const investmentEvidence: ConsolidationOverview["fxPolicy"]["investmentEvidence"] = investmentRows.map((item) => {
    const originalAmount = Number(item.originalDebit ?? item.originalCredit ?? 0) || null;
    const transactionRate = item.exchangeRate ? Number(item.exchangeRate) : null;
    return {
      id: item.id,
      companyCode: item.voucher.companyCode,
      voucherNo: item.voucher.voucherNo,
      voucherDate: item.voucher.date,
      description: item.description || item.voucher.description,
      accountCode: item.account.code,
      bookedAmountCny: Math.max(item.debit, item.credit),
      currencyCode: item.currencyCode,
      originalAmount,
      transactionRate,
      rateStatus: originalAmount === null
        ? "missingOriginalCurrency"
        : transactionRate === null
          ? "missingRate"
          : "recorded",
    };
  });
  const missingInvestmentRateCount = investmentEvidence.filter((item) => item.rateStatus !== "recorded").length;
  const canadaEntity = entities.find((entity) => entity.code === "05" || entity.name.includes("加拿大"));
  const canadaSourceStatementsReady = canadaEntity
    ? [canadaEntity.balanceSheet, canadaEntity.incomeStatement, canadaEntity.cashFlow]
        .every((source) => source.kind !== "missing") && canadaCurrencyAccountCount > 0
    : true;
  const fxStatus = closingRate && historicalRateCount > 0 && canadaSourceStatementsReady
    ? "ready"
    : rates.length > 0
      ? "partiallyConfigured"
      : "notConfigured";
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
        ? `已从 CompanyRelation 公司关系表读取 ${scopeRelations.length} 条持股事实`
        : `CompanyRelation 已有 ${scopeRelations.length} 条并表关系，其中 ${missingOwnership} 条比例未填；需先确认直接持股链路再计算少数股东权益`,
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
      status: !canadaSourceStatementsReady || !closingRate
        ? "blocked"
        : missingInvestmentRateCount > 0 || historicalRateCount === 0
          ? "attention"
          : "ready",
      detail: !canadaSourceStatementsReady
        ? `汇率证据台账已启用，但加拿大 ${selectedPeriod.year}年${selectedPeriod.month}月 个别三表尚不完整，不能计算整表折算`
        : !closingRate
          ? `尚缺 ${selectedPeriodEnd} 或此前最近一个营业日经复核的中行折算价`
          : missingInvestmentRateCount > 0
            ? `期末折算价已复核；另有 ${missingInvestmentRateCount} 笔北美研究院投资付款缺少原币或投资日汇率证据`
            : `期末折算价及 ${historicalRateCount} 个投资日历史汇率已复核`,
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
      { key: "investment-equity", label: "长期股权投资与子公司权益", description: "抵销母公司投资与子公司归属于合并前的权益。", workpaper: "investmentEquity", requiredEvidence: "投资协议、出资凭证、子公司权益变动表", reviewCheck: "投资成本、购买日净资产与合并商誉/差额勾稽", status: "notStarted" },
      { key: "non-controlling-interest", label: "少数股东权益与损益", description: "按直接持股链路和归属期间拆分少数股东权益、损益及综合收益。", workpaper: "investmentEquity", requiredEvidence: "CompanyRelation 持股比例、章程、权益变动", reviewCheck: "期初、本期增减、期末及少数股东损益滚动一致", status: "notStarted" },
      { key: "intercompany-balances", label: "内部往来、借款与减值", description: "核对并抵销应收应付、借款、资金往来及相关坏账准备。", workpaper: "balancesTransactions", requiredEvidence: "双方科目余额、往来对账单、账龄和减值明细", reviewCheck: "债权债务、利息及减值准备成对相等", status: "notStarted" },
      { key: "internal-trading", label: "内部交易与存货未实现损益", description: "抵销内部收入成本并计算期末存货中的未实现利润。", workpaper: "balancesTransactions", requiredEvidence: "内部销售明细、毛利率、期末存货去向", reviewCheck: "本期交易抵销与期末/期初未实现损益滚动一致", status: "notStarted" },
      { key: "internal-long-term-assets", label: "内部长期资产交易", description: "抵销固定/无形资产内部交易损益，并调整后续折旧摊销。", workpaper: "balancesTransactions", requiredEvidence: "资产卡片、内部处置凭证、剩余年限", reviewCheck: "原值、累计折旧摊销及处置损益连续滚动", status: "notStarted" },
      { key: "income-dividend", label: "投资收益、利息与股利", description: "抵销内部利息、股利和投资收益，保留对外交易结果。", workpaper: "balancesTransactions", requiredEvidence: "利息台账、利润分配决议、收付款凭证", reviewCheck: "收入费用及应收应付两侧同时抵销", status: "notStarted" },
      { key: "cash-flow", label: "内部现金流", description: "抵销母子公司及子公司之间的内部现金收付。", workpaper: "cashFlow", requiredEvidence: "双方现金流项目、银行流水和对应抵销分录", reviewCheck: "经营/投资/筹资分类两侧匹配且现金净变动勾稽", status: "notStarted" },
      { key: "tax", label: "抵销产生的所得税影响", description: "按可抵扣/应纳税暂时性差异计算递延所得税。", workpaper: "tax", requiredEvidence: "抵销分录、税率依据、可转回期间和可抵扣性判断", reviewCheck: "暂时性差异乘适用税率，并与递延所得税科目勾稽", status: "notStarted" },
    ],
    fxPolicy: {
      pair: "CAD/CNY",
      sourceName: "中国银行外汇牌价",
      sourceField: "中行折算价",
      unit: "人民币/100外币",
      sourceUrl: "https://www.boc.cn/sourcedb/whpj/",
      status: fxStatus,
      periodEndDate: selectedPeriodEnd,
      closingRate,
      historicalRateCount,
      rates,
      investmentEvidence,
      missingInvestmentRateCount,
      canadaSourceStatementsReady,
      note: "中行历史牌价查询没有稳定公开 JSON API，系统保存人工核验后的来源快照；折算结果只在加拿大原币三表和汇率口径齐备后计算。",
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
