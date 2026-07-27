import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

import type { FinanceConsolidationRole, SaveFinanceConsolidationRuleInput } from "@workspace/finance/types";

export interface SaveFinanceConsolidationRuleCommandInput extends SaveFinanceConsolidationRuleInput {
  userId: number;
  ruleId?: number;
}

const RULE_TYPES = ["intercompanyBalance", "investmentEquity", "intercompanyRevenueExpense", "intercompanyDividend", "inventoryProfit", "fixedAssetProfit", "internalCashFlow", "manualReclassification"];
const DATA_BASES = ["closingBalance", "periodMovement", "voucher", "openItem"];
const MATCH_MODES = ["partnerAggregate", "ownershipChain", "documentReference", "manual"];
const AMOUNT_MODES = ["lowerOfTwoSides", "fullSource", "netChange", "fixed"];
const POSTING_SIDES = ["both", "leading", "partner"];
const DIFFERENCE_HANDLINGS = ["exception", "postToDifferenceAccount", "carryForward"];
const RATE_TYPES = ["source", "closing", "average", "historical", "transactionDate"];
const ROLES: FinanceConsolidationRole[] = ["none", "intercompanyReceivable", "intercompanyPayable", "intercompanyRevenue", "intercompanyExpense", "investmentInSubsidiary", "shareCapital", "capitalReserve", "dividendReceivable", "dividendPayable", "inventory", "fixedAsset", "cashFlow", "difference"];

export function buildSaveFinanceConsolidationRuleCommand(input: SaveFinanceConsolidationRuleCommandInput) {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return failCommand("userId 必须是正整数", 400, "userId");
  if (input.ruleId !== undefined && (!Number.isInteger(input.ruleId) || input.ruleId <= 0)) {
    return failCommand("ruleId 必须是正整数", 400, "ruleId");
  }
  const ruleCode = input.ruleCode.trim().toUpperCase();
  const name = input.name.trim();
  const note = input.note?.trim() || null;
  if (!ruleCode || ruleCode.length > 64 || !/^[A-Z0-9._-]+$/.test(ruleCode)) {
    return failCommand("规则编码只能包含大写字母、数字、点、下划线或连字符", 400, "ruleCode");
  }
  if (!name || name.length > 100) return failCommand("规则名称不能为空且不能超过 100 个字符", 400, "name");
  if (note && note.length > 1000) return failCommand("规则说明不能超过 1000 个字符", 400, "note");
  if (!RULE_TYPES.includes(input.ruleType)) return failCommand("规则类型无效", 400, "ruleType");
  if (!DATA_BASES.includes(input.dataBasis)) return failCommand("取数口径无效", 400, "dataBasis");
  if (!MATCH_MODES.includes(input.matchMode)) return failCommand("匹配方式无效", 400, "matchMode");
  if (!AMOUNT_MODES.includes(input.amountMode)) return failCommand("金额口径无效", 400, "amountMode");
  if (!POSTING_SIDES.includes(input.postingSide)) return failCommand("差额入账主体无效", 400, "postingSide");
  if (!DIFFERENCE_HANDLINGS.includes(input.differenceHandling)) return failCommand("差额处理无效", 400, "differenceHandling");
  if (!RATE_TYPES.includes(input.currencyRateType)) return failCommand("折算口径无效", 400, "currencyRateType");
  if (!Number.isFinite(input.toleranceAmount) || input.toleranceAmount < 0 || input.toleranceAmount > 1_000_000_000) {
    return failCommand("容差必须是非负有效金额", 400, "toleranceAmount");
  }
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 10_000) {
    return failCommand("优先级必须是 0 到 10000 的整数", 400, "priority");
  }
  const leftRoles = normalizeRoles(input.leftRoles);
  const rightRoles = normalizeRoles(input.rightRoles);
  if (!leftRoles || !rightRoles) return failCommand("规则科目角色无效", 400, "selectors");
  if (input.ruleType !== "manualReclassification" && (leftRoles.length === 0 || rightRoles.length === 0)) {
    return failCommand("自动规则必须同时配置来源和对方科目角色", 400, "selectors");
  }
  if (input.differenceHandling === "postToDifferenceAccount" && input.differenceGroupAccountId === null) {
    return failCommand("差额入账时必须指定差额集团科目", 400, "differenceGroupAccountId");
  }
  if (input.differenceGroupAccountId !== null
    && (!Number.isInteger(input.differenceGroupAccountId) || input.differenceGroupAccountId <= 0)) {
    return failCommand("differenceGroupAccountId 必须是正整数或 null", 400, "differenceGroupAccountId");
  }
  if (input.expectedUpdatedAt !== undefined) {
    const expected = new Date(input.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime()) || expected.toISOString() !== input.expectedUpdatedAt) {
      return failCommand("expectedUpdatedAt 必须是标准时间戳", 400, "expectedUpdatedAt");
    }
  }
  return okCommand({ input: {
    ...input,
    ruleCode,
    name,
    note,
    leftRoles,
    rightRoles,
    toleranceAmount: Math.round(input.toleranceAmount * 100) / 100,
  } });
}

function normalizeRoles(values: FinanceConsolidationRole[]) {
  if (!Array.isArray(values) || values.some((value) => value === "none" || !ROLES.includes(value))) return null;
  return [...new Set(values)];
}
