// ─── Balance Sheet Line Config ─────────────────────────────
// Declarative definition of every line in the balance sheet.
// The compute engine reads this config and applies balances + reclass routing.

export type BalanceSheetSection =
  | "currentAssets"
  | "nonCurrentAssets"
  | "currentLiabilities"
  | "nonCurrentLiabilities"
  | "liabilities"
  | "equity";

export type LineSide = "debit" | "credit"; // debit=asset, credit=liability/equity

export interface BalanceSheetLineConfig {
  /** Unique identifier for this line (used for special-case compute) */
  lineCode: string;
  /** Display label */
  label: string;
  /** Account code prefix(es) shown in drilldown UI */
  displayCode: string;
  /** Which side of the balance sheet */
  side: LineSide;
  /** Section grouping */
  section: BalanceSheetSection;
  /** Account code prefixes to sum (leaf-only) */
  prefixes?: string[];
  /** Account code prefixes to subtract (e.g. accumulated depreciation) */
  subtractPrefixes?: string[];
  /** Render as section header (no amount) */
  isHeader?: boolean;
  /** Sum of all lines in this section */
  isTotal?: boolean;
  /** Sum of all section totals */
  isGrandTotal?: boolean;
  /** This line's prefix can be a reclass SOURCE (deduction from this line) */
  reclassSource?: boolean;
  /** This line's prefix can be a reclass TARGET (addition to this line) */
  reclassTarget?: boolean;
}

// ─── Current Assets ────────────────────────────────────────

const CURRENT_ASSETS: BalanceSheetLineConfig[] = [
  { lineCode: "currentAssetsHeader", label: "流动资产：", displayCode: "", side: "debit", section: "currentAssets", isHeader: true },
  { lineCode: "cash",              label: "货币资金",               displayCode: "1001+1002", side: "debit", section: "currentAssets", prefixes: ["1001", "1002"], reclassTarget: true },
  { lineCode: "tradingFinancial",  label: "交易性金融资产",         displayCode: "1101",      side: "debit", section: "currentAssets", prefixes: ["1101"] },
  { lineCode: "derivativeFinancial", label: "衍生金融资产",         displayCode: "1031",      side: "debit", section: "currentAssets", prefixes: ["1031"] },
  { lineCode: "notesReceivable",   label: "应收票据",               displayCode: "1121",      side: "debit", section: "currentAssets", prefixes: ["1121"] },
  { lineCode: "receivable",        label: "应收账款",               displayCode: "1122",      side: "debit", section: "currentAssets", prefixes: ["1122"] },
  { lineCode: "prepaid",           label: "预付款项",               displayCode: "1123",      side: "debit", section: "currentAssets", prefixes: ["1123"] },
  { lineCode: "interestReceivable", label: "应收利息",              displayCode: "1132",      side: "debit", section: "currentAssets", prefixes: ["1132"] },
  { lineCode: "dividendReceivable", label: "应收股利",              displayCode: "1131",      side: "debit", section: "currentAssets", prefixes: ["1131"] },
  { lineCode: "otherReceivableNet", label: "其他应收款",            displayCode: "1221-1231", side: "debit", section: "currentAssets", prefixes: ["1221"], reclassSource: true },
  { lineCode: "inventory",         label: "存货",                   displayCode: "1405",      side: "debit", section: "currentAssets", prefixes: ["1405"] },
  { lineCode: "nonCurrentDueWithinYear", label: "一年内到期的非流动资产", displayCode: "1501",  side: "debit", section: "currentAssets", prefixes: ["1501"] },
  { lineCode: "otherCurrentAssets", label: "其他流动资产",          displayCode: "1463",      side: "debit", section: "currentAssets", prefixes: ["1463"], reclassTarget: true },
  { lineCode: "totalCurrentAssets", label: "流动资产合计",          displayCode: "",          side: "debit", section: "currentAssets", isTotal: true },
];

// ─── Non-Current Assets ────────────────────────────────────

const NON_CURRENT_ASSETS: BalanceSheetLineConfig[] = [
  { lineCode: "nonCurrentAssetsHeader", label: "非流动资产：",     displayCode: "",          side: "debit", section: "nonCurrentAssets", isHeader: true },
  { lineCode: "debtInvest",         label: "债权投资",             displayCode: "1503",      side: "debit", section: "nonCurrentAssets", prefixes: ["1503"] },
  { lineCode: "otherDebtInvest",    label: "其他债权投资",         displayCode: "1504",      side: "debit", section: "nonCurrentAssets", prefixes: ["1504"] },
  { lineCode: "longTermReceivable", label: "长期应收款",           displayCode: "1531",      side: "debit", section: "nonCurrentAssets", prefixes: ["1531"] },
  { lineCode: "longTermInvest",     label: "长期股权投资",         displayCode: "1511",      side: "debit", section: "nonCurrentAssets", prefixes: ["1511"] },
  { lineCode: "otherEquityInvest",  label: "其他权益工具投资",     displayCode: "1512",      side: "debit", section: "nonCurrentAssets", prefixes: ["1512"] },
  { lineCode: "otherNonCurrentFinancial", label: "其他非流动金融资产", displayCode: "1505",  side: "debit", section: "nonCurrentAssets", prefixes: ["1505"] },
  { lineCode: "investmentProperty", label: "投资性房地产",         displayCode: "1521",      side: "debit", section: "nonCurrentAssets", prefixes: ["1521"] },
  { lineCode: "fixedAssets",        label: "固定资产",             displayCode: "1601-1602", side: "debit", section: "nonCurrentAssets", prefixes: ["1601"] },
  { lineCode: "constructionInProgress", label: "在建工程",         displayCode: "1604",      side: "debit", section: "nonCurrentAssets", prefixes: ["1604"] },
  { lineCode: "fixedAssetsClearing", label: "固定资产清理",        displayCode: "1606",      side: "debit", section: "nonCurrentAssets", prefixes: ["1606"] },
  { lineCode: "productiveBiological", label: "生产性生物资产",     displayCode: "1621",      side: "debit", section: "nonCurrentAssets", prefixes: ["1621"] },
  { lineCode: "oilGasAssets",       label: "油气资产",             displayCode: "1622",      side: "debit", section: "nonCurrentAssets", prefixes: ["1622"] },
  { lineCode: "intangible",         label: "无形资产",             displayCode: "1701",      side: "debit", section: "nonCurrentAssets", prefixes: ["1701"] },
  { lineCode: "developmentExpenditure", label: "开发支出",         displayCode: "1704",      side: "debit", section: "nonCurrentAssets", prefixes: ["1704"] },
  { lineCode: "goodwill",           label: "商誉",                 displayCode: "1711",      side: "debit", section: "nonCurrentAssets", prefixes: ["1711"] },
  { lineCode: "longTermDeferred",   label: "长期待摊费用",         displayCode: "1801",      side: "debit", section: "nonCurrentAssets", prefixes: ["1801"] },
  { lineCode: "deferredTaxAssets",  label: "递延所得税资产",       displayCode: "1811",      side: "debit", section: "nonCurrentAssets", prefixes: ["1811"] },
  { lineCode: "otherNonCurrentAssets", label: "其他非流动资产",    displayCode: "1901",      side: "debit", section: "nonCurrentAssets", prefixes: ["1901"] },
  { lineCode: "rightOfUse",         label: "使用权资产",           displayCode: "1641-1642", side: "debit", section: "nonCurrentAssets", prefixes: ["1641"] },
  { lineCode: "totalNonCurrentAssets", label: "非流动资产合计",    displayCode: "",          side: "debit", section: "nonCurrentAssets", isTotal: true },
  { lineCode: "totalAssets",        label: "资产总计",             displayCode: "",          side: "debit", section: "nonCurrentAssets", isGrandTotal: true },
];

// ─── Current Liabilities ───────────────────────────────────

const CURRENT_LIABILITIES: BalanceSheetLineConfig[] = [
  { lineCode: "currentLiabilitiesHeader", label: "流动负债：",     displayCode: "",          side: "credit", section: "currentLiabilities", isHeader: true },
  { lineCode: "shortTermLoans",     label: "短期借款",             displayCode: "2001",      side: "credit", section: "currentLiabilities", prefixes: ["2001"] },
  { lineCode: "tradingFinancialLiab", label: "交易性金融负债",     displayCode: "2101",      side: "credit", section: "currentLiabilities", prefixes: ["2101"] },
  { lineCode: "derivativeLiab",     label: "衍生金融负债",         displayCode: "2201",      side: "credit", section: "currentLiabilities", prefixes: ["2201"], reclassSource: true, reclassTarget: true },
  { lineCode: "notesPayable",       label: "应付票据",             displayCode: "2201",      side: "credit", section: "currentLiabilities", prefixes: ["2201"], reclassSource: true, reclassTarget: true },
  { lineCode: "payables",           label: "应付账款",             displayCode: "2202",      side: "credit", section: "currentLiabilities", prefixes: ["2202"], reclassTarget: true },
  { lineCode: "advanceReceipts",    label: "预收款项",             displayCode: "2203",      side: "credit", section: "currentLiabilities", prefixes: ["2203"] },
  { lineCode: "salaries",           label: "应付职工薪酬",         displayCode: "2211",      side: "credit", section: "currentLiabilities", prefixes: ["2211"] },
  { lineCode: "taxes",              label: "应交税费",             displayCode: "2221",      side: "credit", section: "currentLiabilities", prefixes: ["2221"] },
  { lineCode: "interestPayable",    label: "应付利息",             displayCode: "2232",      side: "credit", section: "currentLiabilities", prefixes: ["2232"] },
  { lineCode: "dividendPayable",    label: "应付股利",             displayCode: "2231",      side: "credit", section: "currentLiabilities", prefixes: ["2231"] },
  { lineCode: "otherPayables",      label: "其他应付款",           displayCode: "2241",      side: "credit", section: "currentLiabilities", prefixes: ["2241"], reclassTarget: true },
  { lineCode: "nonCurrentDueWithinYearLiab", label: "一年内到期的非流动负债", displayCode: "2501", side: "credit", section: "currentLiabilities", prefixes: ["2501"], reclassSource: true, reclassTarget: true },
  { lineCode: "otherCurrentLiabilities", label: "其他流动负债",    displayCode: "2701",      side: "credit", section: "currentLiabilities", prefixes: ["2281","2701"], reclassSource: true, reclassTarget: true },
  { lineCode: "totalCurrentLiabilities", label: "流动负债合计",    displayCode: "",          side: "credit", section: "currentLiabilities", isTotal: true },
];

// ─── Non-Current Liabilities ───────────────────────────────

const NON_CURRENT_LIABILITIES: BalanceSheetLineConfig[] = [
  { lineCode: "nonCurrentLiabilitiesHeader", label: "非流动负债：", displayCode: "",        side: "credit", section: "nonCurrentLiabilities", isHeader: true },
  { lineCode: "longTermLoans",      label: "长期借款",             displayCode: "2501",      side: "credit", section: "nonCurrentLiabilities", prefixes: ["2501"], reclassSource: true, reclassTarget: true },
  { lineCode: "bondsPayable",       label: "应付债券",             displayCode: "2502",      side: "credit", section: "nonCurrentLiabilities", prefixes: ["2502"] },
  { lineCode: "longTermPayables",   label: "长期应付款",           displayCode: "2701",      side: "credit", section: "nonCurrentLiabilities", prefixes: ["2701"], reclassSource: true, reclassTarget: true },
  { lineCode: "specialPayables",    label: "专项应付款",           displayCode: "2711",      side: "credit", section: "nonCurrentLiabilities", prefixes: ["2711"] },
  { lineCode: "estimatedLiabilities", label: "预计负债",           displayCode: "2801",      side: "credit", section: "nonCurrentLiabilities", prefixes: ["2801"] },
  { lineCode: "deferredTaxLiabilities", label: "递延所得税负债",   displayCode: "2901",      side: "credit", section: "nonCurrentLiabilities", prefixes: ["2901"], reclassSource: true, reclassTarget: true },
  { lineCode: "otherNonCurrentLiabilities", label: "其他非流动负债", displayCode: "",       side: "credit", section: "nonCurrentLiabilities", prefixes: [], reclassSource: true, reclassTarget: true },
  { lineCode: "leaseLiabilities",   label: "租赁负债",             displayCode: "2702",      side: "credit", section: "nonCurrentLiabilities", prefixes: ["2271","2702"] },
  { lineCode: "totalNonCurrentLiabilities", label: "非流动负债合计", displayCode: "",       side: "credit", section: "nonCurrentLiabilities", isTotal: true },
  { lineCode: "totalLiabilities",   label: "负债合计",             displayCode: "",          side: "credit", section: "liabilities", isGrandTotal: true },
];

// ─── Equity ─────────────────────────────────────────────────

const EQUITY: BalanceSheetLineConfig[] = [
  { lineCode: "equityHeader",       label: "所有者权益：",         displayCode: "",          side: "credit", section: "equity", isHeader: true },
  { lineCode: "paidInCapital",      label: "实收资本",             displayCode: "4001",      side: "credit", section: "equity", prefixes: ["4001"] },
  { lineCode: "otherEquityInstruments", label: "其他权益工具",     displayCode: "4003",      side: "credit", section: "equity", prefixes: ["4003"] },
  { lineCode: "capitalReserve",     label: "资本公积",             displayCode: "4002",      side: "credit", section: "equity", prefixes: ["4002"] },
  { lineCode: "treasuryStock",      label: "减：库存股",           displayCode: "4004",      side: "credit", section: "equity", prefixes: ["4004"] },
  { lineCode: "otherComprehensiveIncome", label: "其他综合收益",   displayCode: "4005",      side: "credit", section: "equity", prefixes: ["4005"] },
  { lineCode: "surplusReserve",     label: "盈余公积",             displayCode: "4101",      side: "credit", section: "equity", prefixes: ["4101"] },
  { lineCode: "undistributedProfit", label: "未分配利润",          displayCode: "4104",      side: "credit", section: "equity", prefixes: ["4104", "410401"] },
  { lineCode: "totalEquity",        label: "所有者权益合计",       displayCode: "",          side: "credit", section: "equity", isTotal: true },
];

// ─── Full Config ───────────────────────────────────────────

export const BALANCE_SHEET_CONFIG = {
  currentAssets: CURRENT_ASSETS,
  nonCurrentAssets: NON_CURRENT_ASSETS,
  currentLiabilities: CURRENT_LIABILITIES,
  nonCurrentLiabilities: NON_CURRENT_LIABILITIES,
  equity: EQUITY,
};

/** Flat list of all lines in display order */
export const BALANCE_SHEET_LINES: BalanceSheetLineConfig[] = [
  ...CURRENT_ASSETS,
  ...NON_CURRENT_ASSETS,
  ...CURRENT_LIABILITIES,
  ...NON_CURRENT_LIABILITIES,
  ...EQUITY,
];
