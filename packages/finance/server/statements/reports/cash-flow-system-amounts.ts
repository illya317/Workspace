import { prisma } from "@workspace/platform/server/prisma";
import type { CashFlowLineRow } from "../config/load-config-reports";
import {
  applyCashFlowPresentationAdjustment,
  normalizeCashFlowAllocationAmount,
} from "./cash-flow-allocation-policy";

export interface CashFlowSystemResult {
  amounts: Map<string, number>;
  diagnostics: string[];
  allocationCount: number;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sourceLineCode(name: string): string | null | undefined {
  const normalized = name.replace(/\s+/g, "");
  if (
    normalized.includes("存取资金") || normalized.includes("不影响现金流量")
    || normalized === "资金增加" || normalized === "资金减少"
  ) return null;
  if (normalized.includes("销售") && normalized.includes("收到")) return "salesReceipt";
  if (normalized.includes("税费返还")) return "taxRefund";
  if (normalized.includes("收到") && normalized.includes("经营活动")) return "otherOpIn";
  if ((normalized.includes("购买") || normalized.includes("采购")) && normalized.includes("劳务") && normalized.includes("支付")) return "purchasePayment";
  if (normalized.includes("职工") || normalized.includes("职工薪酬")) return "staffPayment";
  if (normalized.includes("支付") && normalized.includes("税费")) return "taxPayment";
  if (normalized.includes("支付") && normalized.includes("经营活动")) return "otherOpOut";
  if (normalized.includes("收回") && normalized.includes("投资")) return "investRecovery";
  if (normalized.includes("投资收益")) return "investIncome";
  if (normalized.includes("处置固定资产")) return "fixedAssetDisposal";
  if (normalized.includes("处置子公司")) return "subsidiaryDisposal";
  if (normalized.includes("收到") && normalized.includes("投资活动")) return "otherInvIn";
  if (normalized.includes("购建固定资产")) return "fixedAssetPurchase";
  if (normalized.includes("取得子公司")) return "subsidiaryAcquisition";
  if (normalized.includes("支付") && normalized.includes("投资活动")) return "otherInvOut";
  if (normalized.includes("投资") && normalized.includes("支付")) return "investPayment";
  if (normalized.includes("吸收投资")) return "capitalInjection";
  if ((normalized.includes("取得借款") || normalized.includes("借款所收到")) && normalized.includes("现金")) return "loanReceipt";
  if (normalized.includes("收到") && normalized.includes("筹资活动")) return "otherFinIn";
  if (normalized.includes("股利") || normalized.includes("利润") || normalized.includes("利息")) return "dividendPayment";
  if (normalized.includes("偿还借款") || normalized.includes("偿还债务")) return "loanRepayment";
  if (normalized.includes("支付") && normalized.includes("筹资活动")) return "otherFinOut";
  if (normalized.includes("汇率变动")) return "fxEffect";
  return undefined;
}

function sumCodes(amounts: Map<string, number>, codes: string[]) {
  return roundMoney(codes.reduce((sum, code) => sum + (amounts.get(code) ?? 0), 0));
}

function applyDerivedLines(amounts: Map<string, number>) {
  const operatingIn = sumCodes(amounts, ["salesReceipt", "taxRefund", "otherOpIn"]);
  const operatingOut = sumCodes(amounts, ["purchasePayment", "staffPayment", "taxPayment", "otherOpOut"]);
  const investingIn = sumCodes(amounts, ["investRecovery", "investIncome", "fixedAssetDisposal", "subsidiaryDisposal", "otherInvIn"]);
  const investingOut = sumCodes(amounts, ["fixedAssetPurchase", "investPayment", "subsidiaryAcquisition", "otherInvOut"]);
  const financingIn = sumCodes(amounts, ["capitalInjection", "loanReceipt", "otherFinIn"]);
  const financingOut = sumCodes(amounts, ["loanRepayment", "dividendPayment", "otherFinOut"]);
  amounts.set("operatingInSubtotal", operatingIn);
  amounts.set("operatingOutSubtotal", operatingOut);
  amounts.set("operatingNet", roundMoney(operatingIn - operatingOut));
  amounts.set("investingInSubtotal", investingIn);
  amounts.set("investingOutSubtotal", investingOut);
  amounts.set("investingNet", roundMoney(investingIn - investingOut));
  amounts.set("financingInSubtotal", financingIn);
  amounts.set("financingOutSubtotal", financingOut);
  amounts.set("financingNet", roundMoney(financingIn - financingOut));
  amounts.set("netIncrease", roundMoney(
    (amounts.get("operatingNet") ?? 0) + (amounts.get("investingNet") ?? 0)
      + (amounts.get("financingNet") ?? 0) + (amounts.get("fxEffect") ?? 0),
  ));
}

async function cashBalances(
  companyCode: string,
  year: number,
  month: number,
  periodBasis: "yearToDate" | "month",
) {
  const openingMonth = periodBasis === "month" ? month : 1;
  const [balances, exclusions] = await Promise.all([
    prisma.financeAccountBalance.findMany({
    where: {
      period: { companyCode, year, month: { in: [...new Set([openingMonth, month])] } },
      account: { OR: [{ code: { startsWith: "1001" } }, { code: { startsWith: "1002" } }, { code: { startsWith: "1012" } }] },
    },
    include: { account: { select: { code: true } }, period: { select: { month: true } } },
    }),
    prisma.financeStatementVoucherExclusion.findMany({
      where: {
        companyCode,
        statementType: "cashflow",
        enabled: true,
        voucher: { status: "posted", period: { year, month: { lte: month } } },
      },
      include: {
        voucher: {
          include: {
            period: { select: { month: true } },
            items: { include: { account: { select: { code: true } } } },
          },
        },
      },
    }),
  ]);
  const selectCashRoots = (targetMonth: number) => ["1001", "1002", "1012"].flatMap((prefix) => {
    const candidates = balances.filter((item) => (
      item.period.month === targetMonth && item.account.code.startsWith(prefix)
    ));
    const exact = candidates.find((item) => item.account.code === prefix);
    if (exact) return [exact];
    const shortest = Math.min(...candidates.map((item) => item.account.code.length));
    return candidates.filter((item) => item.account.code.length === shortest);
  });
  const opening = selectCashRoots(openingMonth);
  const ending = selectCashRoots(month);
  const excludedCashMovement = (throughMonth: number) => exclusions.reduce((sum, exclusion) => {
    if (exclusion.voucher.period.month > throughMonth) return sum;
    return sum + exclusion.voucher.items.reduce((voucherSum, item) => (
      ["1001", "1002", "1012"].some((prefix) => item.account.code.startsWith(prefix))
        ? voucherSum + item.debit - item.credit
        : voucherSum
    ), 0);
  }, 0);
  const openingRaw = opening.reduce((sum, item) => sum + item.openingDebit - item.openingCredit, 0);
  const endingRaw = ending.reduce((sum, item) => sum + item.closingDebit - item.closingCredit, 0);
  return {
    opening: roundMoney(openingRaw - excludedCashMovement(openingMonth - 1)),
    ending: roundMoney(endingRaw - excludedCashMovement(month)),
  };
}

export async function computeCashFlowSystemAmounts(
  companyCode: string,
  year: number,
  month: number,
  config: CashFlowLineRow[],
  periodBasis: "yearToDate" | "month" = "yearToDate",
): Promise<CashFlowSystemResult> {
  const allocations = await prisma.financeCashFlowAllocation.findMany({
    where: {
      companyCode,
      period: { year, month: periodBasis === "month" ? month : { lte: month } },
      voucher: {
        status: "posted",
        statementExclusions: { none: { statementType: "cashflow", enabled: true } },
      },
    },
    include: {
      cashFlowItem: { select: { sourceName: true } },
      ownerVoucherItem: { select: { debit: true, credit: true, account: { select: { code: true } } } },
      counterpartItem: { select: { debit: true, credit: true, account: { select: { code: true } } } },
      statementAdjustment: {
        select: { sourceLineCode: true, targetLineCode: true, amount: true, enabled: true },
      },
    },
  });
  const amounts = new Map(config.map((line) => [line.lineCode, 0]));
  const configByCode = new Map(config.map((line) => [line.lineCode, line]));
  const unmapped = new Set<string>();
  const adjustmentDiagnostics: string[] = [];
  for (const allocation of allocations) {
    const lineCode = sourceLineCode(allocation.cashFlowItem.sourceName);
    if (lineCode === null) continue;
    if (lineCode === undefined) {
      unmapped.add(allocation.cashFlowItem.sourceName);
      continue;
    }
    const normalizedAmount = normalizeCashFlowAllocationAmount({
      amount: Number(allocation.amount),
      lineDirection: configByCode.get(lineCode)?.direction ?? "net",
      ownerVoucherItem: allocation.ownerVoucherItem,
      counterpartItem: allocation.counterpartItem,
    });
    const presentation = applyCashFlowPresentationAdjustment({
      sourceLineCode: lineCode,
      normalizedAmount,
      adjustment: allocation.statementAdjustment
        ? { ...allocation.statementAdjustment, amount: Number(allocation.statementAdjustment.amount) }
        : null,
    });
    amounts.set(lineCode, roundMoney((amounts.get(lineCode) ?? 0) + presentation.sourceAmount));
    if (presentation.targetLineCode) {
      amounts.set(
        presentation.targetLineCode,
        roundMoney((amounts.get(presentation.targetLineCode) ?? 0) + presentation.targetAmount),
      );
    }
    if (presentation.diagnostic) adjustmentDiagnostics.push(presentation.diagnostic);
  }
  applyDerivedLines(amounts);
  const cash = await cashBalances(companyCode, year, month, periodBasis);
  amounts.set("openingCash", cash.opening);
  amounts.set("endingCash", cash.ending);
  const cashChange = roundMoney(cash.ending - cash.opening);
  const allocationChange = amounts.get("netIncrease") ?? 0;
  const diagnostics: string[] = [];
  if (unmapped.size) diagnostics.push(`有 ${unmapped.size} 个来源现金流项目未映射到法定行`);
  diagnostics.push(...adjustmentDiagnostics);
  if (allocations.length > 0 && cashChange !== allocationChange) {
    diagnostics.push(`现金流分配净额 ${allocationChange.toFixed(2)} 与货币资金变动 ${cashChange.toFixed(2)} 相差 ${roundMoney(allocationChange - cashChange).toFixed(2)}`);
  }
  return { amounts, diagnostics, allocationCount: allocations.length };
}
