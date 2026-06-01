// ─── Cash Flow Statement Line Config ───────────────────────
// Declarative definition of every line in the cash flow statement.
// P3 Batch 1: framework only. Compute wiring is deferred to a later
// batch. Each line declares:
//   - direction: "in" (cash inflow) or "out" (cash outflow). "net" lines
//     are derived (in - out) and have no own prefix list.
//   - chnPrefixes / canPrefixes: account code prefixes per chart variant
//     (CHN = standard China chart; CAN = Canadian 05 chart).
//   - subtract on "out" lines: subtracts from the section's net instead
//     of being an inflow on its own.

export type CashFlowSection = "operating" | "investing" | "financing";

export interface CashFlowLineConfig {
  lineCode: string;
  label: string;
  section: CashFlowSection;
  /** "in" = inflow, "out" = outflow, "net" = derived (in - out) */
  direction: "in" | "out" | "net";
  /** Account code prefixes for China chart of accounts */
  chnPrefixes?: string[];
  /** Account code prefixes for Canada (05) chart of accounts */
  canPrefixes?: string[];
  /** Sub-total / total / grandTotal markers for UI grouping */
  isSubtotal?: boolean;
  isGrandTotal?: boolean;
}

// ─── Config ────────────────────────────────────────────────
//
// Standard 准则 cash flow statement layout (经营/投资/筹资 三大活动).
// 经营活动 / 投资活动 / 筹资活动 each have:
//   现金流入小计 (subtotal of inflows)
//   现金流出小计 (subtotal of outflows)
//   ...产生的现金流量净额 (net = in - out)
//
// Plus 汇率影响 / 期初 / 期末 / 净增加额 lines at the bottom.

export const CASH_FLOW_LINES: CashFlowLineConfig[] = [
  // ─── 经营活动 ───
  { lineCode: "operatingInHeader", label: "一、经营活动产生的现金流量：", section: "operating", direction: "in", isSubtotal: false },
  { lineCode: "salesReceipt", label: "    销售商品、提供劳务收到的现金", section: "operating", direction: "in", chnPrefixes: ["6001"], canPrefixes: ["5001"] },
  { lineCode: "taxRefund",    label: "    收到的税费返还",             section: "operating", direction: "in", chnPrefixes: ["6051"] },
  { lineCode: "otherOpIn",    label: "    收到其他与经营活动有关的现金", section: "operating", direction: "in", chnPrefixes: ["6117", "6301"] },
  { lineCode: "operatingInSubtotal", label: "    经营活动现金流入小计", section: "operating", direction: "net", isSubtotal: true },

  { lineCode: "purchasePayment", label: "    购买商品、接受劳务支付的现金", section: "operating", direction: "out", chnPrefixes: ["6401", "6402"], canPrefixes: ["5401", "5402"] },
  { lineCode: "staffPayment",    label: "    支付给职工以及为职工支付的现金", section: "operating", direction: "out", chnPrefixes: ["2211"] },
  { lineCode: "taxPayment",      label: "    支付的各项税费",               section: "operating", direction: "out", chnPrefixes: ["2221", "6801"], canPrefixes: ["5801"] },
  { lineCode: "otherOpOut",      label: "    支付其他与经营活动有关的现金", section: "operating", direction: "out", chnPrefixes: ["6601", "6602", "6603", "6605", "6711"] },
  { lineCode: "operatingOutSubtotal", label: "    经营活动现金流出小计", section: "operating", direction: "net", isSubtotal: true },

  { lineCode: "operatingNet", label: "    经营活动产生的现金流量净额", section: "operating", direction: "net", isSubtotal: true },

  // ─── 投资活动 ───
  { lineCode: "investingInHeader", label: "二、投资活动产生的现金流量：", section: "investing", direction: "in" },
  { lineCode: "investRecovery", label: "    收回投资收到的现金",         section: "investing", direction: "in", chnPrefixes: ["1511"] },
  { lineCode: "investIncome",    label: "    取得投资收益收到的现金",     section: "investing", direction: "in", chnPrefixes: ["6111"], canPrefixes: ["5111"] },
  { lineCode: "fixedAssetDisposal", label: "    处置固定资产、无形资产收到的现金", section: "investing", direction: "in", chnPrefixes: ["1601", "1701"] },
  { lineCode: "otherInvIn",      label: "    收到其他与投资活动有关的现金", section: "investing", direction: "in" },
  { lineCode: "investingInSubtotal", label: "    投资活动现金流入小计", section: "investing", direction: "net", isSubtotal: true },

  { lineCode: "fixedAssetPurchase", label: "    购建固定资产、无形资产支付的现金", section: "investing", direction: "out", chnPrefixes: ["1601", "1604", "1701"] },
  { lineCode: "investPayment",    label: "    投资支付的现金",              section: "investing", direction: "out", chnPrefixes: ["1511", "1512", "1521"] },
  { lineCode: "otherInvOut",      label: "    支付其他与投资活动有关的现金", section: "investing", direction: "out" },
  { lineCode: "investingOutSubtotal", label: "    投资活动现金流出小计", section: "investing", direction: "net", isSubtotal: true },

  { lineCode: "investingNet", label: "    投资活动产生的现金流量净额", section: "investing", direction: "net", isSubtotal: true },

  // ─── 筹资活动 ───
  { lineCode: "financingInHeader", label: "三、筹资活动产生的现金流量：", section: "financing", direction: "in" },
  { lineCode: "capitalInjection",  label: "    吸收投资收到的现金",         section: "financing", direction: "in", chnPrefixes: ["4001"] },
  { lineCode: "loanReceipt",       label: "    取得借款收到的现金",         section: "financing", direction: "in", chnPrefixes: ["2001", "2501"] },
  { lineCode: "otherFinIn",        label: "    收到其他与筹资活动有关的现金", section: "financing", direction: "in" },
  { lineCode: "financingInSubtotal", label: "    筹资活动现金流入小计", section: "financing", direction: "net", isSubtotal: true },

  { lineCode: "loanRepayment",     label: "    偿还债务支付的现金",         section: "financing", direction: "out", chnPrefixes: ["2001", "2501"] },
  { lineCode: "dividendPayment",   label: "    分配股利、利润或偿付利息支付的现金", section: "financing", direction: "out", chnPrefixes: ["2231", "2232", "6603"] },
  { lineCode: "otherFinOut",       label: "    支付其他与筹资活动有关的现金", section: "financing", direction: "out" },
  { lineCode: "financingOutSubtotal", label: "    筹资活动现金流出小计", section: "financing", direction: "net", isSubtotal: true },

  { lineCode: "financingNet", label: "    筹资活动产生的现金流量净额", section: "financing", direction: "net", isSubtotal: true },

  // ─── 合计 ───
  { lineCode: "fxEffect", label: "四、汇率变动对现金及现金等价物的影响", section: "operating", direction: "in" },
  { lineCode: "netIncrease", label: "五、现金及现金等价物净增加额", section: "operating", direction: "net", isGrandTotal: true },
  { lineCode: "openingCash", label: "    加：期初现金及现金等价物余额", section: "operating", direction: "in" },
  { lineCode: "endingCash",  label: "六、期末现金及现金等价物余额", section: "operating", direction: "net", isGrandTotal: true },
];
