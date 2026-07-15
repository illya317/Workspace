// ─── Income Statement Line Config ──────────────────────────
// Declarative definition of every line in the income statement.
// Each line has separate account prefixes for China (CHN) vs Canada (CAN).

export type IncomeSection = "operating" | "nonOperating";

export interface IncomeLineConfig {
  lineCode: string;
  label: string;
  /** Account code prefixes for China chart of accounts */
  chnPrefixes?: string[];
  /** Account code prefixes for Canada chart of accounts */
  canPrefixes?: string[];
  /** Sum direction: "debit" for expense, "credit" for revenue */
  direction: "debit" | "credit";
  /** Subtract from total (e.g. expenses, tax) */
  subtract?: boolean;
  isHeader?: boolean;
  isTotal?: boolean;
  isGrandTotal?: boolean;
}

// ─── Config ────────────────────────────────────────────────

export const INCOME_STATEMENT_LINES: IncomeLineConfig[] = [
  {
    lineCode: "revenue", label: "一、营业收入",
    chnPrefixes: ["6001", "6051"], canPrefixes: ["5001", "5051"],
    direction: "credit",
  },
  {
    lineCode: "cost", label: "    减：营业成本",
    chnPrefixes: ["6401", "6402"], canPrefixes: ["5401", "5402"],
    direction: "debit", subtract: true,
  },
  {
    lineCode: "tax", label: "        税金及附加",
    chnPrefixes: ["6403"], canPrefixes: ["5403"],
    direction: "debit", subtract: true,
  },
  {
    lineCode: "sales", label: "        销售费用",
    chnPrefixes: ["6601"], canPrefixes: ["5601"],
    direction: "debit", subtract: true,
  },
  {
    lineCode: "admin", label: "        管理费用",
    chnPrefixes: ["6602"], canPrefixes: ["5602"],
    direction: "debit", subtract: true,
  },
  {
    lineCode: "rd", label: "        研发费用",
    chnPrefixes: ["6605"], canPrefixes: ["5604"],
    direction: "debit", subtract: true,
  },
  {
    lineCode: "finance", label: "        财务费用",
    chnPrefixes: ["6603"], canPrefixes: ["5603"],
    direction: "debit", subtract: true,
  },
  {
    lineCode: "assetLoss", label: "        资产减值损失",
    chnPrefixes: ["6701"], canPrefixes: [],
    direction: "debit", subtract: true,
  },
  {
    lineCode: "creditLoss", label: "        信用减值损失",
    chnPrefixes: ["6702"], canPrefixes: [],
    direction: "debit", subtract: true,
  },
  {
    lineCode: "fairValueGain", label: "    加：公允价值变动收益（损失以\"-\"填列）",
    chnPrefixes: ["6101"], canPrefixes: [], direction: "credit",
  },
  {
    lineCode: "invest", label: "        投资收益（损失以\"-\"填列）",
    chnPrefixes: ["6111"], canPrefixes: ["5111"], direction: "credit",
  },
  {
    lineCode: "associateJointVentureIncome", label: "        其中：对联营企业和合营企业的投资收益",
    direction: "credit",
  },
  {
    lineCode: "otherIncome", label: "        其他收益",
    chnPrefixes: ["6117"], canPrefixes: ["5301"],
    direction: "credit",
  },
  {
    lineCode: "operatingProfit", label: "二、营业利润（亏损以\"－\"号填列）",
    direction: "debit", isTotal: true,
  },
  {
    lineCode: "nonRev", label: "    加：营业外收入",
    chnPrefixes: ["6301"], canPrefixes: ["5301"],
    direction: "credit",
  },
  {
    lineCode: "nonExp", label: "    减：营业外支出",
    chnPrefixes: ["6711"], canPrefixes: ["5711"],
    direction: "debit", subtract: true,
  },
  {
    lineCode: "nonCurrentAssetDisposalLoss", label: "    其中：非流动资产处置损失",
    direction: "debit", subtract: true,
  },
  {
    lineCode: "totalProfit", label: "三、利润总额（亏损总额以\"－\"号填列）",
    direction: "debit", isTotal: true,
  },
  {
    lineCode: "incomeTax", label: "    减：所得税费用",
    chnPrefixes: ["6801"], canPrefixes: ["5801"],
    direction: "debit", subtract: true,
  },
  {
    lineCode: "netProfit", label: "四、净利润（净亏损以\"－\"号填列）",
    direction: "debit", isGrandTotal: true,
  },
  { lineCode: "netProfitAttributableToParent", label: "归属于母公司所有者的净利润", direction: "credit" },
  { lineCode: "netProfitAttributableToNci", label: "少数股东损益", direction: "credit" },
  { lineCode: "epsHeader", label: "五、每股收益：", direction: "debit", isHeader: true },
  { lineCode: "basicEps", label: "（一）基本每股收益", direction: "debit" },
  { lineCode: "dilutedEps", label: "（二）稀释每股收益", direction: "debit" },
];
