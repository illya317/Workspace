import { NextResponse } from "next/server";
import { BalanceItem, ReportPeriod, closingNetLeaf, reclassify, mk, mkC } from "../report-helpers";

export function generateBalanceSheet(period: ReportPeriod, balances: BalanceItem[]) {
  const reclass = reclassify(balances);

  const cash = closingNetLeaf(balances, ["1001", "1002"]);
  const tradingFinancial = closingNetLeaf(balances, ["1101"]);
  const derivativeFinancial = closingNetLeaf(balances, ["1031"]);
  const notesReceivable = closingNetLeaf(balances, ["1121"]);
  const receivable = closingNetLeaf(balances, ["1122"]);
  const prepaid = closingNetLeaf(balances, ["1123"]);
  const interestReceivable = closingNetLeaf(balances, ["1132"]);
  const dividendReceivable = closingNetLeaf(balances, ["1131"]);
  const otherReceivable = closingNetLeaf(balances, ["1221"]);
  const badDebtAllowance = closingNetLeaf(balances, ["1231"]);
  const otherReceivableNet = { debit: otherReceivable.debit - badDebtAllowance.credit, credit: otherReceivable.credit - reclass.assetToLiability.credit };
  const inventory = closingNetLeaf(balances, ["1405"]);
  const nonCurrentDueWithinYear = closingNetLeaf(balances, ["1501"]);
  const otherCurrentAssets = (() => {
    const base = closingNetLeaf(balances, ["1463"]);
    return { debit: base.debit + reclass.liabilityToAsset.debit, credit: base.credit + reclass.liabilityToAsset.credit };
  })();

  const totalCurrentAssets =
    mk(cash.debit, cash.credit) +
    mk(tradingFinancial.debit, tradingFinancial.credit) +
    mk(derivativeFinancial.debit, derivativeFinancial.credit) +
    mk(notesReceivable.debit, notesReceivable.credit) +
    mk(receivable.debit, receivable.credit) +
    mk(prepaid.debit, prepaid.credit) +
    mk(interestReceivable.debit, interestReceivable.credit) +
    mk(dividendReceivable.debit, dividendReceivable.credit) +
    mk(otherReceivableNet.debit, otherReceivableNet.credit) +
    mk(inventory.debit, inventory.credit) +
    mk(nonCurrentDueWithinYear.debit, nonCurrentDueWithinYear.credit) +
    mk(otherCurrentAssets.debit, otherCurrentAssets.credit);

  const debtInvest = closingNetLeaf(balances, ["1503"]);
  const otherDebtInvest = closingNetLeaf(balances, ["1504"]);
  const longTermReceivable = closingNetLeaf(balances, ["1531"]);
  const longTermInvest = closingNetLeaf(balances, ["1511"]);
  const otherEquityInvest = closingNetLeaf(balances, ["1512"]);
  const otherNonCurrentFinancial = closingNetLeaf(balances, ["1505"]);
  const investmentProperty = closingNetLeaf(balances, ["1521"]);
  const fixedAssets = closingNetLeaf(balances, ["1601"]);
  const accumDepreciation = closingNetLeaf(balances, ["1602"]);
  const constructionInProgress = closingNetLeaf(balances, ["1604"]);
  const fixedAssetsClearing = closingNetLeaf(balances, ["1606"]);
  const productiveBiological = closingNetLeaf(balances, ["1621"]);
  const oilGasAssets = closingNetLeaf(balances, ["1622"]);
  const intangible = closingNetLeaf(balances, ["1701"]);
  const developmentExpenditure = closingNetLeaf(balances, ["1704"]);
  const goodwill = closingNetLeaf(balances, ["1711"]);
  const longTermDeferred = closingNetLeaf(balances, ["1801"]);
  const deferredTaxAssets = closingNetLeaf(balances, ["1811"]);
  const otherNonCurrentAssets = closingNetLeaf(balances, ["1901"]);
  const rightOfUse = closingNetLeaf(balances, ["1641"]);
  const accumROU = closingNetLeaf(balances, ["1642"]);

  const totalNonCurrentAssets =
    mk(debtInvest.debit, debtInvest.credit) +
    mk(otherDebtInvest.debit, otherDebtInvest.credit) +
    mk(longTermReceivable.debit, longTermReceivable.credit) +
    mk(longTermInvest.debit, longTermInvest.credit) +
    mk(otherEquityInvest.debit, otherEquityInvest.credit) +
    mk(otherNonCurrentFinancial.debit, otherNonCurrentFinancial.credit) +
    mk(investmentProperty.debit, investmentProperty.credit) +
    mk(fixedAssets.debit, fixedAssets.credit) - mk(accumDepreciation.credit, accumDepreciation.debit) +
    mk(constructionInProgress.debit, constructionInProgress.credit) +
    mk(fixedAssetsClearing.debit, fixedAssetsClearing.credit) +
    mk(productiveBiological.debit, productiveBiological.credit) +
    mk(oilGasAssets.debit, oilGasAssets.credit) +
    mk(intangible.debit, intangible.credit) +
    mk(developmentExpenditure.debit, developmentExpenditure.credit) +
    mk(goodwill.debit, goodwill.credit) +
    mk(longTermDeferred.debit, longTermDeferred.credit) +
    mk(deferredTaxAssets.debit, deferredTaxAssets.credit) +
    mk(otherNonCurrentAssets.debit, otherNonCurrentAssets.credit) +
    mk(rightOfUse.debit, rightOfUse.credit) - mk(accumROU.credit, accumROU.debit);

  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

  const shortTermLoans = closingNetLeaf(balances, ["2001"]);
  const tradingFinancialLiab = closingNetLeaf(balances, ["2101"]);
  const derivativeLiab = closingNetLeaf(balances, ["2201"]);
  const notesPayable = closingNetLeaf(balances, ["2201"]);
  const payables = closingNetLeaf(balances, ["2202"]);
  const advanceReceipts = closingNetLeaf(balances, ["2203"]);
  const salaries = closingNetLeaf(balances, ["2211"]);
  const taxes = closingNetLeaf(balances, ["2221"]);
  const interestPayable = closingNetLeaf(balances, ["2232"]);
  const dividendPayable = closingNetLeaf(balances, ["2231"]);
  const otherPayables = (() => {
    const base = closingNetLeaf(balances, ["2241"]);
    // Add reclassified credit balances from asset accounts
    return { debit: base.debit + reclass.assetToLiability.debit, credit: base.credit + reclass.assetToLiability.credit };
  })();
  const nonCurrentDueWithinYearLiab = closingNetLeaf(balances, ["2501"]);
  const otherCurrentLiabilities = closingNetLeaf(balances, ["2701"]);

  const totalCurrentLiabilities =
    mkC(shortTermLoans.debit, shortTermLoans.credit) +
    mkC(tradingFinancialLiab.debit, tradingFinancialLiab.credit) +
    mkC(derivativeLiab.debit, derivativeLiab.credit) +
    mkC(notesPayable.debit, notesPayable.credit) +
    mkC(payables.debit, payables.credit) +
    mkC(advanceReceipts.debit, advanceReceipts.credit) +
    mkC(salaries.debit, salaries.credit) +
    mkC(taxes.debit, taxes.credit) +
    mkC(interestPayable.debit, interestPayable.credit) +
    mkC(dividendPayable.debit, dividendPayable.credit) +
    mkC(otherPayables.debit, otherPayables.credit) +
    mkC(nonCurrentDueWithinYearLiab.debit, nonCurrentDueWithinYearLiab.credit) +
    mkC(otherCurrentLiabilities.debit, otherCurrentLiabilities.credit);

  const longTermLoans = closingNetLeaf(balances, ["2501"]);
  const bondsPayable = closingNetLeaf(balances, ["2502"]);
  const longTermPayables = closingNetLeaf(balances, ["2701"]);
  const specialPayables = closingNetLeaf(balances, ["2711"]);
  const estimatedLiabilities = closingNetLeaf(balances, ["2801"]);
  const deferredTaxLiabilities = closingNetLeaf(balances, ["2901"]);
  const otherNonCurrentLiabilities = closingNetLeaf(balances, ["2901"]);
  const leaseLiabilities = closingNetLeaf(balances, ["2702"]);

  const totalNonCurrentLiabilities =
    mkC(longTermLoans.debit, longTermLoans.credit) +
    mkC(bondsPayable.debit, bondsPayable.credit) +
    mkC(longTermPayables.debit, longTermPayables.credit) +
    mkC(specialPayables.debit, specialPayables.credit) +
    mkC(estimatedLiabilities.debit, estimatedLiabilities.credit) +
    mkC(deferredTaxLiabilities.debit, deferredTaxLiabilities.credit) +
    mkC(otherNonCurrentLiabilities.debit, otherNonCurrentLiabilities.credit) +
    mkC(leaseLiabilities.debit, leaseLiabilities.credit);

  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

  const paidInCapital = closingNetLeaf(balances, ["4001"]);
  const otherEquityInstruments = closingNetLeaf(balances, ["4003"]);
  const capitalReserve = closingNetLeaf(balances, ["4002"]);
  const treasuryStock = closingNetLeaf(balances, ["4004"]);
  const otherComprehensiveIncome = closingNetLeaf(balances, ["4005"]);
  const surplusReserve = closingNetLeaf(balances, ["4101"]);
  const undistributedProfit = closingNetLeaf(balances, ["4104", "410401"]);

  const totalEquity =
    mkC(paidInCapital.debit, paidInCapital.credit) +
    mkC(otherEquityInstruments.debit, otherEquityInstruments.credit) +
    mkC(capitalReserve.debit, capitalReserve.credit) -
    mkC(treasuryStock.debit, treasuryStock.credit) +
    mkC(otherComprehensiveIncome.debit, otherComprehensiveIncome.credit) +
    mkC(surplusReserve.debit, surplusReserve.credit) +
    mkC(undistributedProfit.debit, undistributedProfit.credit);

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return NextResponse.json({
    type: "balance",
    period,
    assets: [
      { label: "流动资产：", code: "", amount: 0, isHeader: true },
      { label: "    货币资金", code: "1001+1002", amount: mk(cash.debit, cash.credit) },
      { label: "    交易性金融资产", code: "1101", amount: mk(tradingFinancial.debit, tradingFinancial.credit) },
      { label: "    衍生金融资产", code: "1031", amount: mk(derivativeFinancial.debit, derivativeFinancial.credit) },
      { label: "    应收票据", code: "1121", amount: mk(notesReceivable.debit, notesReceivable.credit) },
      { label: "    应收账款", code: "1122", amount: mk(receivable.debit, receivable.credit) },
      { label: "    预付款项", code: "1123", amount: mk(prepaid.debit, prepaid.credit) },
      { label: "    应收利息", code: "1132", amount: mk(interestReceivable.debit, interestReceivable.credit) },
      { label: "    应收股利", code: "1131", amount: mk(dividendReceivable.debit, dividendReceivable.credit) },
      { label: "    其他应收款", code: "1221,1231", amount: mk(otherReceivableNet.debit, otherReceivableNet.credit) },
      { label: "    存货", code: "1405", amount: mk(inventory.debit, inventory.credit) },
      { label: "    一年内到期的非流动资产", code: "1501", amount: mk(nonCurrentDueWithinYear.debit, nonCurrentDueWithinYear.credit) },
      { label: "    其他流动资产", code: "1463", amount: mk(otherCurrentAssets.debit, otherCurrentAssets.credit) },
      { label: "流动资产合计", code: "", amount: +totalCurrentAssets.toFixed(2), isTotal: true },
      { label: "非流动资产：", code: "", amount: 0, isHeader: true },
      { label: "    债权投资", code: "1503", amount: mk(debtInvest.debit, debtInvest.credit) },
      { label: "    其他债权投资", code: "1504", amount: mk(otherDebtInvest.debit, otherDebtInvest.credit) },
      { label: "    长期应收款", code: "1531", amount: mk(longTermReceivable.debit, longTermReceivable.credit) },
      { label: "    长期股权投资", code: "1511", amount: mk(longTermInvest.debit, longTermInvest.credit) },
      { label: "    其他权益工具投资", code: "1512", amount: mk(otherEquityInvest.debit, otherEquityInvest.credit) },
      { label: "    其他非流动金融资产", code: "1505", amount: mk(otherNonCurrentFinancial.debit, otherNonCurrentFinancial.credit) },
      { label: "    投资性房地产", code: "1521", amount: mk(investmentProperty.debit, investmentProperty.credit) },
      { label: "    固定资产", code: "1601-1602", amount: mk(fixedAssets.debit, fixedAssets.credit) - mk(accumDepreciation.credit, accumDepreciation.debit) },
      { label: "    在建工程", code: "1604", amount: mk(constructionInProgress.debit, constructionInProgress.credit) },
      { label: "    固定资产清理", code: "1606", amount: mk(fixedAssetsClearing.debit, fixedAssetsClearing.credit) },
      { label: "    生产性生物资产", code: "1621", amount: mk(productiveBiological.debit, productiveBiological.credit) },
      { label: "    油气资产", code: "1622", amount: mk(oilGasAssets.debit, oilGasAssets.credit) },
      { label: "    无形资产", code: "1701", amount: mk(intangible.debit, intangible.credit) },
      { label: "    开发支出", code: "1704", amount: mk(developmentExpenditure.debit, developmentExpenditure.credit) },
      { label: "    商誉", code: "1711", amount: mk(goodwill.debit, goodwill.credit) },
      { label: "    长期待摊费用", code: "1801", amount: mk(longTermDeferred.debit, longTermDeferred.credit) },
      { label: "    递延所得税资产", code: "1811", amount: mk(deferredTaxAssets.debit, deferredTaxAssets.credit) },
      { label: "    其他非流动资产", code: "1901", amount: mk(otherNonCurrentAssets.debit, otherNonCurrentAssets.credit) },
      { label: "    使用权资产", code: "1641-1642", amount: mk(rightOfUse.debit, rightOfUse.credit) - mk(accumROU.credit, accumROU.debit) },
      { label: "非流动资产合计", code: "", amount: +totalNonCurrentAssets.toFixed(2), isTotal: true },
      { label: "资产总计", code: "", amount: +totalAssets.toFixed(2), isGrandTotal: true },
    ],
    liabilities: [
      { label: "流动负债：", code: "", amount: 0, isHeader: true },
      { label: "    短期借款", code: "2001", amount: mkC(shortTermLoans.debit, shortTermLoans.credit) },
      { label: "    交易性金融负债", code: "2101", amount: mkC(tradingFinancialLiab.debit, tradingFinancialLiab.credit) },
      { label: "    衍生金融负债", code: "2201", amount: mkC(derivativeLiab.debit, derivativeLiab.credit) },
      { label: "    应付票据", code: "2201", amount: mkC(notesPayable.debit, notesPayable.credit) },
      { label: "    应付账款", code: "2202", amount: mkC(payables.debit, payables.credit) },
      { label: "    预收款项", code: "2203", amount: mkC(advanceReceipts.debit, advanceReceipts.credit) },
      { label: "    应付职工薪酬", code: "2211", amount: mkC(salaries.debit, salaries.credit) },
      { label: "    应交税费", code: "2221", amount: mkC(taxes.debit, taxes.credit) },
      { label: "    应付利息", code: "2232", amount: mkC(interestPayable.debit, interestPayable.credit) },
      { label: "    应付股利", code: "2231", amount: mkC(dividendPayable.debit, dividendPayable.credit) },
      { label: "    其他应付款", code: "2241", amount: mkC(otherPayables.debit, otherPayables.credit) },
      { label: "    一年内到期的非流动负债", code: "2501", amount: mkC(nonCurrentDueWithinYearLiab.debit, nonCurrentDueWithinYearLiab.credit) },
      { label: "    其他流动负债", code: "2701", amount: mkC(otherCurrentLiabilities.debit, otherCurrentLiabilities.credit) },
      { label: "流动负债合计", code: "", amount: +totalCurrentLiabilities.toFixed(2), isTotal: true },
      { label: "非流动负债：", code: "", amount: 0, isHeader: true },
      { label: "    长期借款", code: "2501", amount: mkC(longTermLoans.debit, longTermLoans.credit) },
      { label: "    应付债券", code: "2502", amount: mkC(bondsPayable.debit, bondsPayable.credit) },
      { label: "    长期应付款", code: "2701", amount: mkC(longTermPayables.debit, longTermPayables.credit) },
      { label: "    专项应付款", code: "2711", amount: mkC(specialPayables.debit, specialPayables.credit) },
      { label: "    预计负债", code: "2801", amount: mkC(estimatedLiabilities.debit, estimatedLiabilities.credit) },
      { label: "    递延所得税负债", code: "2901", amount: mkC(deferredTaxLiabilities.debit, deferredTaxLiabilities.credit) },
      { label: "    其他非流动负债", code: "", amount: mkC(otherNonCurrentLiabilities.debit, otherNonCurrentLiabilities.credit) },
      { label: "    租赁负债", code: "2702", amount: mkC(leaseLiabilities.debit, leaseLiabilities.credit) },
      { label: "非流动负债合计", code: "", amount: +totalNonCurrentLiabilities.toFixed(2), isTotal: true },
      { label: "负债合计", code: "", amount: +totalLiabilities.toFixed(2), isTotal: true },
    ],
    equity: [
      { label: "所有者权益：", code: "", amount: 0, isHeader: true },
      { label: "    实收资本", code: "4001", amount: mkC(paidInCapital.debit, paidInCapital.credit) },
      { label: "    其他权益工具", code: "4003", amount: mkC(otherEquityInstruments.debit, otherEquityInstruments.credit) },
      { label: "    资本公积", code: "4002", amount: mkC(capitalReserve.debit, capitalReserve.credit) },
      { label: "    减：库存股", code: "4004", amount: mkC(treasuryStock.debit, treasuryStock.credit) },
      { label: "    其他综合收益", code: "4005", amount: mkC(otherComprehensiveIncome.debit, otherComprehensiveIncome.credit) },
      { label: "    盈余公积", code: "4101", amount: mkC(surplusReserve.debit, surplusReserve.credit) },
      { label: "    未分配利润", code: "4104", amount: mkC(undistributedProfit.debit, undistributedProfit.credit) },
      { label: "所有者权益合计", code: "", amount: +totalEquity.toFixed(2), isTotal: true },
    ],
    totalLiabilitiesAndEquity: +totalLiabilitiesAndEquity.toFixed(2),
  });
}
