import { NextResponse } from "next/server";
import { BalanceItem, ReportPeriod, ReclassEntry, closingNetLeaf, reclassify, reclassifyFromEntries, mk, mkC } from "../report-helpers";

export function generateBalanceSheet(
  period: ReportPeriod,
  balances: BalanceItem[],
  reclassEntries?: ReclassEntry[],
) {
  const reclass = reclassEntries && reclassEntries.length > 0
    ? reclassifyFromEntries(reclassEntries)
    : reclassify(balances);

  const sumByPrefix = (map: Map<string, { debit: number; credit: number }>, prefix: string) => {
    let d = 0, c = 0;
    for (const [code, v] of map) { if (code.startsWith(prefix)) { d += v.debit; c += v.credit; } }
    return { debit: d, credit: c };
  };
  const src = (prefix: string) => sumByPrefix(reclass.deductions, prefix);
  const tgt = (prefix: string) => sumByPrefix(reclass.additions, prefix);

  // Helper: closingNetLeaf + optional reclass source deduction / target addition
  const line = (prefixes: string[], opts?: { src?: boolean; tgt?: boolean }) => {
    const base = closingNetLeaf(balances, prefixes);
    if (!opts) return base;
    const s = opts.src ? src(prefixes[0]) : { debit: 0, credit: 0 };
    const t = opts.tgt ? tgt(prefixes[0]) : { debit: 0, credit: 0 };
    return { debit: base.debit - s.debit + t.debit, credit: base.credit - s.credit + t.credit };
  };

  const cash = closingNetLeaf(balances, ["1001", "1002"]);
  const tradingFinancial = line(["1101"], { tgt: true });
  const derivativeFinancial = line(["1031"], { tgt: true });
  const notesReceivable = line(["1121"], { src: true });
  const receivable = line(["1122"], { src: true });
  const prepaid = line(["1123"], { src: true });
  const interestReceivable = line(["1132"], { src: true });
  const dividendReceivable = line(["1131"], { src: true });
  const otherReceivable = closingNetLeaf(balances, ["1221"]);
  const badDebtAllowance = closingNetLeaf(balances, ["1231"]);
  const otherReceivableNet = (() => {
    const s = src("1221");
    return { debit: otherReceivable.debit - badDebtAllowance.credit - s.debit, credit: otherReceivable.credit - s.credit };
  })();
  const inventory = closingNetLeaf(balances, ["1405"]);
  const nonCurrentDueWithinYear = line(["1501"], { tgt: true });
  const otherCurrentAssets = line(["1463"], { tgt: true });

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
  const longTermReceivable = line(["1531"], { src: true });
  const longTermInvest = closingNetLeaf(balances, ["1511"]);
  const otherEquityInvest = closingNetLeaf(balances, ["1512"]);
  const otherNonCurrentFinancial = line(["1505"], { tgt: true });
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
  const deferredTaxAssets = line(["1811"], { tgt: true });
  const otherNonCurrentAssets = line(["1901"], { tgt: true });
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

  const shortTermLoans = line(["2001"], { tgt: true });
  const tradingFinancialLiab = line(["2101"], { tgt: true });
  const derivativeLiab = line(["2201"], { tgt: true });
  const notesPayable = line(["2201"], { tgt: true });
  const payables = line(["2202"], { tgt: true });
  const advanceReceipts = line(["2203"], { tgt: true });
  const salaries = line(["2211"], { tgt: true });
  const taxes = line(["2221"], { tgt: true });
  const interestPayable = line(["2232"], { tgt: true });
  const dividendPayable = line(["2231"], { tgt: true });
  const otherPayables = line(["2241"], { tgt: true });
  const nonCurrentDueWithinYearLiab = line(["2501"], { tgt: true });
  const otherCurrentLiabilities = line(["2701"], { tgt: true });

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

  const longTermLoans = line(["2501"], { tgt: true });
  const bondsPayable = line(["2502"], { tgt: true });
  const longTermPayables = line(["2701"], { tgt: true });
  const specialPayables = line(["2711"], { tgt: true });
  const estimatedLiabilities = line(["2801"], { tgt: true });
  const deferredTaxLiabilities = line(["2901"], { tgt: true });
  const otherNonCurrentLiabilities = line(["2901"], { tgt: true });
  const leaseLiabilities = line(["2702"], { tgt: true });

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
