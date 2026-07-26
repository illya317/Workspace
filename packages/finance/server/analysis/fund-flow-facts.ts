import { prisma } from "@workspace/platform/server/prisma";
import type { FundFlowBalanceSignal } from "@workspace/finance/types";
import { loadCashFlowConfig } from "../statements/config/load-config-reports";
import { computeCashFlowSystemAmounts } from "../statements/reports/cash-flow-system-amounts";
import {
  buildCashFlowBreakdown,
  classifyCashVoucherChannels,
  type CashVoucher,
} from "./fund-flow-calculation";

const CASH_PREFIXES = ["1001", "1002", "1012"];
const BALANCE_SIGNAL_DEFINITIONS = [
  { key: "interestBearingDebt", label: "有息借款", side: "credit", prefixes: ["2001", "2501"], names: ["借款"], note: "期末短期/长期借款；余额变化不等于当期借款现金流" },
  { key: "customerAdvances", label: "客户预收/合同负债", side: "credit", prefixes: ["2203"], names: ["预收", "合同负债"], note: "经营性资金来源；现金流量表通常并入销售商品、提供劳务收到的现金" },
  { key: "tradePayables", label: "供应商商业信用", side: "credit", prefixes: ["2201", "2202"], names: ["应付票据", "应付账款"], note: "延后现金支付形成的营运资金来源，不是当期现金流入" },
  { key: "unitPayables", label: "单位往来应付款", side: "credit", prefixes: ["2241"], names: ["其他应付款-单位"], note: "可能含关联方拆借；需辅助核算确认后才能作为集团内部资金" },
  { key: "shareholderCapital", label: "股东资本", side: "credit", prefixes: ["4001", "4002"], names: ["实收资本", "资本公积"], note: "存量权益；只有本期实际收到现金的投入才属于筹资现金流入" },
  { key: "unitReceivables", label: "单位往来应收款", side: "debit", prefixes: ["1221"], names: ["其他应收款-单位"], note: "对外或关联方资金占用；需辅助核算区分经营往来与拆借" },
] as const;

type BalanceRow = Awaited<ReturnType<typeof loadBalances>>[number];

function loadBalances(periodIds: number[]) {
  return prisma.financeAccountBalance.findMany({
    where: { periodId: { in: periodIds } },
    include: { account: true, period: true },
  });
}

function leafBalances(rows: BalanceRow[], month: number) {
  const monthRows = rows.filter((row) => row.period.month === month);
  const parentIds = new Set(monthRows.map((row) => row.account.parentId).filter((id): id is number => id !== null));
  return monthRows.filter((row) => !parentIds.has(row.accountId));
}

function balanceAmount(row: BalanceRow, field: "opening" | "closing", side: "debit" | "credit") {
  const debit = field === "opening" ? row.openingDebit : row.closingDebit;
  const credit = field === "opening" ? row.openingCredit : row.closingCredit;
  return side === "debit" ? debit - credit : credit - debit;
}

function matchesBalanceSignal(row: BalanceRow, definition: typeof BALANCE_SIGNAL_DEFINITIONS[number]) {
  return definition.prefixes.some((prefix) => row.account.code.startsWith(prefix))
    || definition.names.some((name) => row.account.name.includes(name));
}

function buildBalanceSignals(rows: BalanceRow[], targetMonth: number): FundFlowBalanceSignal[] {
  const openingRows = leafBalances(rows, 1);
  const closingRows = leafBalances(rows, targetMonth);
  return BALANCE_SIGNAL_DEFINITIONS.map((definition) => {
    const opening = openingRows.filter((row) => matchesBalanceSignal(row, definition)).reduce((sum, row) => sum + balanceAmount(row, "opening", definition.side), 0);
    const closing = closingRows.filter((row) => matchesBalanceSignal(row, definition)).reduce((sum, row) => sum + balanceAmount(row, "closing", definition.side), 0);
    return {
      key: definition.key,
      label: definition.label,
      opening: roundMoney(opening),
      change: roundMoney(closing - opening),
      closing: roundMoney(closing),
      note: definition.note,
    };
  });
}

function monetaryBalance(rows: BalanceRow[], month: number, field: "opening" | "closing") {
  return roundMoney(leafBalances(rows, month)
    .filter((row) => CASH_PREFIXES.some((prefix) => row.account.code.startsWith(prefix)))
    .reduce((sum, row) => sum + balanceAmount(row, field, "debit"), 0));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export async function loadCompanyFundFlowFacts(companyCode: string, year: number, month: number) {
  const [config, periods, vouchers] = await Promise.all([
    loadCashFlowConfig(companyCode, year),
    prisma.financePeriod.findMany({
      where: { companyCode, year, month: { in: month === 1 ? [1] : [1, month] } },
      select: { id: true, month: true },
    }),
    prisma.financeVoucher.findMany({
      where: { companyCode, status: "posted", period: { year, month: { lte: month } } },
      include: { items: { include: { account: true } } },
    }),
  ]);
  const [balances, cashFlow] = await Promise.all([
    loadBalances(periods.map((period) => period.id)),
    computeCashFlowSystemAmounts(companyCode, year, month, config),
  ]);
  const cashFlowFacts = [...cashFlow.amounts].map(([lineCode, amount]) => ({
    lineCode,
    manualAmount: 0,
    importedAmount: amount,
  }));
  const cashVouchers: CashVoucher[] = vouchers.map((voucher) => ({
    items: voucher.items.map((item) => ({
      code: item.account.code,
      name: item.account.name,
      debit: item.debit,
      credit: item.credit,
    })),
  }));
  const cashLinked = cashVouchers.filter((voucher) => voucher.items.some((item) => CASH_PREFIXES.some((prefix) => item.code.startsWith(prefix))));
  const ledgerNetCashChange = roundMoney(cashLinked.reduce((sum, voucher) => sum + voucher.items
    .filter((item) => CASH_PREFIXES.some((prefix) => item.code.startsWith(prefix)))
    .reduce((voucherSum, item) => voucherSum + item.debit - item.credit, 0), 0));
  const openingCash = monetaryBalance(balances, 1, "opening");
  const endingCash = monetaryBalance(balances, month, "closing");
  return {
    cashFlowAvailable: cashFlow.allocationCount > 0,
    breakdown: buildCashFlowBreakdown(config, cashFlowFacts),
    ledgerChannels: classifyCashVoucherChannels(cashLinked),
    balanceSignals: buildBalanceSignals(balances, month),
    openingCash,
    endingCash,
    balanceNetCashChange: roundMoney(endingCash - openingCash),
    ledgerNetCashChange,
    voucherCount: vouchers.length,
    voucherItemCount: vouchers.reduce((sum, voucher) => sum + voucher.items.length, 0),
    cashLinkedVoucherCount: cashLinked.length,
  };
}
