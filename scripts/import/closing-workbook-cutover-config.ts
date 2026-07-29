import fs from "node:fs/promises";
import path from "node:path";

import type { FinanceAssetErpGlCutoverOptions, FinanceAssetErpGlSourceSelector } from "@workspace/finance/server/assets/erp-gl-cutover-provider";
import { FINANCE_ASSET_LEASEHOLD_CATEGORY_CODE } from "@workspace/finance/server/assets/account-policy";
import type { FinanceAssetLegacySyntheticAsset } from "@workspace/finance/server/assets/legacy-synthetic-assets";

type SelectorRole = "asset" | "accumulated" | "impairment";

const AUXILIARY_KEYS = [
  "supplierCode",
  "customerCode",
  "personCode",
  "departmentCode",
  "itemClass",
  "itemCode",
] as const;
const SELECTOR_KEYS = new Set([
  "sourceKey",
  "role",
  "sourceAccountCode",
  "auxiliary",
  "allocationMode",
  "approvalReason",
  "approvedSelectedAmount",
]);
const SYNTHETIC_ASSET_KEYS = new Set([
  "sourceKey",
  "sourceSheet",
  "sourceRange",
  "name",
  "category",
  "assetKind",
  "originalCost",
  "closingNet",
  "fullUsefulLife",
  "approvalReason",
]);

export type ClosingWorkbookCutoverConfig = {
  executionApproved: true;
  approvalReference: string;
  approvedBy: string;
  archiveRoot: string;
  cutoffDate: string;
  companies: Record<string, {
    companyName: string;
    sourceSystem: "T6";
    sourceLedger: string;
    sourceDatabase: string;
    mappingMode: "recurring";
    mappingStartYear: number;
    selectors: Array<FinanceAssetErpGlSourceSelector & { sourceKey: string; role: SelectorRole }>;
    legacySyntheticAssets?: FinanceAssetLegacySyntheticAsset[];
  }>;
};

export type ClosingWorkbookCutoverOptions = FinanceAssetErpGlCutoverOptions & {
  legacySyntheticAssets: FinanceAssetLegacySyntheticAsset[];
  executionApproved: true;
  approvalReference: string;
  approvedBy: string;
};

export async function loadClosingWorkbookCutoverOptions(
  configPath: string,
  scope: { companyCode: string; year: number; month: number },
): Promise<ClosingWorkbookCutoverOptions> {
  if (!configPath.trim()) throw new Error("执行资产导入必须提供 --asset-gl-config=<受控配置.json>");
  const absoluteConfigPath = path.resolve(configPath);
  const stat = await fs.lstat(absoluteConfigPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("资产总账切点执行配置必须是普通文件，不得使用 symlink");
  if ((stat.mode & 0o022) !== 0) throw new Error("资产总账切点执行配置不得允许 group/world 写入，建议权限 0600");
  const raw = JSON.parse(await fs.readFile(absoluteConfigPath, "utf8")) as unknown;
  return buildClosingWorkbookCutoverOptions(raw, scope, path.dirname(absoluteConfigPath));
}

export function requireClosingWorkbookActor(value: string | undefined) {
  const actor = value?.trim();
  if (!actor) throw new Error("执行资产导入必须显式提供 --actor=<username>");
  return actor;
}

export function buildClosingWorkbookCutoverOptions(
  raw: unknown,
  scope: { companyCode: string; year: number; month: number },
  configDirectory = process.cwd(),
): ClosingWorkbookCutoverOptions {
  if (scope.year !== 2026 || scope.month !== 6) {
    throw new Error("当前历史资产迁移仅批准 2026-06-30 切点");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("资产总账切点配置必须是 JSON 对象");
  const config = raw as Partial<ClosingWorkbookCutoverConfig>;
  if (config.executionApproved !== true) throw new Error("资产总账切点配置尚未显式批准执行");
  const approvalReference = requiredText(config.approvalReference, "approvalReference");
  const approvedBy = requiredText(config.approvedBy, "approvedBy");
  const archiveRoot = requiredText(config.archiveRoot, "archiveRoot");
  const cutoffDate = requiredText(config.cutoffDate, "cutoffDate");
  const expectedCutoff = monthEnd(scope.year, scope.month);
  if (cutoffDate !== expectedCutoff) throw new Error(`资产总账切点配置日期必须等于导入期间期末 ${expectedCutoff}`);
  const company = config.companies?.[scope.companyCode];
  if (!company) throw new Error(`资产总账切点配置缺少公司 ${scope.companyCode}`);
  if (company.sourceSystem !== "T6" || company.mappingMode !== "recurring") throw new Error("资产总账切点当前仅接受显式 T6 recurring 来源配置");
  const companyName = requiredText(company.companyName, "companyName");
  const sourceLedger = requiredText(company.sourceLedger, "sourceLedger");
  const sourceDatabase = requiredText(company.sourceDatabase, "sourceDatabase");
  if (sourceDatabase !== `UFDATA_${sourceLedger}_${scope.year}`) throw new Error("资产总账切点账套编号、数据库与年度不一致");
  if (!Number.isInteger(company.mappingStartYear) || company.mappingStartYear > scope.year) throw new Error("资产总账切点 mappingStartYear 无效");
  if (!Array.isArray(company.selectors)) throw new Error("资产总账切点配置必须显式提供 selectors 数组，可为空数组");
  const selectorByKey = new Map<string, FinanceAssetErpGlSourceSelector>();
  for (const item of company.selectors) {
    for (const field of Object.keys(item)) {
      if (!SELECTOR_KEYS.has(field)) throw new Error(`资产总账切点 selector 包含未知键：${field}`);
    }
    const sourceKey = requiredText(item.sourceKey, "selectors.sourceKey");
    if (!(["asset", "accumulated", "impairment"] as const).includes(item.role)) throw new Error(`资产总账切点 selector role 无效：${sourceKey}`);
    const key = `${sourceKey}:${item.role}`;
    if (selectorByKey.has(key)) throw new Error(`资产总账切点 selector 重复：${key}`);
    const sourceAccountCode = item.sourceAccountCode?.trim() || undefined;
    const auxiliary = normalizeAuxiliary(item.auxiliary);
    const allocationMode = item.allocationMode ?? "standard";
    if (!(allocationMode === "standard" || allocationMode === "replace_single_card_from_gl" || allocationMode === "approved_subledger_amount")) {
      throw new Error(`资产总账切点 allocationMode 无效：${String(allocationMode)}`);
    }
    const approvalReason = typeof item.approvalReason === "string" ? item.approvalReason.trim() : undefined;
    const approvedSelectedAmount = item.approvedSelectedAmount;
    if (allocationMode === "standard" && (item.approvalReason != null || approvedSelectedAmount != null)) {
      throw new Error("资产总账切点 standard 模式不得包含审批覆盖字段");
    }
    if (allocationMode !== "standard" && !approvalReason) {
      throw new Error(`资产总账切点 ${allocationMode} 必须提供非空 approvalReason`);
    }
    if (allocationMode === "replace_single_card_from_gl" && approvedSelectedAmount != null) {
      throw new Error("资产总账切点 replace_single_card_from_gl 不得提供 approvedSelectedAmount");
    }
    if (allocationMode === "approved_subledger_amount"
      && (!Number.isFinite(approvedSelectedAmount) || approvedSelectedAmount! < 0 || Math.round(approvedSelectedAmount! * 100) !== approvedSelectedAmount! * 100)) {
      throw new Error("资产总账切点 approvedSelectedAmount 必须是非负两位小数金额");
    }
    if (!sourceAccountCode && !auxiliary) throw new Error(`资产总账切点 selector 未声明来源科目或辅助条件：${key}`);
    selectorByKey.set(key, { sourceAccountCode, auxiliary, allocationMode, approvalReason, approvedSelectedAmount });
  }
  const legacySyntheticAssets = normalizeLegacySyntheticAssets(company.legacySyntheticAssets);
  return {
    archiveRoot: path.resolve(configDirectory, archiveRoot),
    cutoffDate,
    spec: {
      companyCode: scope.companyCode,
      companyName,
      year: scope.year,
      sourceSystem: "T6",
      sourceLedger,
      sourceDatabase,
      mappingMode: "recurring",
      mappingStartYear: company.mappingStartYear,
    },
    selector: ({ asset, role }) => selectorByKey.get(`${asset.sourceKey}:${role}`),
    legacySyntheticAssets,
    executionApproved: true,
    approvalReference,
    approvedBy,
  };
}

export function bindClosingWorkbookExecution(options: ClosingWorkbookCutoverOptions, actorValue: string): ClosingWorkbookCutoverOptions {
  const executedBy = requireClosingWorkbookActor(actorValue);
  if (!options.executionApproved || !options.approvalReference.trim() || !options.approvedBy.trim()) {
    throw new Error("资产总账切点执行缺少有效批准记录");
  }
  return { ...options, executionApproval: { approvalReference: options.approvalReference, approvedBy: options.approvedBy, executedBy } };
}

function normalizeLegacySyntheticAssets(value: unknown): FinanceAssetLegacySyntheticAsset[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("资产总账切点 legacySyntheticAssets 必须是数组");
  const sourceKeys = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`资产总账切点 legacySyntheticAssets[${index}] 必须是对象`);
    for (const field of Object.keys(raw)) {
      if (!SYNTHETIC_ASSET_KEYS.has(field)) throw new Error(`资产总账切点 legacySyntheticAssets 包含未知键：${field}`);
    }
    const item = raw as Record<string, unknown>;
    const sourceKey = requiredText(item.sourceKey, `legacySyntheticAssets[${index}].sourceKey`);
    if (sourceKeys.has(sourceKey)) throw new Error(`资产总账切点 legacySyntheticAssets sourceKey 重复：${sourceKey}`);
    sourceKeys.add(sourceKey);
    const sourceSheet = requiredText(item.sourceSheet, `legacySyntheticAssets[${index}].sourceSheet`);
    const sourceRange = requiredText(item.sourceRange, `legacySyntheticAssets[${index}].sourceRange`);
    const name = requiredText(item.name, `legacySyntheticAssets[${index}].name`);
    const category = requiredText(item.category, `legacySyntheticAssets[${index}].category`);
    const assetKind = requiredText(item.assetKind, `legacySyntheticAssets[${index}].assetKind`);
    const approvalReason = requiredText(item.approvalReason, `legacySyntheticAssets[${index}].approvalReason`);
    const originalCost = requiredMoney(item.originalCost, `legacySyntheticAssets[${index}].originalCost`, false);
    const closingNet = requiredMoney(item.closingNet, `legacySyntheticAssets[${index}].closingNet`, true);
    const fullUsefulLife = item.fullUsefulLife;
    if (assetKind !== "long_term_deferred" || category !== FINANCE_ASSET_LEASEHOLD_CATEGORY_CODE) throw new Error(`受控合成资产仅允许 long_term_deferred + ${FINANCE_ASSET_LEASEHOLD_CATEGORY_CODE}`);
    if (!sourceRange.startsWith(`${sourceSheet}!`) || !sourceKey.startsWith(`${sourceSheet}:`)) throw new Error(`受控合成资产来源 Sheet/范围/Key 不一致：${sourceKey}`);
    if (closingNet > originalCost) throw new Error(`受控合成资产 closingNet 不得超过 originalCost：${sourceKey}`);
    if (!Number.isInteger(fullUsefulLife) || Number(fullUsefulLife) <= 0) throw new Error(`受控合成资产 fullUsefulLife 无效：${sourceKey}`);
    return { sourceKey, sourceSheet, sourceRange, name, category, assetKind, originalCost, closingNet, fullUsefulLife: Number(fullUsefulLife), approvalReason };
  });
}

function normalizeAuxiliary(value: unknown): FinanceAssetErpGlSourceSelector["auxiliary"] {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("资产总账切点 auxiliary 必须是对象");
  const entries = Object.entries(value);
  if (entries.length === 0) throw new Error("资产总账切点 auxiliary 不得为空对象");
  const allowed = new Set<string>(AUXILIARY_KEYS);
  for (const [key, item] of entries) {
    if (!allowed.has(key)) throw new Error(`资产总账切点 auxiliary 包含未知键：${key}`);
    if (typeof item !== "string" || !item.trim()) throw new Error(`资产总账切点 auxiliary.${key} 必须是非空字符串`);
  }
  return Object.fromEntries(entries.map(([key, item]) => [key, (item as string).trim()]));
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`资产总账切点配置缺少 ${field}`);
  return value.trim();
}

function requiredMoney(value: unknown, field: string, allowZero: boolean) {
  if (typeof value !== "number" || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)
    || Math.abs(Math.round(value * 100) - value * 100) > 1e-8) {
    throw new Error(`资产总账切点 ${field} 必须是${allowZero ? "非负" : "正"}两位小数金额`);
  }
  return value;
}

function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
