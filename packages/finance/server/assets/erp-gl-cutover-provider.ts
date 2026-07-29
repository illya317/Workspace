import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { loadReadableArchiveEvidence } from "../import/readable/archive-evidence";
import type { ReadableBatchSpec } from "../import/readable/types";
import { assertFinanceReadableBatchWriteScope } from "../domain/readable-import-validation";
import type {
  FinanceAssetCutoverAccountControl,
  FinanceAssetCutoverAuthoritativeContext,
  FinanceAssetCutoverCardAllocation,
  FinanceAssetLedgerCutoverResult,
} from "./legacy-cutover-reconciliation";

type CutoverAsset = {
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

type AuxiliarySelector = Partial<{
  supplierCode: string;
  customerCode: string;
  personCode: string;
  departmentCode: string;
  itemClass: string;
  itemCode: string;
}>;

export type FinanceAssetErpGlAllocationMode =
  | "standard"
  | "replace_single_card_from_gl"
  | "approved_subledger_amount";

export type FinanceAssetErpGlSourceSelector = {
  sourceAccountCode?: string;
  auxiliary?: AuxiliarySelector;
  allocationMode?: FinanceAssetErpGlAllocationMode;
  approvalReason?: string;
  approvedSelectedAmount?: number;
};

export type FinanceAssetErpGlCutoverOptions = {
  archiveRoot: string;
  spec: ReadableBatchSpec;
  cutoffDate: string;
  executionApproval?: { approvalReference: string; approvedBy: string; executedBy: string };
  selector?: (input: { asset: CutoverAsset; role: "asset" | "accumulated" | "impairment"; workspaceAccountCode: string }) => FinanceAssetErpGlSourceSelector | undefined;
};

export type FinanceAssetErpGlCutoverReconciler = (
  tx: unknown,
  input: {
    companyCode: string;
    companyId: number;
    year: number;
    month: number;
    cutoverDate: string;
    periodId: number;
    authoritativeContext: FinanceAssetCutoverAuthoritativeContext;
    assets: CutoverAsset[];
  },
) => Promise<FinanceAssetLedgerCutoverResult>;

const TRUSTED_RECONCILERS = new WeakSet<FinanceAssetErpGlCutoverReconciler>();

export function isFinanceAssetErpGlCutoverReconciler(value: unknown): value is FinanceAssetErpGlCutoverReconciler {
  return typeof value === "function" && TRUSTED_RECONCILERS.has(value as FinanceAssetErpGlCutoverReconciler);
}

type AccsumRow = {
  ccode: string;
  iperiod: number;
  cendd_c_engl: "Dr" | "Cr" | "-";
  me: number;
  md: number;
  mc: number;
};

type AccassRow = AccsumRow & {
  csup_id: string | null;
  ccus_id: string | null;
  cperson_id: string | null;
  cdept_id: string | null;
  citem_class: string | null;
  citem_id: string | null;
};

type AccvouchRow = {
  ccode: string;
  iperiod: number;
  md: number;
  mc: number;
  ibook: number;
  bdelete: boolean;
};

type CodeRow = {
  ccode: string;
  ccode_name: string | null;
  bproperty: boolean;
  bend: boolean;
};

type ControlGroup = {
  role: "asset" | "accumulated" | "impairment";
  accountId: number;
  sourceAccountCode: string;
  selector: FinanceAssetErpGlSourceSelector;
  sourceKeys: string[];
};

export function createFinanceAssetErpGlCutoverReconciler(options: FinanceAssetErpGlCutoverOptions) {
  assertFinanceReadableBatchWriteScope(options.spec);
  const reconciler: FinanceAssetErpGlCutoverReconciler = async (_tx, input) => {
    assertScope(options, input);
    const source = await loadErpGlSource(options);
    const balanceByAccountId = new Map(input.authoritativeContext.balances.map((row) => [row.accountId, row]));
    const allocations = input.assets.map((asset): FinanceAssetCutoverCardAllocation => {
      const assetBalance = balanceByAccountId.get(asset.assetAccountId);
      const accumulatedBalance = asset.accumulatedAccountId == null ? null : balanceByAccountId.get(asset.accumulatedAccountId) ?? null;
      const impairmentBalance = asset.impairmentAllowanceAccountId == null ? null : balanceByAccountId.get(asset.impairmentAllowanceAccountId) ?? null;
      if (!assetBalance || (asset.accumulatedAccountId != null && !accumulatedBalance)
        || (asset.impairmentAllowanceAccountId != null && !impairmentBalance)) {
        throw new Error(`资产切点缺少 Workspace 权威余额：${asset.sourceKey}`);
      }
      return {
        sourceKey: asset.sourceKey,
        openingAccumulatedAmount: money(asset.workbookAccumulatedAmount),
        openingImpairmentAmount: 0,
        openingNetBookValue: money(asset.workbookNetBookValue),
        cutoverResidualValue: money(asset.cutoverResidualValue),
        remainingUsefulLifeMonthsAtCutover: asset.remainingUsefulLifeMonthsAtCutover,
        allocationStatus: "allocated",
        roundingAdjustment: 0,
        ledgerControlAdjustment: 0,
        ledgerControlAllocationMode: null,
        ledgerControlApprovalReason: null,
        assetBalance: reference(assetBalance),
        accumulatedBalance: accumulatedBalance ? reference(accumulatedBalance) : null,
        impairmentBalance: impairmentBalance ? reference(impairmentBalance) : null,
      };
    });
    const allocationByKey = new Map(allocations.map((row) => [row.sourceKey, row]));
    const groups = buildControlGroups(input.assets, balanceByAccountId, options.selector);
    const warnings: string[] = [];
    const accountControls = groups.map((group) => buildControl(group, input.assets, allocationByKey, balanceByAccountId, source, warnings));
    applyControlledDifferences(accountControls, input.assets, allocationByKey, warnings);
    refreshAllocatedAmounts(accountControls, input.assets, allocationByKey);
    const netDifference = money(accountControls.reduce((sum, control) => sum + netEffect(control), 0));
    const importedNetBookValue = money(allocations.reduce((sum, row) => sum + row.openingNetBookValue, 0));
    const ledgerNetBookValue = money(importedNetBookValue + netDifference);
    const hasPending = allocations.some((row) => row.allocationStatus === "pending") || accountControls.some((row) => !moneyEqual(row.difference, 0));
    const hasRounding = allocations.some((row) => !moneyEqual(row.roundingAdjustment, 0));
    const hasLedgerControlAdjustment = allocations.some((row) => !moneyEqual(row.ledgerControlAdjustment, 0));
    const status = hasPending ? "pending_allocation" : hasRounding ? "rounding_allocated" : hasLedgerControlAdjustment ? "ledger_control_adjusted" : "matched";
    const fingerprint = createHash("sha256").update(stableJson({
      packageKey: source.packageKey,
      companyCode: input.companyCode,
      sourceLedger: options.spec.sourceLedger,
      sourceDatabase: options.spec.sourceDatabase,
      cutoverDate: input.cutoverDate,
      executionApproval: options.executionApproval ?? null,
      accountControls,
      allocations: allocations.map(({ sourceKey, openingAccumulatedAmount, openingImpairmentAmount, openingNetBookValue, roundingAdjustment, ledgerControlAdjustment, ledgerControlAllocationMode, ledgerControlApprovalReason, allocationStatus }) => ({ sourceKey, openingAccumulatedAmount, openingImpairmentAmount, openingNetBookValue, roundingAdjustment, ledgerControlAdjustment, ledgerControlAllocationMode, ledgerControlApprovalReason, allocationStatus })),
    })).digest("hex");
    return {
      cutoverDate: input.cutoverDate,
      period: input.authoritativeContext.period,
      fingerprint,
      status,
      ledgerNetBookValue,
      importedNetBookValue,
      unallocatedNetBookValue: netDifference,
      allocations,
      accountControls,
      warnings,
      executionApproval: options.executionApproval ?? null,
    };
  };
  TRUSTED_RECONCILERS.add(reconciler);
  return reconciler;
}

async function loadErpGlSource(options: FinanceAssetErpGlCutoverOptions) {
  const requiredTables = ["GL_accsum", "GL_accass", "GL_accvouch", "code"].map((table) => ({ database: options.spec.sourceDatabase, table }));
  const evidence = await loadReadableArchiveEvidence({ root: options.archiveRoot, spec: options.spec, requiredTables });
  if (evidence.cutoffDate !== options.cutoffDate || !evidence.isAccountingClose) {
    throw new Error(`ERP 来源切点必须为 ${options.cutoffDate} 且已关账`);
  }
  const dataDir = join(options.archiveRoot, "T6", "databases", options.spec.sourceDatabase, "data");
  const [accsum, accass, accvouch, codes] = await Promise.all([
    readJsonLines<AccsumRow>(join(dataDir, "GL_accsum.jsonl")),
    readJsonLines<AccassRow>(join(dataDir, "GL_accass.jsonl")),
    readJsonLines<AccvouchRow>(join(dataDir, "GL_accvouch.jsonl")),
    readJsonLines<CodeRow>(join(dataDir, "code.jsonl")),
  ]);
  return { ...evidence, accsum, accass, accvouch, codes };
}

function assertScope(options: FinanceAssetErpGlCutoverOptions, input: { companyCode: string; year: number; month: number; cutoverDate: string; authoritativeContext: FinanceAssetCutoverAuthoritativeContext }) {
  if (options.spec.companyCode !== input.companyCode || options.spec.year !== input.year
    || options.spec.sourceSystem !== "T6" || options.spec.sourceDatabase !== `UFDATA_${options.spec.sourceLedger}_${input.year}`) {
    throw new Error("ERP 资产切点来源账套与公司或年度不一致");
  }
  if (input.cutoverDate !== options.cutoffDate || input.month !== 6
    || input.authoritativeContext.period.endDate !== options.cutoffDate || !input.authoritativeContext.period.isClosed) {
    throw new Error("ERP 资产切点期间或关账状态不一致");
  }
}

function buildControlGroups(
  assets: CutoverAsset[],
  balances: Map<number, FinanceAssetCutoverAuthoritativeContext["balances"][number]>,
  selector: FinanceAssetErpGlCutoverOptions["selector"],
) {
  const groups = new Map<string, ControlGroup>();
  for (const asset of assets) {
    for (const [role, accountId] of [["asset", asset.assetAccountId], ["accumulated", asset.accumulatedAccountId], ["impairment", asset.impairmentAllowanceAccountId]] as const) {
      if (accountId == null) continue;
      const balance = balances.get(accountId);
      if (!balance) throw new Error(`资产切点缺少科目余额：${accountId}`);
      const selected = selector?.({ asset, role, workspaceAccountCode: balance.accountCode }) ?? {};
      const normalized = normalizeSelector(selected, balance.accountCode);
      const key = `${role}:${accountId}:${normalized.sourceAccountCode}:${stableJson(normalized)}`;
      const group = groups.get(key) ?? { role, accountId, sourceAccountCode: normalized.sourceAccountCode, selector: normalized, sourceKeys: [] };
      group.sourceKeys.push(asset.sourceKey);
      groups.set(key, group);
    }
  }
  return [...groups.values()];
}

function buildControl(
  group: ControlGroup,
  assets: CutoverAsset[],
  allocations: Map<string, FinanceAssetCutoverCardAllocation>,
  balances: Map<number, FinanceAssetCutoverAuthoritativeContext["balances"][number]>,
  source: Awaited<ReturnType<typeof loadErpGlSource>>,
  warnings: string[],
): FinanceAssetCutoverAccountControl {
  const balance = balances.get(group.accountId)!;
  const code = source.codes.find((row) => row.ccode === group.sourceAccountCode);
  if (!code) throw new Error(`ERP 来源科目不存在：${group.sourceAccountCode}`);
  const expectedDirection = group.role === "asset" ? "debit" : "credit";
  const sourceDirection = code.bproperty ? "debit" : "credit";
  if (sourceDirection !== expectedDirection || balance.balanceDirection !== expectedDirection) {
    throw new Error(`资产切点科目借贷方向错误：${group.sourceAccountCode}`);
  }
  const rows = source.accsum.filter((row) => row.ccode === group.sourceAccountCode && row.iperiod === 6);
  if (rows.length > 1) throw new Error(`ERP 来源科目六期余额不唯一：${group.sourceAccountCode}`);
  const controlledZero = rows.length === 0;
  if (controlledZero) assertControlledZeroSource(group.sourceAccountCode, balance, source);
  const row = rows[0];
  const sourceClosingDebit = row?.cendd_c_engl === "Dr" ? money(row.me) : 0;
  const sourceClosingCredit = row?.cendd_c_engl === "Cr" ? money(row.me) : 0;
  if (!moneyEqual(sourceClosingDebit, balance.closingDebit) || !moneyEqual(sourceClosingCredit, balance.closingCredit)) {
    throw new Error(`ERP 来源与 Workspace 总账余额不一致：${group.sourceAccountCode}`);
  }
  if (row) assertPostedVoucherMovement(group.sourceAccountCode, code.bend, row, source.accvouch, source.codes);
  else warnings.push(`科目 ${group.sourceAccountCode} 通过受控零余额协议：Workspace 余额为零，ERP 无余额行、当期凭证或辅助余额`);
  if (!code.bend) warnings.push(`科目 ${group.sourceAccountCode} 为根科目；仅作为总账控制，不据此猜测资产分类`);
  const fullDirectionalBalance = expectedDirection === "debit" ? sourceClosingDebit : sourceClosingCredit;
  const selectedFromLedger = controlledZero
    ? 0
    : group.selector.auxiliary
    ? selectedAuxiliaryAmount(group.sourceAccountCode, group.selector.auxiliary, source.accass)
    : fullDirectionalBalance;
  assertExceptionalAllocationScope(group, assets);
  const sourceSelectedAmount = group.selector.allocationMode === "approved_subledger_amount"
    ? group.selector.approvedSelectedAmount!
    : selectedFromLedger;
  if (group.selector.allocationMode === "approved_subledger_amount" && sourceSelectedAmount > fullDirectionalBalance) {
    throw new Error(`资产切点审批子台账金额超过同方向总账余额：${group.sourceAccountCode}`);
  }
  const allocatedAmount = allocatedControlAmount(group, assets, allocations);
  return {
    key: `${group.role}:${group.accountId}:${group.sourceAccountCode}:${createHash("sha256").update(stableJson(group.selector)).digest("hex").slice(0, 12)}`,
    role: group.role,
    sourceKeys: [...group.sourceKeys].sort(),
    accountId: group.accountId,
    accountCode: balance.accountCode,
    balanceId: balance.id,
    selection: group.selector.allocationMode === "replace_single_card_from_gl"
      ? "gl_replacement"
      : group.selector.allocationMode === "approved_subledger_amount"
        ? "approved_subledger"
        : controlledZero ? "controlled_zero" : group.selector.auxiliary ? "auxiliary" : "full_account",
    allocationMode: group.selector.allocationMode ?? "standard",
    approvalReason: group.selector.approvalReason ?? null,
    approvedSelectedAmount: group.selector.approvedSelectedAmount ?? null,
    expectedDirection,
    workspaceClosingDebit: money(balance.closingDebit),
    workspaceClosingCredit: money(balance.closingCredit),
    sourceClosingDebit,
    sourceClosingCredit,
    sourceSelectedAmount,
    allocatedAmount,
    difference: money(sourceSelectedAmount - allocatedAmount),
  };
}

function applyControlledDifferences(
  controls: FinanceAssetCutoverAccountControl[],
  assets: CutoverAsset[],
  allocations: Map<string, FinanceAssetCutoverCardAllocation>,
  warnings: string[],
) {
  for (const control of controls) {
    if (control.allocationMode !== "standard") {
      applyApprovedLedgerControl(control, assets, allocations, warnings);
      continue;
    }
    if (moneyEqual(control.difference, 0)) continue;
    const candidates = control.sourceKeys.map((key) => ({ asset: assets.find((row) => row.sourceKey === key)!, allocation: allocations.get(key)! }))
      .sort((left, right) => right.asset.workbookNetBookValue - left.asset.workbookNetBookValue || left.asset.sourceKey.localeCompare(right.asset.sourceKey));
    if (Math.abs(control.difference) <= 1 && candidates.length > 0 && !(control.role === "asset" && candidates[0]!.asset.accumulatedAccountId != null)) {
      const target = candidates[0]!.allocation;
      if (control.role === "asset") {
        target.openingNetBookValue = money(target.openingNetBookValue + control.difference);
        target.openingAccumulatedAmount = money(target.openingAccumulatedAmount - control.difference);
        target.roundingAdjustment = money(target.roundingAdjustment + control.difference);
      } else if (control.role === "accumulated") {
        target.openingAccumulatedAmount = money(target.openingAccumulatedAmount + control.difference);
        target.openingNetBookValue = money(target.openingNetBookValue - control.difference);
        target.roundingAdjustment = money(target.roundingAdjustment - control.difference);
      } else {
        target.openingImpairmentAmount = money(target.openingImpairmentAmount + control.difference);
        target.openingNetBookValue = money(target.openingNetBookValue - control.difference);
        target.roundingAdjustment = money(target.roundingAdjustment - control.difference);
      }
      warnings.push(`科目 ${control.accountCode} 尾差 ${control.difference.toFixed(2)} 已分配至最大净值卡片 ${target.sourceKey}`);
      continue;
    }
    for (const { allocation } of candidates) allocation.allocationStatus = "pending";
    warnings.push(`科目 ${control.accountCode} 尚有 ${control.difference.toFixed(2)} 未归卡余额，保持 pending_allocation`);
  }
}

function refreshAllocatedAmounts(controls: FinanceAssetCutoverAccountControl[], assets: CutoverAsset[], allocations: Map<string, FinanceAssetCutoverCardAllocation>) {
  for (const control of controls) {
    const group: ControlGroup = { role: control.role, accountId: control.accountId, sourceAccountCode: control.accountCode, selector: {}, sourceKeys: control.sourceKeys };
    control.allocatedAmount = allocatedControlAmount(group, assets, allocations);
    control.difference = money(control.sourceSelectedAmount - control.allocatedAmount);
  }
}

function applyApprovedLedgerControl(
  control: FinanceAssetCutoverAccountControl,
  assets: CutoverAsset[],
  allocations: Map<string, FinanceAssetCutoverCardAllocation>,
  warnings: string[],
) {
  const sourceKey = control.sourceKeys[0]!;
  const asset = assets.find((row) => row.sourceKey === sourceKey)!;
  const allocation = allocations.get(sourceKey)!;
  if (control.allocationMode === "standard") throw new Error("资产切点 standard 控制不得进入审批调整分支");
  if (control.sourceSelectedAmount > asset.originalCost) {
    throw new Error(`资产切点总账替换金额超过卡片原值：${sourceKey}`);
  }
  const adjustment = money(control.sourceSelectedAmount - asset.workbookNetBookValue);
  allocation.openingNetBookValue = money(control.sourceSelectedAmount);
  allocation.openingAccumulatedAmount = money(asset.originalCost - control.sourceSelectedAmount);
  allocation.roundingAdjustment = 0;
  allocation.ledgerControlAdjustment = adjustment;
  allocation.ledgerControlAllocationMode = control.allocationMode;
  allocation.ledgerControlApprovalReason = control.approvalReason;
  allocation.allocationStatus = "allocated";
  warnings.push(`科目 ${control.accountCode} 单卡 ${sourceKey} 按 ${control.allocationMode} 承接总账净额 ${control.sourceSelectedAmount.toFixed(2)}；台账控制调整 ${adjustment.toFixed(2)}；审批依据：${control.approvalReason}`);
}

function allocatedControlAmount(group: ControlGroup, assets: CutoverAsset[], allocations: Map<string, FinanceAssetCutoverCardAllocation>) {
  return money(group.sourceKeys.reduce((sum, key) => {
    const asset = assets.find((row) => row.sourceKey === key)!;
    const allocation = allocations.get(key)!;
    if (group.role === "asset") return sum + (asset.accumulatedAccountId == null && asset.impairmentAllowanceAccountId == null ? allocation.openingNetBookValue : asset.originalCost);
    if (group.role === "accumulated") return sum + allocation.openingAccumulatedAmount;
    return sum + allocation.openingImpairmentAmount;
  }, 0));
}

function selectedAuxiliaryAmount(accountCode: string, selector: AuxiliarySelector, rows: AccassRow[]) {
  const selected = rows.filter((row) => row.ccode === accountCode && row.iperiod === 6
    && matches(row.csup_id, selector.supplierCode) && matches(row.ccus_id, selector.customerCode)
    && matches(row.cperson_id, selector.personCode) && matches(row.cdept_id, selector.departmentCode)
    && matches(row.citem_class, selector.itemClass) && matches(row.citem_id, selector.itemCode));
  if (selected.length === 0) throw new Error(`ERP 辅助余额未命中：${accountCode}`);
  return money(selected.reduce((sum, row) => sum + (row.cendd_c_engl === "Dr" ? row.me : -row.me), 0));
}

function assertPostedVoucherMovement(accountCode: string, isLeaf: boolean, sum: AccsumRow, vouchers: AccvouchRow[], codes: CodeRow[]) {
  const descendantCodes = new Set(isLeaf ? [accountCode] : codes.filter((row) => row.ccode === accountCode || row.ccode.startsWith(accountCode)).filter((row) => row.bend).map((row) => row.ccode));
  const rows = vouchers.filter((row) => row.iperiod === 6 && descendantCodes.has(row.ccode) && !row.bdelete);
  if (rows.some((row) => row.ibook !== 1)) throw new Error(`ERP 科目 ${accountCode} 六期存在未记账凭证`);
  const debit = money(rows.reduce((sumValue, row) => sumValue + row.md, 0));
  const credit = money(rows.reduce((sumValue, row) => sumValue + row.mc, 0));
  if (!moneyEqual(debit, sum.md) || !moneyEqual(credit, sum.mc)) throw new Error(`ERP 科目 ${accountCode} 六期凭证与余额表发生额不一致`);
}

function assertControlledZeroSource(
  accountCode: string,
  balance: FinanceAssetCutoverAuthoritativeContext["balances"][number],
  source: Awaited<ReturnType<typeof loadErpGlSource>>,
) {
  if (!moneyEqual(balance.closingDebit, 0) || !moneyEqual(balance.closingCredit, 0)) {
    throw new Error(`ERP 来源科目缺少余额行但 Workspace 余额非零：${accountCode}`);
  }
  const descendantCodes = new Set(source.codes.filter((row) => row.ccode === accountCode || row.ccode.startsWith(accountCode)).map((row) => row.ccode));
  const descendantSums = source.accsum.filter((row) => row.iperiod === 6 && descendantCodes.has(row.ccode));
  if (descendantSums.some((row) => !moneyEqual(row.me, 0) || !moneyEqual(row.md, 0) || !moneyEqual(row.mc, 0))) {
    throw new Error(`ERP 受控零余额科目或叶子存在余额/发生额：${accountCode}`);
  }
  const vouchers = source.accvouch.filter((row) => row.iperiod === 6 && descendantCodes.has(row.ccode) && !row.bdelete);
  if (vouchers.length > 0) throw new Error(`ERP 受控零余额科目或叶子存在当期凭证：${accountCode}`);
  const auxiliary = source.accass.filter((row) => row.iperiod === 6 && descendantCodes.has(row.ccode));
  if (auxiliary.some((row) => !moneyEqual(row.me, 0) || !moneyEqual(row.md, 0) || !moneyEqual(row.mc, 0))) {
    throw new Error(`ERP 受控零余额科目或叶子存在辅助余额/发生额：${accountCode}`);
  }
}

function netEffect(control: FinanceAssetCutoverAccountControl) {
  if (control.role === "asset") return control.difference;
  return -control.difference;
}

function normalizeAuxiliary(value?: AuxiliarySelector) {
  if (!value) return undefined;
  const entries = Object.entries(value).filter(([, item]) => item?.trim()).map(([key, item]) => [key, item!.trim()]);
  return entries.length ? Object.fromEntries(entries) as AuxiliarySelector : undefined;
}

function normalizeSelector(selected: FinanceAssetErpGlSourceSelector, fallbackAccountCode: string): FinanceAssetErpGlSourceSelector & { sourceAccountCode: string; allocationMode: FinanceAssetErpGlAllocationMode } {
  const allocationMode = selected.allocationMode ?? "standard";
  if (!(allocationMode === "standard" || allocationMode === "replace_single_card_from_gl" || allocationMode === "approved_subledger_amount")) {
    throw new Error(`资产切点 allocationMode 无效：${String(allocationMode)}`);
  }
  const approvalReason = selected.approvalReason?.trim() || undefined;
  const approvedSelectedAmount = selected.approvedSelectedAmount;
  if (allocationMode === "standard") {
    if (approvalReason != null || approvedSelectedAmount != null) throw new Error("资产切点 standard 模式不得包含审批覆盖字段");
  } else if (!approvalReason) {
    throw new Error(`资产切点 ${allocationMode} 必须提供非空 approvalReason`);
  }
  if (allocationMode === "replace_single_card_from_gl" && approvedSelectedAmount != null) {
    throw new Error("资产切点 replace_single_card_from_gl 不得提供 approvedSelectedAmount");
  }
  if (allocationMode === "approved_subledger_amount"
    && (!Number.isFinite(approvedSelectedAmount) || approvedSelectedAmount! < 0 || !moneyEqual(approvedSelectedAmount!, money(approvedSelectedAmount!)))) {
    throw new Error("资产切点 approvedSelectedAmount 必须是非负两位小数金额");
  }
  return {
    sourceAccountCode: selected.sourceAccountCode?.trim() || fallbackAccountCode,
    auxiliary: normalizeAuxiliary(selected.auxiliary),
    allocationMode,
    approvalReason,
    approvedSelectedAmount,
  };
}

function assertExceptionalAllocationScope(group: ControlGroup, assets: CutoverAsset[]) {
  if ((group.selector.allocationMode ?? "standard") === "standard") return;
  if (group.role !== "asset" || group.sourceKeys.length !== 1) {
    throw new Error(`资产切点 ${group.selector.allocationMode} 仅允许单卡资产科目控制`);
  }
  const asset = assets.find((row) => row.sourceKey === group.sourceKeys[0])!;
  if (asset.accumulatedAccountId != null || asset.impairmentAllowanceAccountId != null) {
    throw new Error(`资产切点 ${group.selector.allocationMode} 仅允许无累计/减值控制的纯净额卡片`);
  }
}

function matches(actual: string | null, expected?: string) {
  return expected == null || actual === expected;
}

function reference(row: FinanceAssetCutoverAuthoritativeContext["balances"][number]) {
  return { id: row.id, accountId: row.accountId, periodId: row.periodId, companyCode: row.companyCode };
}

async function readJsonLines<T>(path: string) {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim()).map((line) => JSON.parse(line) as T);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const moneyEqual = (left: number, right: number) => Math.abs(money(left - right)) < 0.005;
