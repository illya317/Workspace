import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { FinanceAssetLegacySyntheticAsset } from "./legacy-synthetic-assets";
import { FINANCE_ASSET_LEASEHOLD_CATEGORY_CODE } from "./account-policy";
import {
  createFinanceAssetErpGlCutoverReconciler,
  type FinanceAssetErpGlCutoverOptions,
  type FinanceAssetErpGlCutoverReconciler,
  type FinanceAssetErpGlSourceSelector,
} from "./erp-gl-cutover-provider";

type Scope = { companyCode: string; year: number; month: number };
type ApprovedConfig = FinanceAssetErpGlCutoverOptions & {
  legacySyntheticAssets: FinanceAssetLegacySyntheticAsset[];
  executionApproved: true;
  approvalReference: string;
  approvedBy: string;
};

const APPROVED_CONFIGS = new WeakMap<object, ApprovedConfig>();
const APPROVED_RECONCILERS = new WeakSet<FinanceAssetErpGlCutoverReconciler>();
const SELECTOR_KEYS = new Set(["sourceKey", "role", "sourceAccountCode", "auxiliary", "allocationMode", "approvalReason", "approvedSelectedAmount"]);
const AUXILIARY_KEYS = new Set(["supplierCode", "customerCode", "personCode", "departmentCode", "itemClass", "itemCode"]);
const SYNTHETIC_KEYS = new Set(["sourceKey", "sourceSheet", "sourceRange", "name", "category", "assetKind", "originalCost", "closingNet", "fullUsefulLife", "approvalReason"]);

declare const APPROVED_CONFIG_BRAND: unique symbol;
export type ApprovedFinanceAssetCutoverConfig = { readonly [APPROVED_CONFIG_BRAND]: true };

export async function loadApprovedFinanceAssetCutoverConfig(configPath: string, scope: Scope): Promise<ApprovedFinanceAssetCutoverConfig> {
  if (!path.isAbsolute(configPath)) throw new Error("资产切点审批配置必须使用绝对路径");
  await assertOutsideWorktree(configPath);
  const stat = await fs.lstat(configPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("资产切点审批配置必须是普通文件，不得使用 symlink");
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error("资产切点审批配置 owner 必须是当前用户");
  if ((stat.mode & 0o077) !== 0) throw new Error("资产切点审批配置权限必须为 0600，不得授予 group/world 任何权限");
  const parsed = deepFreeze(parseApprovedConfig(JSON.parse(await fs.readFile(configPath, "utf8")) as unknown, scope, path.dirname(configPath)));
  const opaque = Object.freeze({}) as ApprovedFinanceAssetCutoverConfig;
  APPROVED_CONFIGS.set(opaque, parsed);
  return opaque;
}

export function createExecutionApprovedFinanceAssetErpGlCutoverReconciler(
  config: ApprovedFinanceAssetCutoverConfig,
  actorValue: string,
) {
  const snapshot = APPROVED_CONFIGS.get(config);
  if (!snapshot) throw new Error("执行级资产切点 reconciler 必须消费审批文件 loader 返回的 opaque config");
  const executedBy = text(actorValue, "executedBy");
  const reconciler = createFinanceAssetErpGlCutoverReconciler({
    ...snapshot,
    executionApproval: { approvalReference: snapshot.approvalReference, approvedBy: snapshot.approvedBy, executedBy },
  });
  APPROVED_RECONCILERS.add(reconciler);
  return reconciler;
}

export function getApprovedFinanceAssetLegacySyntheticAssets(config: ApprovedFinanceAssetCutoverConfig) {
  const snapshot = APPROVED_CONFIGS.get(config);
  if (!snapshot) throw new Error("资产切点 synthetic assets 只能从审批文件 opaque config 读取");
  return snapshot.legacySyntheticAssets as readonly FinanceAssetLegacySyntheticAsset[];
}

export function isExecutionApprovedGovernedReconciler(value: unknown): value is FinanceAssetErpGlCutoverReconciler {
  return typeof value === "function" && APPROVED_RECONCILERS.has(value as FinanceAssetErpGlCutoverReconciler);
}

function parseApprovedConfig(raw: unknown, scope: Scope, configDirectory: string): ApprovedFinanceAssetCutoverConfig {
  if (scope.year !== 2026 || scope.month !== 6) throw new Error("当前历史资产迁移仅批准 2026-06-30 切点");
  const root = record(raw, "资产切点审批配置");
  if (root.executionApproved !== true) throw new Error("资产切点审批配置尚未显式批准执行");
  const approvalReference = text(root.approvalReference, "approvalReference");
  const approvedBy = text(root.approvedBy, "approvedBy");
  const archiveRoot = text(root.archiveRoot, "archiveRoot");
  const cutoffDate = text(root.cutoffDate, "cutoffDate");
  if (cutoffDate !== "2026-06-30") throw new Error("资产切点审批配置日期必须为 2026-06-30");
  const companies = record(root.companies, "companies");
  const company = record(companies[scope.companyCode], `companies.${scope.companyCode}`);
  const sourceSystem = text(company.sourceSystem, "sourceSystem");
  const sourceLedger = text(company.sourceLedger, "sourceLedger");
  const sourceDatabase = text(company.sourceDatabase, "sourceDatabase");
  const mappingMode = text(company.mappingMode, "mappingMode");
  const mappingStartYear = company.mappingStartYear;
  if (sourceSystem !== "T6" || mappingMode !== "recurring" || sourceDatabase !== `UFDATA_${sourceLedger}_${scope.year}`
    || !Number.isInteger(mappingStartYear) || Number(mappingStartYear) > scope.year) {
    throw new Error("资产切点审批配置的账套、映射模式或年度无效");
  }
  const selectors = array(company.selectors, "selectors");
  const selectorByKey = new Map<string, FinanceAssetErpGlSourceSelector>();
  for (const [index, rawSelector] of selectors.entries()) {
    const selector = record(rawSelector, `selectors[${index}]`);
    assertKeys(selector, SELECTOR_KEYS, "selector");
    const sourceKey = text(selector.sourceKey, `selectors[${index}].sourceKey`);
    const role = text(selector.role, `selectors[${index}].role`);
    if (!(["asset", "accumulated", "impairment"] as const).includes(role as "asset")) throw new Error(`资产切点 selector role 无效：${sourceKey}`);
    const key = `${sourceKey}:${role}`;
    if (selectorByKey.has(key)) throw new Error(`资产切点 selector 重复：${key}`);
    const sourceAccountCode = optionalText(selector.sourceAccountCode);
    const auxiliary = parseAuxiliary(selector.auxiliary);
    const allocationMode = optionalText(selector.allocationMode) ?? "standard";
    if (!(["standard", "replace_single_card_from_gl", "approved_subledger_amount"] as const).includes(allocationMode as "standard")) throw new Error(`资产切点 allocationMode 无效：${allocationMode}`);
    const approvalReason = optionalText(selector.approvalReason);
    const approvedSelectedAmount = selector.approvedSelectedAmount;
    if (allocationMode === "standard" && (approvalReason != null || approvedSelectedAmount != null)) throw new Error("standard 模式不得包含审批覆盖字段");
    if (allocationMode !== "standard" && !approvalReason) throw new Error(`${allocationMode} 必须提供 approvalReason`);
    if (allocationMode === "replace_single_card_from_gl" && approvedSelectedAmount != null) throw new Error("replace 模式不得提供 approvedSelectedAmount");
    if (allocationMode === "approved_subledger_amount") requiredMoney(approvedSelectedAmount, "approvedSelectedAmount", true);
    if (!sourceAccountCode && !auxiliary) throw new Error(`资产切点 selector 缺少来源科目或辅助条件：${key}`);
    selectorByKey.set(key, deepFreeze({ sourceAccountCode, auxiliary, allocationMode: allocationMode as FinanceAssetErpGlSourceSelector["allocationMode"], approvalReason, approvedSelectedAmount: approvedSelectedAmount as number | undefined }));
  }
  const legacySyntheticAssets = parseSyntheticAssets(company.legacySyntheticAssets);
  return {
    archiveRoot: path.resolve(configDirectory, archiveRoot),
    cutoffDate,
    spec: { companyCode: scope.companyCode, companyName: text(company.companyName, "companyName"), year: scope.year, sourceSystem: "T6", sourceLedger, sourceDatabase, mappingMode: "recurring", mappingStartYear: Number(mappingStartYear) },
    selector: ({ asset, role }) => selectorByKey.get(`${asset.sourceKey}:${role}`),
    legacySyntheticAssets,
    executionApproved: true,
    approvalReference,
    approvedBy,
  };
}

function parseSyntheticAssets(value: unknown): FinanceAssetLegacySyntheticAsset[] {
  if (value == null) return [];
  return array(value, "legacySyntheticAssets").map((raw, index) => {
    const item = record(raw, `legacySyntheticAssets[${index}]`);
    assertKeys(item, SYNTHETIC_KEYS, "legacySyntheticAssets");
    const sourceKey = text(item.sourceKey, "sourceKey");
    const sourceSheet = text(item.sourceSheet, "sourceSheet");
    const sourceRange = text(item.sourceRange, "sourceRange");
    const category = text(item.category, "category");
    const assetKind = text(item.assetKind, "assetKind");
    const originalCost = requiredMoney(item.originalCost, "originalCost", false);
    const closingNet = requiredMoney(item.closingNet, "closingNet", true);
    const fullUsefulLife = item.fullUsefulLife;
    if (category !== FINANCE_ASSET_LEASEHOLD_CATEGORY_CODE || assetKind !== "long_term_deferred" || !sourceKey.startsWith(`${sourceSheet}:`)
      || !sourceRange.startsWith(`${sourceSheet}!`) || closingNet > originalCost || !Number.isInteger(fullUsefulLife) || Number(fullUsefulLife) <= 0) {
      throw new Error(`受控合成资产配置无效：${sourceKey}`);
    }
    return { sourceKey, sourceSheet, sourceRange, name: text(item.name, "name"), category, assetKind, originalCost, closingNet, fullUsefulLife: Number(fullUsefulLife), approvalReason: text(item.approvalReason, "approvalReason") };
  });
}

function parseAuxiliary(value: unknown) {
  if (value == null) return undefined;
  const item = record(value, "auxiliary");
  assertKeys(item, AUXILIARY_KEYS, "auxiliary");
  const entries = Object.entries(item).map(([key, raw]) => [key, text(raw, `auxiliary.${key}`)]);
  if (entries.length === 0) throw new Error("auxiliary 不得为空对象");
  return Object.fromEntries(entries);
}

async function assertOutsideWorktree(configPath: string) {
  const worktreeRoot = await findProjectWorktreeRoot();
  const relative = path.relative(worktreeRoot, path.resolve(configPath));
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("资产切点审批配置不得位于 git worktree/cwd 内");
  }
}

async function findProjectWorktreeRoot() {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    try {
      await fs.lstat(path.join(current, ".git"));
      return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error("无法从 Finance server 模块位置解析 git worktree root");
    current = parent;
  }
}

function deepFreeze<T>(value: T): T {
  if (!value || (typeof value !== "object" && typeof value !== "function") || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} 必须是对象`);
  return value as Record<string, unknown>;
}
function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} 必须是数组`);
  return value;
}
function text(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 必须是非空字符串`);
  return value.trim();
}
function optionalText(value: unknown) {
  return value == null ? undefined : text(value, "optional text");
}
function assertKeys(value: Record<string, unknown>, allowed: Set<string>, field: string) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${field} 包含未知键：${key}`);
}
function requiredMoney(value: unknown, field: string, allowZero: boolean) {
  if (typeof value !== "number" || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)
    || Math.abs(Math.round(value * 100) - value * 100) > 1e-8) throw new Error(`${field} 必须是有效两位小数金额`);
  return value;
}
