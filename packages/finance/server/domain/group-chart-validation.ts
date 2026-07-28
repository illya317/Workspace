import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";

export interface SaveFinanceGroupAccountMappingChangeSetInput {
  userId: number;
  changes: Array<{
    mappingId: number;
    targetGroupAccountId: number;
    expectedUpdatedAt: string;
  }>;
}

export interface CreateFinanceGroupAccountCommandInput {
  userId: number;
  code: string;
  name: string;
  category: "asset" | "liability" | "common" | "equity" | "cost" | "revenue" | "expense";
  balanceDirection: "debit" | "credit";
  mnemonicCode: string | null;
  currency: string | null;
  parentGroupAccountId: number | null;
  consolidationRole: "none" | "intercompanyReceivable" | "intercompanyPayable" | "intercompanyRevenue" | "intercompanyExpense" | "investmentInSubsidiary" | "shareCapital" | "capitalReserve" | "dividendReceivable" | "dividendPayable" | "inventory" | "fixedAsset" | "cashFlow" | "difference";
  counterpartyRequirement: "none" | "optional" | "required";
  movementType: "closingBalance" | "periodMovement" | "transaction";
}

export interface DeleteFinanceGroupAccountCommandInput {
  userId: number;
  groupAccountId: number;
}

export interface UpdateFinanceGroupAccountCommandInput extends CreateFinanceGroupAccountCommandInput {
  groupAccountId: number;
  expectedUpdatedAt: string;
}

export interface ReviewFinanceGroupAccountCommandInput {
  userId: number;
  groupAccountId: number;
  decision: "approve" | "reject";
  expectedUpdatedAt: string;
}

const GROUP_ACCOUNT_CODE_PREFIX = {
  asset: "1",
  liability: "2",
  common: "3",
  equity: "4",
  cost: "5",
  revenue: "6",
  income: "6",
  expense: "6",
} as const;

const GROUP_ACCOUNT_CATEGORY_LABEL = {
  asset: "资产",
  liability: "负债",
  common: "共同",
  equity: "权益",
  cost: "成本",
  revenue: "收入",
  income: "收入",
  expense: "费用",
} as const;

export function financeGroupAccountCodeConventionIssue(input: { code: string; category: string }) {
  const expectedPrefix = GROUP_ACCOUNT_CODE_PREFIX[input.category as keyof typeof GROUP_ACCOUNT_CODE_PREFIX];
  if (!expectedPrefix) return `集团科目类别 ${input.category} 不受支持`;
  if (input.code.startsWith(expectedPrefix)) return null;
  const label = GROUP_ACCOUNT_CATEGORY_LABEL[input.category as keyof typeof GROUP_ACCOUNT_CATEGORY_LABEL];
  return `${label}类集团科目编码必须以 ${expectedPrefix} 开头`;
}

export function buildCreateFinanceGroupAccountCommand(input: CreateFinanceGroupAccountCommandInput) {
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return failCommand("userId 必须是正整数", 400, "userId");
  }
  const code = input.code.trim();
  if (!code || code.length > 32 || !/^[0-9A-Za-z._-]+$/.test(code)) {
    return failCommand("集团科目编码只能包含数字、字母、点、下划线或连字符，且不能超过 32 个字符", 400, "code");
  }
  const name = input.name.trim();
  if (!name || name.length > 100) return failCommand("集团科目名称不能为空且不能超过 100 个字符", 400, "name");
  if (!["asset", "liability", "common", "equity", "cost", "revenue", "expense"].includes(input.category)) {
    return failCommand("集团科目类别无效", 400, "category");
  }
  if (input.balanceDirection !== "debit" && input.balanceDirection !== "credit") {
    return failCommand("集团科目余额方向无效", 400, "balanceDirection");
  }
  const mnemonicCode = input.mnemonicCode?.trim() || null;
  const currency = input.currency?.trim() || null;
  if (mnemonicCode && mnemonicCode.length > 64) return failCommand("助记码不能超过 64 个字符", 400, "mnemonicCode");
  if (currency && currency.length > 32) return failCommand("币种不能超过 32 个字符", 400, "currency");
  const conventionIssue = financeGroupAccountCodeConventionIssue({ code, category: input.category });
  if (conventionIssue) return failCommand(conventionIssue, 400, "code");
  if (input.parentGroupAccountId !== null
    && (!Number.isInteger(input.parentGroupAccountId) || input.parentGroupAccountId <= 0)) {
    return failCommand("parentGroupAccountId 必须是正整数或 null", 400, "parentGroupAccountId");
  }
  const roles = ["none", "intercompanyReceivable", "intercompanyPayable", "intercompanyRevenue", "intercompanyExpense", "investmentInSubsidiary", "shareCapital", "capitalReserve", "dividendReceivable", "dividendPayable", "inventory", "fixedAsset", "cashFlow", "difference"];
  if (!roles.includes(input.consolidationRole)) return failCommand("集团科目合并角色无效", 400, "consolidationRole");
  if (!["none", "optional", "required"].includes(input.counterpartyRequirement)) {
    return failCommand("交易对手要求无效", 400, "counterpartyRequirement");
  }
  if (!["closingBalance", "periodMovement", "transaction"].includes(input.movementType)) {
    return failCommand("合并变动口径无效", 400, "movementType");
  }
  const requiresCounterparty = input.consolidationRole.startsWith("intercompany")
    || input.consolidationRole === "investmentInSubsidiary"
    || input.consolidationRole === "dividendReceivable"
    || input.consolidationRole === "dividendPayable";
  if (requiresCounterparty && input.counterpartyRequirement !== "required") {
    return failCommand("该合并角色必须要求交易对手辅助维度", 400, "counterpartyRequirement");
  }
  return okCommand({ input: { ...input, code, name, mnemonicCode, currency } });
}

export function buildDeleteFinanceGroupAccountCommand(input: DeleteFinanceGroupAccountCommandInput) {
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return failCommand("userId 必须是正整数", 400, "userId");
  }
  if (!Number.isInteger(input.groupAccountId) || input.groupAccountId <= 0) {
    return failCommand("groupAccountId 必须是正整数", 400, "groupAccountId");
  }
  return okCommand({ input });
}

export function buildUpdateFinanceGroupAccountCommand(input: UpdateFinanceGroupAccountCommandInput) {
  const base = buildCreateFinanceGroupAccountCommand(input);
  if (!base.ok) return base;
  if (!Number.isInteger(input.groupAccountId) || input.groupAccountId <= 0) {
    return failCommand("groupAccountId 必须是正整数", 400, "groupAccountId");
  }
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (Number.isNaN(expectedUpdatedAt.getTime()) || expectedUpdatedAt.toISOString() !== input.expectedUpdatedAt) {
    return failCommand("expectedUpdatedAt 必须是标准时间戳", 400, "expectedUpdatedAt");
  }
  return okCommand({ input: {
    ...base.data.input,
    groupAccountId: input.groupAccountId,
    expectedUpdatedAt: expectedUpdatedAt.toISOString(),
  } });
}

export function buildReviewFinanceGroupAccountCommand(input: ReviewFinanceGroupAccountCommandInput) {
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return failCommand("userId 必须是正整数", 400, "userId");
  }
  if (!Number.isInteger(input.groupAccountId) || input.groupAccountId <= 0) {
    return failCommand("groupAccountId 必须是正整数", 400, "groupAccountId");
  }
  if (input.decision !== "approve" && input.decision !== "reject") {
    return failCommand("集团科目复核决定无效", 400, "decision");
  }
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (Number.isNaN(expectedUpdatedAt.getTime()) || expectedUpdatedAt.toISOString() !== input.expectedUpdatedAt) {
    return failCommand("expectedUpdatedAt 必须是标准时间戳", 400, "expectedUpdatedAt");
  }
  return okCommand({ input: { ...input, expectedUpdatedAt: expectedUpdatedAt.toISOString() } });
}

export function buildFinanceGroupChartSyncCommand(input: { companyCodes?: readonly string[] }) {
  if (!input.companyCodes) return okCommand({ companyCodes: undefined });
  const companyCodes = [...new Set(input.companyCodes.map((code) => code.trim()))];
  if (companyCodes.some((code) => !code || code.length > 64)) {
    return failCommand("公司编码不能为空且不能超过 64 个字符", 400, "companyCodes");
  }
  return okCommand({ companyCodes });
}

export function buildFinanceAccountingPolicyVersionAdvanceCommand(input: {
  effectiveFrom: string;
  name?: string;
  note?: string;
}) {
  const effectiveFrom = input.effectiveFrom.trim();
  const parsedDate = new Date(`${effectiveFrom}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)
    || Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== effectiveFrom) {
    return failCommand("effectiveFrom 必须是有效的 YYYY-MM-DD 日期", 400, "effectiveFrom");
  }
  const name = input.name?.trim() || undefined;
  const note = input.note?.trim() || undefined;
  if (name && name.length > 100) return failCommand("版本名称不能超过 100 个字符", 400, "name");
  if (note && note.length > 500) return failCommand("版本说明不能超过 500 个字符", 400, "note");
  return okCommand({ effectiveFrom, name, note });
}

export function buildSaveFinanceGroupAccountMappingChangeSetCommand(
  input: SaveFinanceGroupAccountMappingChangeSetInput,
) {
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return failCommand("userId 必须是正整数", 400, "userId");
  }
  if (!Array.isArray(input.changes) || input.changes.length === 0) {
    return failCommand("至少需要一项科目映射变更", 400, "changes");
  }
  if (input.changes.length > 500) return failCommand("批量保存上限 500 项", 400, "changes");

  const seen = new Set<number>();
  const changes: SaveFinanceGroupAccountMappingChangeSetInput["changes"] = [];
  for (const change of input.changes) {
    if (!Number.isInteger(change.mappingId) || change.mappingId <= 0) {
      return failCommand("mappingId 必须是正整数", 400, "mappingId");
    }
    if (!Number.isInteger(change.targetGroupAccountId) || change.targetGroupAccountId <= 0) {
      return failCommand("targetGroupAccountId 必须是正整数", 400, "targetGroupAccountId");
    }
    if (seen.has(change.mappingId)) return failCommand("同一科目映射不能重复提交", 400, "changes");
    const expectedUpdatedAt = new Date(change.expectedUpdatedAt);
    if (Number.isNaN(expectedUpdatedAt.getTime()) || expectedUpdatedAt.toISOString() !== change.expectedUpdatedAt) {
      return failCommand("expectedUpdatedAt 必须是标准时间戳", 400, "expectedUpdatedAt");
    }
    seen.add(change.mappingId);
    changes.push({ ...change, expectedUpdatedAt: expectedUpdatedAt.toISOString() });
  }
  return okCommand({ input: { userId: input.userId, changes } });
}
