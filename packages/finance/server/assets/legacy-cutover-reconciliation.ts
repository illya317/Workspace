import { moneyEquals, moneyIsNonZero } from "./money-cents";
import { validateFinanceAssetLegacyCutoverBasis } from "./legacy-cutover";

export type FinanceAssetCutoverAccountBalanceReference = {
  id: number;
  accountId: number;
  periodId: number;
  companyCode: string;
};

export type FinanceAssetCutoverAuthoritativeBalance = FinanceAssetCutoverAccountBalanceReference & {
  companyId: number;
  accountCode: string;
  balanceDirection: "debit" | "credit";
  closingDebit: number;
  closingCredit: number;
};

export type FinanceAssetCutoverAuthoritativeContext = {
  period: FinanceAssetLedgerCutoverResult["period"];
  balances: FinanceAssetCutoverAuthoritativeBalance[];
};

export type FinanceAssetCutoverAccountControl = {
  key: string;
  role: "asset" | "accumulated" | "impairment";
  sourceKeys: string[];
  accountId: number;
  accountCode: string;
  balanceId: number;
  selection: "full_account" | "auxiliary" | "controlled_zero" | "gl_replacement" | "approved_subledger";
  allocationMode: "standard" | "replace_single_card_from_gl" | "approved_subledger_amount";
  approvalReason: string | null;
  approvedSelectedAmount: number | null;
  expectedDirection: "debit" | "credit";
  workspaceClosingDebit: number;
  workspaceClosingCredit: number;
  sourceClosingDebit: number;
  sourceClosingCredit: number;
  sourceSelectedAmount: number;
  allocatedAmount: number;
  difference: number;
};

export type FinanceAssetCutoverExpectedCard = {
  sourceKey: string;
  originalCost: number;
  workbookNetBookValue: number;
  workbookAccumulatedAmount: number;
  fullUsefulLifeMonths: number;
  remainingUsefulLifeMonthsAtCutover: number;
  cutoverResidualValue: number;
  assetAccountId: number;
  accumulatedAccountId: number | null;
  impairmentAllowanceAccountId: number | null;
};

export type FinanceAssetCutoverCardAllocation = {
  sourceKey: string;
  openingAccumulatedAmount: number;
  openingImpairmentAmount: number;
  openingNetBookValue: number;
  cutoverResidualValue: number;
  remainingUsefulLifeMonthsAtCutover: number;
  allocationStatus: "allocated" | "pending";
  roundingAdjustment: number;
  ledgerControlAdjustment: number;
  ledgerControlAllocationMode: "replace_single_card_from_gl" | "approved_subledger_amount" | null;
  ledgerControlApprovalReason: string | null;
  assetBalance: FinanceAssetCutoverAccountBalanceReference;
  accumulatedBalance: FinanceAssetCutoverAccountBalanceReference | null;
  impairmentBalance: FinanceAssetCutoverAccountBalanceReference | null;
};

export type FinanceAssetLedgerCutoverResult = {
  cutoverDate: string;
  period: { id: number; companyCode: string; companyId: number; year: number; month: number; endDate: string; isClosed: boolean };
  fingerprint: string;
  status: "matched" | "rounding_allocated" | "ledger_control_adjusted" | "pending_allocation";
  ledgerNetBookValue: number;
  importedNetBookValue: number;
  unallocatedNetBookValue: number;
  allocations: FinanceAssetCutoverCardAllocation[];
  accountControls: FinanceAssetCutoverAccountControl[];
  warnings: string[];
  executionApproval?: { approvalReference: string; approvedBy: string; executedBy: string } | null;
};

export function validateFinanceAssetLedgerCutoverResult(input: {
  companyCode: string;
  companyId: number;
  year: number;
  month: number;
  cutoverDate: string;
  periodId: number;
  cards: FinanceAssetCutoverExpectedCard[];
  authoritativeContext: FinanceAssetCutoverAuthoritativeContext;
  result: FinanceAssetLedgerCutoverResult;
}) {
  const { result } = input;
  assertAuthoritativeContext(input);
  if (result.cutoverDate !== input.cutoverDate || result.period.endDate !== input.cutoverDate
    || result.period.id !== input.periodId || result.period.companyCode !== input.companyCode
    || result.period.companyId !== input.companyId || result.period.year !== input.year || result.period.month !== input.month) {
    throw new Error("资产切点总账核对结果不属于目标公司、期间或切点日期");
  }
  if (!result.period.isClosed) throw new Error("资产历史切点必须引用已关账总账期间");
  if (!/^[a-f0-9]{64}$/.test(result.fingerprint)) throw new Error("资产切点总账核对指纹无效");
  const expectedBySourceKey = new Map(input.cards.map((card) => [card.sourceKey, card]));
  if (expectedBySourceKey.size !== input.cards.length || result.allocations.length !== input.cards.length) {
    throw new Error("资产切点总账核对必须逐卡唯一分配");
  }
  const authoritativeById = new Map(input.authoritativeContext.balances.map((row) => [row.id, row]));
  const allocationBySourceKey = new Map<string, FinanceAssetCutoverCardAllocation>();
  for (const allocation of result.allocations) {
    const expected = expectedBySourceKey.get(allocation.sourceKey);
    if (!expected || allocationBySourceKey.has(allocation.sourceKey)) throw new Error("资产切点总账核对存在未知或重复来源卡片");
    if (allocation.remainingUsefulLifeMonthsAtCutover !== expected.remainingUsefulLifeMonthsAtCutover
      || allocation.remainingUsefulLifeMonthsAtCutover > expected.fullUsefulLifeMonths) {
      throw new Error("资产切点剩余寿命与导入前确定的公司年度政策基础不一致");
    }
    if (!moneyEquals(allocation.cutoverResidualValue, expected.cutoverResidualValue)) {
      throw new Error("资产切点剩余残值与导入前确定的公司年度政策基础不一致");
    }
    if (!allocation.ledgerControlAllocationMode) {
      validateFinanceAssetLegacyCutoverBasis({
        originalCost: expected.originalCost,
        openingAccumulatedAmount: allocation.openingAccumulatedAmount,
        openingImpairmentAmount: allocation.openingImpairmentAmount,
        openingNetBookValue: allocation.openingNetBookValue,
        cutoverDate: input.cutoverDate,
        remainingUsefulLifeMonthsAtCutover: allocation.remainingUsefulLifeMonthsAtCutover,
        cutoverResidualValue: allocation.cutoverResidualValue,
      });
    } else if (allocation.openingAccumulatedAmount < 0 || allocation.openingImpairmentAmount < 0 || allocation.openingNetBookValue < 0
      || !moneyEquals(expected.originalCost, allocation.openingAccumulatedAmount + allocation.openingImpairmentAmount + allocation.openingNetBookValue)) {
      throw new Error("资产切点审批控制后的期初原值、累计额与净值不闭合");
    }
    const assetBalance = canonicalBalanceReference(allocation.assetBalance, expected.assetAccountId, input, authoritativeById);
    const accumulatedBalance = canonicalNullableBalanceReference(allocation.accumulatedBalance, expected.accumulatedAccountId, input, authoritativeById);
    const impairmentBalance = canonicalNullableBalanceReference(allocation.impairmentBalance, expected.impairmentAllowanceAccountId, input, authoritativeById);
    if (moneyIsNonZero(allocation.roundingAdjustment) && Math.abs(allocation.roundingAdjustment) > 1) {
      throw new Error("资产切点尾差分配不得超过 1.00");
    }
    if (moneyIsNonZero(allocation.roundingAdjustment) && moneyIsNonZero(allocation.ledgerControlAdjustment)) {
      throw new Error("资产切点台账控制调整不得伪装或叠加为尾差");
    }
    if (moneyIsNonZero(allocation.ledgerControlAdjustment)
      && (!allocation.ledgerControlAllocationMode || !allocation.ledgerControlApprovalReason?.trim())) {
      throw new Error("资产切点台账控制调整缺少模式或审批依据");
    }
    allocationBySourceKey.set(allocation.sourceKey, { ...allocation, assetBalance, accumulatedBalance, impairmentBalance });
  }
  const importedNetBookValue = money(result.allocations.reduce((sum, row) => sum + row.openingNetBookValue, 0));
  if (!moneyEquals(importedNetBookValue, result.importedNetBookValue)
    || !moneyEquals(result.ledgerNetBookValue - result.importedNetBookValue, result.unallocatedNetBookValue)) {
    throw new Error("资产切点总账、已归卡和未分配金额不闭合");
  }
  const hasPending = result.allocations.some((row) => row.allocationStatus === "pending") || moneyIsNonZero(result.unallocatedNetBookValue);
  if (hasPending !== (result.status === "pending_allocation")) throw new Error("资产切点未分配状态与逐卡结果不一致");
  if (result.status === "matched" && result.allocations.some((row) => moneyIsNonZero(row.roundingAdjustment))) {
    throw new Error("资产切点已分配尾差时，核对状态必须标记 rounding_allocated");
  }
  if (result.status === "rounding_allocated" && !result.allocations.some((row) => moneyIsNonZero(row.roundingAdjustment))) {
    throw new Error("资产切点尾差状态缺少逐卡分配事实");
  }
  const hasLedgerControlAdjustment = result.allocations.some((row) => moneyIsNonZero(row.ledgerControlAdjustment));
  if ((result.status === "ledger_control_adjusted") !== hasLedgerControlAdjustment) {
    throw new Error("资产切点台账控制调整状态与逐卡结果不一致");
  }
  assertAccountControls(input, allocationBySourceKey);
  assertDeterministicCardAllocations(input, allocationBySourceKey);
  const controlledNetDifference = money(result.accountControls.reduce(
    (sum, control) => sum + (control.role === "asset" ? control.difference : -control.difference),
    0,
  ));
  if (!moneyEquals(controlledNetDifference, result.unallocatedNetBookValue)) {
    throw new Error("资产切点未分配净值未与逐科目差异闭合");
  }
  return allocationBySourceKey;
}

function assertAuthoritativeContext(input: {
  companyCode: string;
  companyId: number;
  year: number;
  month: number;
  cutoverDate: string;
  periodId: number;
  authoritativeContext: FinanceAssetCutoverAuthoritativeContext;
}) {
  const period = input.authoritativeContext.period;
  if (period.id !== input.periodId || period.companyCode !== input.companyCode || period.companyId !== input.companyId
    || period.year !== input.year || period.month !== input.month || period.endDate !== input.cutoverDate || !period.isClosed) {
    throw new Error("资产切点必须使用同一事务内读取的已关账会计期间");
  }
  const ids = new Set<number>();
  for (const balance of input.authoritativeContext.balances) {
    if (ids.has(balance.id) || balance.companyCode !== input.companyCode || balance.companyId !== input.companyId
      || balance.periodId !== input.periodId || !balance.accountCode.trim()) {
      throw new Error("资产切点权威总账余额 FK 不唯一或不属于目标公司期间");
    }
    if (!moneyEquals(balance.closingDebit, 0) && !moneyEquals(balance.closingCredit, 0)) {
      throw new Error(`资产切点权威总账余额同时存在借贷余额：${balance.accountCode}`);
    }
    ids.add(balance.id);
  }
}

function assertAccountControls(
  input: {
    cards: FinanceAssetCutoverExpectedCard[];
    authoritativeContext: FinanceAssetCutoverAuthoritativeContext;
    result: FinanceAssetLedgerCutoverResult;
  },
  allocations: Map<string, FinanceAssetCutoverCardAllocation>,
) {
  const authoritativeById = new Map(input.authoritativeContext.balances.map((row) => [row.id, row]));
  const controlled = new Set<string>();
  const coveredCardRoles = new Set<string>();
  for (const control of input.result.accountControls) {
    if (!control.key.trim() || controlled.has(control.key) || control.sourceKeys.length === 0) {
      throw new Error("资产切点逐科目控制项缺少唯一键或卡片范围");
    }
    const balance = authoritativeById.get(control.balanceId);
    if (!balance || balance.accountId !== control.accountId || balance.accountCode !== control.accountCode
      || balance.balanceDirection !== control.expectedDirection
      || !moneyEquals(balance.closingDebit, control.workspaceClosingDebit)
      || !moneyEquals(balance.closingCredit, control.workspaceClosingCredit)) {
      throw new Error(`资产切点逐科目控制与权威总账余额不一致：${control.accountCode}`);
    }
    if (!moneyEquals(control.workspaceClosingDebit, control.sourceClosingDebit)
      || !moneyEquals(control.workspaceClosingCredit, control.sourceClosingCredit)) {
      throw new Error(`ERP 来源与 Workspace 总账余额不一致：${control.accountCode}`);
    }
    assertControlApprovalContract(control, balance);
    const uniqueSourceKeys = [...new Set(control.sourceKeys)];
    if (uniqueSourceKeys.length !== control.sourceKeys.length) throw new Error(`资产切点逐科目控制重复卡片：${control.key}`);
    const allocatedAmount = money(uniqueSourceKeys.reduce((sum, sourceKey) => {
      const card = input.cards.find((item) => item.sourceKey === sourceKey);
      const allocation = allocations.get(sourceKey);
      if (!card || !allocation) throw new Error(`资产切点逐科目控制引用未知卡片：${sourceKey}`);
      const coverageKey = `${control.role}:${sourceKey}`;
      if (coveredCardRoles.has(coverageKey)) throw new Error(`资产切点卡片被重复纳入同一科目角色控制：${sourceKey}/${control.role}`);
      coveredCardRoles.add(coverageKey);
      if (control.role === "asset") {
        if (card.assetAccountId !== control.accountId) throw new Error(`资产切点资产科目控制引用错误卡片：${sourceKey}`);
        return sum + (card.accumulatedAccountId == null && card.impairmentAllowanceAccountId == null
          ? allocation.openingNetBookValue
          : card.originalCost);
      }
      if (control.role === "accumulated") {
        if (card.accumulatedAccountId !== control.accountId) throw new Error(`资产切点累计科目控制引用错误卡片：${sourceKey}`);
        return sum + allocation.openingAccumulatedAmount;
      }
      if (card.impairmentAllowanceAccountId !== control.accountId) throw new Error(`资产切点减值科目控制引用错误卡片：${sourceKey}`);
      return sum + allocation.openingImpairmentAmount;
    }, 0));
    if (!moneyEquals(allocatedAmount, control.allocatedAmount)
      || !moneyEquals(control.sourceSelectedAmount - control.allocatedAmount, control.difference)) {
      throw new Error(`资产切点逐科目控制未与卡片分配闭合：${control.accountCode}`);
    }
    controlled.add(control.key);
  }
  for (const card of input.cards) {
    for (const [role, accountId] of [
      ["asset", card.assetAccountId],
      ["accumulated", card.accumulatedAccountId],
      ["impairment", card.impairmentAllowanceAccountId],
    ] as const) {
      if (accountId == null) continue;
      const covered = input.result.accountControls.some((control) => control.role === role && control.accountId === accountId && control.sourceKeys.includes(card.sourceKey));
      if (!covered) throw new Error(`资产切点卡片缺少逐科目控制：${card.sourceKey}/${role}`);
    }
  }
}

function assertDeterministicCardAllocations(
  input: { cards: FinanceAssetCutoverExpectedCard[]; result: FinanceAssetLedgerCutoverResult },
  allocations: Map<string, FinanceAssetCutoverCardAllocation>,
) {
  const expectedAmounts = new Map(input.cards.map((card) => [card.sourceKey, {
    accumulated: money(card.workbookAccumulatedAmount),
    impairment: 0,
    net: money(card.workbookNetBookValue),
    rounding: 0,
    ledgerControlAdjustment: 0,
    ledgerControlAllocationMode: null as FinanceAssetCutoverCardAllocation["ledgerControlAllocationMode"],
    ledgerControlApprovalReason: null as string | null,
    pending: false,
  }]));
  const tailTargetByAccount = new Map<string, string>();
  for (const control of input.result.accountControls) {
    const cards = control.sourceKeys.map((sourceKey) => input.cards.find((card) => card.sourceKey === sourceKey)!)
      .sort((left, right) => right.workbookNetBookValue - left.workbookNetBookValue || left.sourceKey.localeCompare(right.sourceKey));
    if (control.allocationMode !== "standard") {
      const card = cards[0]!;
      if (cards.length !== 1 || card.accumulatedAccountId != null || card.impairmentAllowanceAccountId != null) {
        throw new Error(`资产切点特殊分配仅允许无累计/减值控制的单卡净额：${control.accountCode}`);
      }
      const expected = expectedAmounts.get(card.sourceKey)!;
      expected.net = money(control.sourceSelectedAmount);
      expected.accumulated = money(card.originalCost - control.sourceSelectedAmount);
      expected.ledgerControlAdjustment = money(control.sourceSelectedAmount - card.workbookNetBookValue);
      expected.ledgerControlAllocationMode = control.allocationMode;
      expected.ledgerControlApprovalReason = control.approvalReason;
      if (!moneyEquals(control.difference, 0)) throw new Error(`资产切点审批控制金额未完整归入单卡：${control.accountCode}`);
      continue;
    }
    const baselineAllocated = money(cards.reduce((sum, card) => {
      if (control.role === "asset") return sum + (card.accumulatedAccountId == null && card.impairmentAllowanceAccountId == null ? card.workbookNetBookValue : card.originalCost);
      if (control.role === "accumulated") return sum + card.workbookAccumulatedAmount;
      return sum;
    }, 0));
    const initialDifference = money(control.sourceSelectedAmount - baselineAllocated);
    const mayAllocateTail = Math.abs(initialDifference) <= 1
      && moneyIsNonZero(initialDifference)
      && cards.length > 0
      && !(control.role === "asset" && cards[0]!.accumulatedAccountId != null);
    if (mayAllocateTail) {
      const accountKey = `${control.role}:${control.accountId}`;
      const target = cards[0]!;
      const existingTarget = tailTargetByAccount.get(accountKey);
      if (existingTarget && existingTarget !== target.sourceKey) throw new Error(`资产切点同一科目存在多个尾差目标：${control.accountCode}`);
      tailTargetByAccount.set(accountKey, target.sourceKey);
      const expected = expectedAmounts.get(target.sourceKey)!;
      if (control.role === "asset") {
        expected.net = money(expected.net + initialDifference);
        expected.accumulated = money(expected.accumulated - initialDifference);
        expected.rounding = money(expected.rounding + initialDifference);
      } else if (control.role === "accumulated") {
        expected.accumulated = money(expected.accumulated + initialDifference);
        expected.net = money(expected.net - initialDifference);
        expected.rounding = money(expected.rounding - initialDifference);
      } else {
        expected.impairment = money(expected.impairment + initialDifference);
        expected.net = money(expected.net - initialDifference);
        expected.rounding = money(expected.rounding - initialDifference);
      }
      if (!moneyEquals(control.difference, 0)) throw new Error(`资产切点可分配尾差未完全归入确定目标：${control.accountCode}`);
      continue;
    }
    if (moneyIsNonZero(initialDifference)) {
      for (const card of cards) expectedAmounts.get(card.sourceKey)!.pending = true;
      if (!moneyEquals(control.difference, initialDifference)) throw new Error(`资产切点重大差异被擅自分配：${control.accountCode}`);
    } else if (moneyIsNonZero(control.difference)) {
      throw new Error(`资产切点无来源差异却保留未分配金额：${control.accountCode}`);
    }
  }
  for (const card of input.cards) {
    const expected = expectedAmounts.get(card.sourceKey)!;
    const allocation = allocations.get(card.sourceKey)!;
    if (!moneyEquals(allocation.openingAccumulatedAmount, expected.accumulated)
      || !moneyEquals(allocation.openingImpairmentAmount, expected.impairment)
      || !moneyEquals(allocation.openingNetBookValue, expected.net)
      || !moneyEquals(allocation.roundingAdjustment, expected.rounding)
      || !moneyEquals(allocation.ledgerControlAdjustment, expected.ledgerControlAdjustment)
      || allocation.ledgerControlAllocationMode !== expected.ledgerControlAllocationMode
      || allocation.ledgerControlApprovalReason !== expected.ledgerControlApprovalReason) {
      throw new Error(`资产切点逐卡金额超出受控尾差：${card.sourceKey}`);
    }
    if ((allocation.allocationStatus === "pending") !== expected.pending) {
      throw new Error(`资产切点逐卡 pending 状态与逐科目差异不一致：${card.sourceKey}`);
    }
  }
}

function assertControlApprovalContract(
  control: FinanceAssetCutoverAccountControl,
  balance: FinanceAssetCutoverAuthoritativeBalance,
) {
  if (control.allocationMode === "standard") {
    if (control.approvalReason != null || control.approvedSelectedAmount != null
      || (control.selection !== "full_account" && control.selection !== "auxiliary" && control.selection !== "controlled_zero")) {
      throw new Error(`资产切点 standard 控制包含非法审批字段：${control.accountCode}`);
    }
    return;
  }
  if (control.role !== "asset" || control.sourceKeys.length !== 1 || !control.approvalReason?.trim()) {
    throw new Error(`资产切点特殊分配仅允许有审批依据的单卡资产控制：${control.accountCode}`);
  }
  if (control.allocationMode === "replace_single_card_from_gl") {
    if (control.selection !== "gl_replacement" || control.approvedSelectedAmount != null) {
      throw new Error(`资产切点 GL 单卡替换控制字段无效：${control.accountCode}`);
    }
    return;
  }
  const fullDirectionalBalance = control.expectedDirection === "debit" ? balance.closingDebit : balance.closingCredit;
  if (control.selection !== "approved_subledger" || control.approvedSelectedAmount == null
    || !moneyEquals(control.sourceSelectedAmount, control.approvedSelectedAmount)
    || control.approvedSelectedAmount < 0 || control.approvedSelectedAmount > fullDirectionalBalance) {
    throw new Error(`资产切点审批子台账金额无效或超过总账余额：${control.accountCode}`);
  }
}

function canonicalNullableBalanceReference(
  reference: FinanceAssetCutoverAccountBalanceReference | null,
  expectedAccountId: number | null,
  input: { companyCode: string; periodId: number },
  authoritativeById: Map<number, FinanceAssetCutoverAuthoritativeBalance>,
) {
  if (expectedAccountId == null) {
    if (reference) throw new Error("资产切点总账余额 FK 与分类政策科目不一致");
    return null;
  }
  if (!reference) throw new Error("资产切点缺少分类政策科目的总账余额 FK");
  return canonicalBalanceReference(reference, expectedAccountId, input, authoritativeById);
}

function canonicalBalanceReference(
  reference: FinanceAssetCutoverAccountBalanceReference,
  expectedAccountId: number,
  input: { companyCode: string; periodId: number },
  authoritativeById: Map<number, FinanceAssetCutoverAuthoritativeBalance>,
) {
  const authoritative = authoritativeById.get(reference.id);
  if (!authoritative || authoritative.accountId !== expectedAccountId
    || authoritative.periodId !== input.periodId || authoritative.companyCode !== input.companyCode
    || reference.accountId !== authoritative.accountId || reference.periodId !== authoritative.periodId
    || reference.companyCode !== authoritative.companyCode) {
    throw new Error("资产切点总账余额 FK 与公司、期间或分类政策科目不一致");
  }
  return { id: authoritative.id, accountId: authoritative.accountId, periodId: authoritative.periodId, companyCode: authoritative.companyCode };
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
