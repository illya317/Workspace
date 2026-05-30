import { NextResponse } from "next/server";
import { ReportPeriod, yearlyCurrentLeaf } from "../report-helpers";
import type { BalanceItem } from "../report-helpers";

export function generateIncomeStatement(period: ReportPeriod, yearBalances: BalanceItem[], isCanada: boolean) {
  let revenueAmt: number, costAmt: number, taxAmt: number, salesAmt: number, adminAmt: number,
      rdAmt: number, financeAmt: number, creditLossAmt: number, assetLossAmt: number,
      otherIncomeAmt: number, investAmt: number, nonRevAmt: number, nonExpAmt: number, taxAmt2: number;

  if (isCanada) {
    revenueAmt = yearlyCurrentLeaf(yearBalances, ["5001", "5051"], "credit");
    costAmt = yearlyCurrentLeaf(yearBalances, ["5401", "5402"], "debit");
    taxAmt = yearlyCurrentLeaf(yearBalances, ["5403"], "debit");
    salesAmt = yearlyCurrentLeaf(yearBalances, ["5601"], "debit");
    adminAmt = yearlyCurrentLeaf(yearBalances, ["5602"], "debit");
    rdAmt = yearlyCurrentLeaf(yearBalances, ["5604"], "debit");
    financeAmt = yearlyCurrentLeaf(yearBalances, ["5603"], "debit");
    creditLossAmt = 0;
    assetLossAmt = 0;
    otherIncomeAmt = yearlyCurrentLeaf(yearBalances, ["5301"], "credit");
    investAmt = yearlyCurrentLeaf(yearBalances, ["5111"], "credit");
    nonRevAmt = yearlyCurrentLeaf(yearBalances, ["5301"], "credit");
    nonExpAmt = yearlyCurrentLeaf(yearBalances, ["5711"], "debit");
    taxAmt2 = yearlyCurrentLeaf(yearBalances, ["5801"], "debit");
  } else {
    revenueAmt = yearlyCurrentLeaf(yearBalances, ["6001", "6051"], "credit");
    costAmt = yearlyCurrentLeaf(yearBalances, ["6401", "6402"], "debit");
    taxAmt = yearlyCurrentLeaf(yearBalances, ["6403"], "debit");
    salesAmt = yearlyCurrentLeaf(yearBalances, ["6601"], "debit");
    adminAmt = yearlyCurrentLeaf(yearBalances, ["6602"], "debit");
    rdAmt = yearlyCurrentLeaf(yearBalances, ["6605"], "debit");
    financeAmt = yearlyCurrentLeaf(yearBalances, ["6603"], "debit");
    creditLossAmt = yearlyCurrentLeaf(yearBalances, ["6702"], "debit");
    assetLossAmt = yearlyCurrentLeaf(yearBalances, ["6701"], "debit");
    otherIncomeAmt = yearlyCurrentLeaf(yearBalances, ["6117"], "credit");
    investAmt = yearlyCurrentLeaf(yearBalances, ["6111"], "credit");
    nonRevAmt = yearlyCurrentLeaf(yearBalances, ["6301"], "credit");
    nonExpAmt = yearlyCurrentLeaf(yearBalances, ["6711"], "debit");
    taxAmt2 = yearlyCurrentLeaf(yearBalances, ["6801"], "debit");
  }

  const operatingProfit = revenueAmt - costAmt - taxAmt - salesAmt - adminAmt - rdAmt - financeAmt - creditLossAmt - assetLossAmt + otherIncomeAmt + investAmt;
  const totalProfit = operatingProfit + nonRevAmt - nonExpAmt;
  const netProfit = totalProfit - taxAmt2;

  return NextResponse.json({
    type: "income",
    period,
    lines: [
      { label: "一、营业收入", amount: +revenueAmt.toFixed(2) },
      { label: "    减：营业成本", amount: +costAmt.toFixed(2) },
      { label: "        税金及附加", amount: +taxAmt.toFixed(2) },
      { label: "        销售费用", amount: +salesAmt.toFixed(2) },
      { label: "        管理费用", amount: +adminAmt.toFixed(2) },
      { label: "        研发费用", amount: +rdAmt.toFixed(2) },
      { label: "        财务费用", amount: +financeAmt.toFixed(2) },
      { label: "        信用减值损失", amount: +creditLossAmt.toFixed(2) },
      { label: "        资产减值损失", amount: +assetLossAmt.toFixed(2) },
      { label: "    加：其他收益", amount: +otherIncomeAmt.toFixed(2) },
      { label: "        投资收益", amount: +investAmt.toFixed(2) },
      { label: "二、营业利润", amount: +operatingProfit.toFixed(2), isTotal: true },
      { label: "    加：营业外收入", amount: +nonRevAmt.toFixed(2) },
      { label: "    减：营业外支出", amount: +nonExpAmt.toFixed(2) },
      { label: "三、利润总额", amount: +totalProfit.toFixed(2), isTotal: true },
      { label: "    减：所得税费用", amount: +taxAmt2.toFixed(2) },
      { label: "四、净利润", amount: +netProfit.toFixed(2), isGrandTotal: true },
    ],
  });
}
