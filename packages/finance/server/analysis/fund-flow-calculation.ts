import type {
  FundFlowActivity,
  FundFlowActivitySummary,
  FundFlowChannel,
  FundFlowLedgerChannel,
} from "@workspace/finance/types";

type CashFlowConfigLine = {
  lineCode: string;
  label: string;
  section: string;
  direction: "in" | "out" | "net";
  isSubtotal: boolean;
  isGrandTotal: boolean;
};

type CashFlowFactLine = {
  lineCode: string;
  manualAmount: number;
  importedAmount: number;
};

export type CashVoucher = {
  items: Array<{ code: string; name: string; debit: number; credit: number }>;
};

export type CashFlowBreakdown = {
  inflow: number;
  outflow: number;
  netCashChange: number;
  fxEffect: number;
  activities: FundFlowActivitySummary[];
  sources: FundFlowChannel[];
  uses: FundFlowChannel[];
  qualityIssues: string[];
};

const ACTIVITY_LABELS: Record<FundFlowActivity, string> = {
  operating: "经营活动",
  investing: "投资活动",
  financing: "筹资活动",
};
const HEADER_OR_BALANCE_LINES = new Set([
  "operatingInHeader",
  "investingInHeader",
  "financingInHeader",
  "fxEffect",
  "openingCash",
]);
const NET_LINE_CODES: Record<FundFlowActivity, string> = {
  operating: "operatingNet",
  investing: "investingNet",
  financing: "financingNet",
};
const CASH_PREFIXES = ["1001", "1002", "1012"];

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isActivity(value: string): value is FundFlowActivity {
  return value === "operating" || value === "investing" || value === "financing";
}

function lineAmount(line: CashFlowFactLine | undefined) {
  return line ? line.manualAmount + line.importedAmount : 0;
}

export function buildCashFlowBreakdown(
  config: CashFlowConfigLine[],
  facts: CashFlowFactLine[],
): CashFlowBreakdown {
  const amounts = new Map(facts.map((line) => [line.lineCode, lineAmount(line)]));
  const channels: Array<Omit<FundFlowChannel, "share"> & { direction: "source" | "use" }> = [];
  for (const line of config) {
    if (!isActivity(line.section) || line.direction === "net" || line.isSubtotal || line.isGrandTotal) continue;
    if (HEADER_OR_BALANCE_LINES.has(line.lineCode)) continue;
    const amount = Math.abs(amounts.get(line.lineCode) ?? 0);
    if (amount < 0.005) continue;
    channels.push({
      key: line.lineCode,
      label: line.label.trim(),
      activity: line.section,
      amount,
      direction: line.direction === "in" ? "source" : "use",
    });
  }
  const inflow = channels.filter((line) => line.direction === "source").reduce((sum, line) => sum + line.amount, 0);
  const outflow = channels.filter((line) => line.direction === "use").reduce((sum, line) => sum + line.amount, 0);
  const fxEffect = amounts.get("fxEffect") ?? 0;
  const activities = (Object.keys(ACTIVITY_LABELS) as FundFlowActivity[]).map((activity) => {
    const activityInflow = channels.filter((line) => line.activity === activity && line.direction === "source").reduce((sum, line) => sum + line.amount, 0);
    const activityOutflow = channels.filter((line) => line.activity === activity && line.direction === "use").reduce((sum, line) => sum + line.amount, 0);
    return {
      key: activity,
      label: ACTIVITY_LABELS[activity],
      inflow: roundMoney(activityInflow),
      outflow: roundMoney(activityOutflow),
      net: roundMoney(activityInflow - activityOutflow),
      inflowShare: inflow > 0 ? activityInflow / inflow : 0,
    };
  });
  const qualityIssues = activities.flatMap((activity) => {
    const importedNet = amounts.get(NET_LINE_CODES[activity.key]) ?? 0;
    if (Math.abs(importedNet) < 0.005 || Math.abs(importedNet - activity.net) < 0.01) return [];
    if (Math.abs(Math.abs(importedNet) - Math.abs(activity.net)) < 0.01) {
      return [`${activity.label}底稿净额符号与流入减流出不一致`];
    }
    return [`${activity.label}底稿净额与明细重算不一致`];
  });
  const withShare = (direction: "source" | "use") => {
    const total = direction === "source" ? inflow : outflow;
    return channels.filter((line) => line.direction === direction).map(({ direction: _, ...line }) => ({
      ...line,
      amount: roundMoney(line.amount),
      share: total > 0 ? line.amount / total : 0,
    })).sort((a, b) => b.amount - a.amount);
  };
  return {
    inflow: roundMoney(inflow),
    outflow: roundMoney(outflow),
    netCashChange: roundMoney(inflow - outflow + fxEffect),
    fxEffect: roundMoney(fxEffect),
    activities,
    sources: withShare("source"),
    uses: withShare("use"),
    qualityIssues,
  };
}

type LedgerChannelDefinition = {
  key: string;
  label: string;
  note: string;
  activity: FundFlowActivity;
};

function startsWithAny(code: string, prefixes: string[]) {
  return prefixes.some((prefix) => code.startsWith(prefix));
}

function sourceDefinition(code: string, name: string): LedgerChannelDefinition {
  if (startsWithAny(code, ["2001", "2501"]) || name.includes("借款")) return { key: "borrowing", label: "借款流入", note: "现金借方对应短期/长期借款贷方", activity: "financing" };
  if (code.startsWith("2203") || name.includes("预收") || name.includes("合同负债")) return { key: "customerAdvance", label: "客户预收", note: "现金借方对应预收账款或合同负债贷方", activity: "operating" };
  if (startsWithAny(code, ["4001", "4002"]) || name.includes("实收资本") || name.includes("资本公积")) return { key: "equityFunding", label: "股东投入", note: "现金借方对应实收资本或资本公积贷方", activity: "financing" };
  if (startsWithAny(code, ["1121", "1122", "6001", "6051"])) return { key: "customerCollection", label: "销售及客户回款", note: "现金借方对应收入、票据或应收款贷方", activity: "operating" };
  if (startsWithAny(code, ["1101", "1501", "1511", "1512", "1521"])) return { key: "investmentRecovery", label: "收回投资", note: "现金借方对应投资资产贷方", activity: "investing" };
  if (startsWithAny(code, ["1221", "2241"])) return { key: "unitSettlementIn", label: "单位往来流入", note: "其他应收/应付单位往来，关联方性质仍需辅助核算确认", activity: "operating" };
  return { key: "otherIn", label: "其他流入", note: "现金对手科目未落入主要资金渠道", activity: "operating" };
}

function outflowDefinition(code: string, name: string): LedgerChannelDefinition {
  if (startsWithAny(code, ["2001", "2501"]) || name.includes("借款")) return { key: "debtRepayment", label: "偿还借款", note: "现金贷方对应短期/长期借款借方", activity: "financing" };
  if (startsWithAny(code, ["2231", "2232", "6603"])) return { key: "capitalCost", label: "股利及利息", note: "现金贷方对应应付股利、应付利息或财务费用借方", activity: "financing" };
  if (startsWithAny(code, ["1601", "1604", "1701", "1801"])) return { key: "capitalExpenditure", label: "长期资产投入", note: "现金贷方对应固定资产、在建工程、无形资产等借方", activity: "investing" };
  if (startsWithAny(code, ["1101", "1501", "1511", "1512", "1521"])) return { key: "investmentPayment", label: "对外投资", note: "现金贷方对应投资资产借方", activity: "investing" };
  if (code.startsWith("2211")) return { key: "staffPayment", label: "职工薪酬", note: "现金贷方对应应付职工薪酬借方", activity: "operating" };
  if (startsWithAny(code, ["2221", "6801"])) return { key: "taxPayment", label: "税费支付", note: "现金贷方对应税费科目借方", activity: "operating" };
  if (startsWithAny(code, ["2201", "2202", "1123", "1405", "6401", "6402"])) return { key: "supplierPayment", label: "采购及供应商付款", note: "现金贷方对应应付、预付、存货或营业成本借方", activity: "operating" };
  if (startsWithAny(code, ["1221", "2241"])) return { key: "unitSettlementOut", label: "单位往来流出", note: "其他应收/应付单位往来，关联方性质仍需辅助核算确认", activity: "operating" };
  if (startsWithAny(code, ["6601", "6602", "6605", "6711"])) return { key: "operatingExpense", label: "期间费用及其他经营支出", note: "现金贷方对应期间费用或营业外支出借方", activity: "operating" };
  return { key: "otherOut", label: "其他流出", note: "现金对手科目未落入主要资金用途", activity: "operating" };
}

export function classifyCashVoucherChannels(vouchers: CashVoucher[]): FundFlowLedgerChannel[] {
  const totals = new Map<string, FundFlowLedgerChannel>();
  for (const voucher of vouchers) {
    const cashItems = voucher.items.filter((item) => startsWithAny(item.code, CASH_PREFIXES));
    const netCash = cashItems.reduce((sum, item) => sum + item.debit - item.credit, 0);
    if (Math.abs(netCash) < 0.005) continue;
    const direction = netCash > 0 ? "source" : "use";
    const counterpart = voucher.items.filter((item) => !startsWithAny(item.code, CASH_PREFIXES)).map((item) => ({
      ...item,
      weight: direction === "source" ? item.credit - item.debit : item.debit - item.credit,
    })).filter((item) => item.weight > 0.005);
    const weightTotal = counterpart.reduce((sum, item) => sum + item.weight, 0);
    const rows = counterpart.length > 0 ? counterpart : [{ code: "", name: "", debit: 0, credit: 0, weight: 1 }];
    for (const item of rows) {
      const definition = direction === "source" ? sourceDefinition(item.code, item.name) : outflowDefinition(item.code, item.name);
      const allocated = Math.abs(netCash) * item.weight / (weightTotal || 1);
      const key = `${direction}:${definition.key}`;
      const current = totals.get(key);
      totals.set(key, {
        key: definition.key,
        label: definition.label,
        direction,
        amount: (current?.amount ?? 0) + allocated,
        note: definition.note,
      });
    }
  }
  return [...totals.values()].map((row) => ({ ...row, amount: roundMoney(row.amount) })).sort((a, b) => b.amount - a.amount);
}
