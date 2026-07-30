import type { FinanceAssetKind } from "../../types/assets";
import { FINANCE_ASSET_LEASEHOLD_CATEGORY_CODE } from "./account-policy";
import type { ParsedAssetWorkbook, ParsedCurrentPeriodAsset } from "./current-period-workbook-types";

export type FinanceAssetLegacySyntheticAsset = {
  sourceKey: string;
  sourceSheet: string;
  sourceRange: string;
  name: string;
  category: string;
  assetKind: FinanceAssetKind;
  originalCost: number;
  closingNet: number;
  fullUsefulLife: number;
  approvalReason: string;
};

export function applyFinanceAssetLegacySyntheticAssets(
  parsed: ParsedAssetWorkbook,
  definitions: FinanceAssetLegacySyntheticAsset[],
): ParsedAssetWorkbook {
  if (definitions.length === 0) return parsed;
  if (definitions.length !== 1) throw new Error("本期受控装修资产必须且只能定义一张合成卡");
  if (parsed.scope.year !== 2026 || parsed.scope.month !== 6) {
    throw new Error("受控合成资产仅允许用于 2026-06-30 历史切点");
  }
  const existingKeys = new Set(parsed.assets.map((asset) => asset.sourceKey));
  const definitionKeys = new Set<string>();
  const evidence = parsed.renovationCostEvidence;
  if (evidence.length === 0 || evidence.some((line) => line.treatment === "unresolved")) {
    throw new Error("受控合成装修资产缺少已解析的纳入/排除成本证据");
  }
  const included = evidence.filter((line) => line.treatment === "included");
  const excluded = evidence.filter((line) => line.treatment === "excluded_from_source_total");
  const includedAmount = money(included.reduce((sum, line) => sum + line.amount, 0));
  const excludedAmount = money(excluded.reduce((sum, line) => sum + line.amount, 0));
  const syntheticAssets = definitions.map((definition): ParsedCurrentPeriodAsset => {
    assertDefinition(definition);
    if (existingKeys.has(definition.sourceKey) || definitionKeys.has(definition.sourceKey)) {
      throw new Error(`受控合成资产 sourceKey 与来源卡片冲突：${definition.sourceKey}`);
    }
    definitionKeys.add(definition.sourceKey);
    if (evidence.some((line) => line.sourceSheet !== definition.sourceSheet)) {
      throw new Error(`受控合成资产与装修成本证据 Sheet 不一致：${definition.sourceKey}`);
    }
    if (!moneyEqual(definition.originalCost, includedAmount)) {
      throw new Error(`受控合成装修资产原值必须等于 included 成本证据合计：${definition.sourceKey}`);
    }
    const sourceRow = sourceRowFromKey(definition.sourceKey, definition.sourceSheet);
    const includedKeys = included.map((line) => line.sourceKey).sort();
    const excludedKeys = excluded.map((line) => line.sourceKey).sort();
    return {
      legacySynthetic: true,
      sourceFile: parsed.scope.sourceFile,
      sourceSheet: definition.sourceSheet,
      sourceRow,
      sourceRange: definition.sourceRange,
      sourceKey: definition.sourceKey,
      assetCode: definition.sourceKey,
      name: definition.name,
      assetKind: definition.assetKind,
      categoryCandidate: definition.category,
      sourceCategory: "受控历史切点承租装修",
      originalCost: money(definition.originalCost),
      usefulLifeMonths: definition.fullUsefulLife,
      openingAccumulatedAmount: money(definition.originalCost - definition.closingNet),
      openingAsOfDate: "2026-05-31",
      closingNetAmount: money(definition.closingNet),
      note: [
        `legacySyntheticApproval=${definition.approvalReason}`,
        `renovationEvidenceRange=${definition.sourceRange}`,
        `includedEvidenceKeys=${includedKeys.join(",")}`,
        `excludedEvidenceKeys=${excludedKeys.join(",") || "none"}`,
        `excludedEvidenceAmount=${excludedAmount.toFixed(2)}`,
      ].join("；"),
    };
  });
  const warnings = parsed.warnings.map((warning) => warning.code === "RENOVATION_CARD_EVIDENCE_MISSING"
    ? { ...warning, message: "装修成本池已由本期受控配置生成历史切点资产卡", note: definitions.map((item) => item.approvalReason).join("；") }
    : warning);
  return {
    ...parsed,
    assets: [...parsed.assets, ...syntheticAssets],
    controls: [...parsed.controls, {
      key: "renovation_synthetic_asset_cost",
      sourceSheet: definitions[0]!.sourceSheet,
      sourceRange: definitions[0]!.sourceRange,
      expected: definitions[0]!.originalCost,
      actual: includedAmount,
      difference: money(includedAmount - definitions[0]!.originalCost),
      status: "pass",
      note: `excludedEvidenceAmount=${excludedAmount.toFixed(2)}`,
    }],
    warnings,
    readyForImport: parsed.blockers.length === 0,
  };
}

function assertDefinition(definition: FinanceAssetLegacySyntheticAsset) {
  if (definition.assetKind !== "long_term_deferred" || definition.category !== FINANCE_ASSET_LEASEHOLD_CATEGORY_CODE) {
    throw new Error(`受控合成资产仅允许 long_term_deferred + ${FINANCE_ASSET_LEASEHOLD_CATEGORY_CODE}`);
  }
  if (!definition.sourceKey.trim() || !definition.sourceSheet.trim() || !definition.sourceRange.trim()
    || !definition.name.trim() || !definition.approvalReason.trim()) {
    throw new Error("受控合成资产缺少来源、名称或审批依据");
  }
  if (!definition.sourceRange.startsWith(`${definition.sourceSheet}!`)) {
    throw new Error(`受控合成资产 sourceRange 与 sourceSheet 不一致：${definition.sourceKey}`);
  }
  if (!Number.isFinite(definition.originalCost) || !Number.isFinite(definition.closingNet)
    || definition.originalCost <= 0 || definition.closingNet < 0 || definition.closingNet > definition.originalCost
    || !hasAtMostTwoDecimals(definition.originalCost) || !hasAtMostTwoDecimals(definition.closingNet)
    || !Number.isInteger(definition.fullUsefulLife) || definition.fullUsefulLife <= 0) {
    throw new Error(`受控合成资产金额或完整寿命无效：${definition.sourceKey}`);
  }
}

function sourceRowFromKey(sourceKey: string, sourceSheet: string) {
  const prefix = `${sourceSheet}:`;
  if (!sourceKey.startsWith(prefix)) throw new Error(`受控合成资产 sourceKey 与 sourceSheet 不一致：${sourceKey}`);
  const sourceRow = Number(sourceKey.slice(prefix.length));
  if (!Number.isInteger(sourceRow) || sourceRow <= 0) throw new Error(`受控合成资产 sourceKey 行号无效：${sourceKey}`);
  return sourceRow;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const moneyEqual = (left: number, right: number) => Math.abs(money(left - right)) < 0.005;
const hasAtMostTwoDecimals = (value: number) => Math.abs(Math.round(value * 100) - value * 100) <= 1e-8;
