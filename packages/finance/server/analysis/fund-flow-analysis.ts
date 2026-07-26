import { prisma } from "@workspace/platform/server/prisma";
import type {
  FundFlowActivity,
  FundFlowAnalysis,
  FundFlowBalanceSignal,
  FundFlowChannel,
  FundFlowCompanySummary,
  FundFlowLedgerChannel,
} from "@workspace/finance/types";
import { loadCompanyFundFlowFacts } from "./fund-flow-facts";

export interface FundFlowAnalysisInput {
  companyCodes: string[];
  year: number;
  month?: number;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function uniqueCompanyCodes(codes: string[]) {
  return [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
}

function commonPeriods(
  rows: Array<{ companyCode: string; year: number; month: number }>,
  companyCodes: string[],
) {
  const byPeriod = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = `${row.year}-${row.month}`;
    const companies = byPeriod.get(key) ?? new Set<string>();
    companies.add(row.companyCode);
    byPeriod.set(key, companies);
  }
  return [...byPeriod.entries()].filter(([, companies]) => companyCodes.every((code) => companies.has(code))).map(([key]) => {
    const [year, month] = key.split("-").map(Number);
    return { year, month };
  });
}

function aggregateChannels(
  rows: FundFlowChannel[][],
  total: number,
) {
  const totals = new Map<string, FundFlowChannel>();
  for (const row of rows.flat()) {
    const current = totals.get(row.key);
    totals.set(row.key, { ...row, amount: (current?.amount ?? 0) + row.amount, share: 0 });
  }
  return [...totals.values()].map((row) => ({
    ...row,
    amount: roundMoney(row.amount),
    share: total > 0 ? row.amount / total : 0,
  })).filter((row) => row.amount > 0.005).sort((a, b) => b.amount - a.amount);
}

function aggregateLedgerChannels(rows: FundFlowLedgerChannel[][]) {
  const totals = new Map<string, FundFlowLedgerChannel>();
  for (const row of rows.flat()) {
    const key = `${row.direction}:${row.key}`;
    const current = totals.get(key);
    totals.set(key, { ...row, amount: (current?.amount ?? 0) + row.amount });
  }
  return [...totals.values()].map((row) => ({ ...row, amount: roundMoney(row.amount) }))
    .filter((row) => row.amount > 0.005).sort((a, b) => b.amount - a.amount);
}

function aggregateBalanceSignals(rows: FundFlowBalanceSignal[][]) {
  const totals = new Map<string, FundFlowBalanceSignal>();
  for (const row of rows.flat()) {
    const current = totals.get(row.key);
    totals.set(row.key, {
      ...row,
      opening: (current?.opening ?? 0) + row.opening,
      change: (current?.change ?? 0) + row.change,
      closing: (current?.closing ?? 0) + row.closing,
    });
  }
  return [...totals.values()].map((row) => ({
    ...row,
    opening: roundMoney(row.opening),
    change: roundMoney(row.change),
    closing: roundMoney(row.closing),
  }));
}

function companyRole(
  company: {
    party: { ownedInterests: Array<{ issuer: { code: string } }> };
    issuedOwnerships: Array<{ owner: { company: { code: string } | null } }>;
  },
  selectedCodes: Set<string>,
): "母公司" | "子公司" | "成员公司" {
  if (company.party.ownedInterests.some((interest) => selectedCodes.has(interest.issuer.code))) return "母公司";
  if (company.issuedOwnerships.some((interest) => interest.owner.company && selectedCodes.has(interest.owner.company.code))) return "子公司";
  return "成员公司";
}

export async function getFundFlowAnalysis(input: FundFlowAnalysisInput): Promise<FundFlowAnalysis> {
  const companyCodes = uniqueCompanyCodes(input.companyCodes);
  const [companies, cashFlowPeriods] = await Promise.all([
    prisma.company.findMany({
      where: { code: { in: companyCodes }, isActive: true },
      select: {
        code: true,
        sortOrder: true,
        party: {
          select: {
            name: true,
            ownedInterests: { select: { issuer: { select: { code: true } } } },
          },
        },
        issuedOwnerships: { select: { owner: { select: { company: { select: { code: true } } } } } },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.financePeriod.findMany({
      where: { companyCode: { in: companyCodes }, cashFlowAllocations: { some: {} } },
      select: { companyCode: true, year: true, month: true },
    }),
  ]);
  if (companies.length === 0) throw new Error("所选公司不存在或未启用");
  const activeCodes = companies.map((company) => company.code);
  const periods = commonPeriods(cashFlowPeriods, activeCodes);
  const availableYears = [...new Set(periods.map((period) => period.year))].sort((a, b) => b - a);
  const commonMonths = periods.filter((period) => period.year === input.year).map((period) => period.month);
  const month = input.month ?? (commonMonths.length > 0 ? Math.max(...commonMonths) : 12);
  const facts = await Promise.all(activeCodes.map((code) => loadCompanyFundFlowFacts(code, input.year, month)));
  const inflow = roundMoney(facts.reduce((sum, row) => sum + row.breakdown.inflow, 0));
  const outflow = roundMoney(facts.reduce((sum, row) => sum + row.breakdown.outflow, 0));
  const netCashChange = roundMoney(facts.reduce((sum, row) => sum + row.breakdown.netCashChange, 0));
  const activities = (["operating", "investing", "financing"] as FundFlowActivity[]).map((activity) => {
    const activityRows = facts.map((row) => row.breakdown.activities.find((item) => item.key === activity));
    const activityInflow = roundMoney(activityRows.reduce((sum, row) => sum + (row?.inflow ?? 0), 0));
    const activityOutflow = roundMoney(activityRows.reduce((sum, row) => sum + (row?.outflow ?? 0), 0));
    return {
      key: activity,
      label: activityRows.find(Boolean)?.label ?? activity,
      inflow: activityInflow,
      outflow: activityOutflow,
      net: roundMoney(activityInflow - activityOutflow),
      inflowShare: inflow > 0 ? activityInflow / inflow : 0,
    };
  });
  const selectedCodes = new Set(activeCodes);
  const companySummaries = companies.map((company, index) => {
    const row = facts[index]!;
    const cashFlowGap = roundMoney(row.breakdown.netCashChange - row.ledgerNetCashChange);
    const quality: FundFlowCompanySummary["quality"] = !row.cashFlowAvailable ? "missing" : Math.abs(cashFlowGap) > 0.01 || row.breakdown.qualityIssues.length > 0 ? "warning" : "ok";
    return {
      code: company.code,
      name: company.party.name,
      role: companyRole(company, selectedCodes),
      inflow: row.breakdown.inflow,
      outflow: row.breakdown.outflow,
      netCashChange: row.breakdown.netCashChange,
      openingCash: row.openingCash,
      endingCash: row.endingCash,
      ledgerNetCashChange: row.ledgerNetCashChange,
      cashFlowGap,
      voucherCount: row.voucherCount,
      cashLinkedVoucherCount: row.cashLinkedVoucherCount,
      quality,
    };
  });
  const warnings = companySummaries.flatMap((company, index) => {
    const row = facts[index]!;
    const companyWarnings = row.breakdown.qualityIssues.map((issue) => `${company.name}：${issue}`);
    if (!row.cashFlowAvailable) companyWarnings.push(`${company.name}：${input.year}年${month}月 ERP 原始账没有现金流量分配`);
    if (Math.abs(company.cashFlowGap) > 0.01) companyWarnings.push(`${company.name}：系统现金流分类净变动与现金科目流水相差 ${Math.abs(company.cashFlowGap).toFixed(2)} 元`);
    if (Math.abs(row.ledgerNetCashChange - row.balanceNetCashChange) > 0.01) companyWarnings.push(`${company.name}：现金科目流水与月初/月末余额变动不一致`);
    return companyWarnings;
  });
  if (companies.length > 1) warnings.unshift("集团金额为所选公司管理汇总，尚未抵销内部资金往来，不能替代法定合并现金流量表。");
  if (month < 12) warnings.unshift(`${input.year}年口径截至${month}月，为期间累计数据，不代表全年或已关账数据。`);
  const cashFlowLoanInflow = facts.reduce((sum, row) => sum + (row.breakdown.sources.find((source) => source.key === "loanReceipt")?.amount ?? 0), 0);
  const ledgerBorrowingInflow = facts.reduce((sum, row) => sum + (row.ledgerChannels.find((channel) => channel.direction === "source" && channel.key === "borrowing")?.amount ?? 0), 0);
  const debtClosingBalance = facts.reduce((sum, row) => sum + (row.balanceSignals.find((signal) => signal.key === "interestBearingDebt")?.closing ?? 0), 0);
  if (cashFlowLoanInflow > 0.005 && ledgerBorrowingInflow < 0.005 && Math.abs(debtClosingBalance) < 0.005) {
    warnings.push(`系统现金流分类列示取得借款 ${cashFlowLoanInflow.toFixed(2)} 元，但现金流水未对应短期/长期借款科目且期末有息借款为 0；该金额很可能含单位往来或内部拆借，需复核分类。`);
  }
  const financing = activities.find((row) => row.key === "financing")!;
  const operating = activities.find((row) => row.key === "operating")!;
  const evidence = {
    cashFlowCompanyCount: facts.filter((row) => row.cashFlowAvailable).length,
    voucherCount: facts.reduce((sum, row) => sum + row.voucherCount, 0),
    voucherItemCount: facts.reduce((sum, row) => sum + row.voucherItemCount, 0),
    cashLinkedVoucherCount: facts.reduce((sum, row) => sum + row.cashLinkedVoucherCount, 0),
    cashFlowNetCashChange: netCashChange,
    ledgerNetCashChange: roundMoney(facts.reduce((sum, row) => sum + row.ledgerNetCashChange, 0)),
    balanceNetCashChange: roundMoney(facts.reduce((sum, row) => sum + row.balanceNetCashChange, 0)),
  };
  return {
    scope: {
      companyCodes: activeCodes,
      label: `${companies.map((company) => company.party.name).join(" + ")}${companies.length > 1 ? "（管理汇总）" : ""}`,
      year: input.year,
      month,
      periodLabel: `${input.year}年${month === 12 ? "全年" : `1—${month}月`}`,
      aggregation: companies.length > 1 ? "uneliminated" : "single",
      availableYears,
    },
    metrics: {
      inflow,
      outflow,
      netCashChange,
      endingCash: roundMoney(facts.reduce((sum, row) => sum + row.endingCash, 0)),
      financingInflowShare: inflow > 0 ? financing.inflow / inflow : 0,
      operatingCoverage: operating.outflow > 0 ? operating.inflow / operating.outflow : null,
    },
    activities,
    sources: aggregateChannels(facts.map((row) => row.breakdown.sources), inflow),
    uses: aggregateChannels(facts.map((row) => row.breakdown.uses), outflow),
    ledgerChannels: aggregateLedgerChannels(facts.map((row) => row.ledgerChannels)),
    balanceSignals: aggregateBalanceSignals(facts.map((row) => row.balanceSignals)),
    companies: companySummaries,
    evidence,
    warnings,
  };
}
