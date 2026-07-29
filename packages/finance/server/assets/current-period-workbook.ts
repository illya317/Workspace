import * as XLSX from "xlsx";
import { parseCurrentPeriodFixedAssets } from "./current-period-fixed-assets";
import { parseCurrentPeriodOtherAssets } from "./current-period-other-assets";
import type { AssetWorkbookScope, ParsedAssetWorkbook } from "./current-period-workbook-types";

export function parseAssetWorkbook(buffer: Buffer, rawScope: AssetWorkbookScope): ParsedAssetWorkbook {
  const scope = { ...rawScope, sourceFile: fileName(rawScope.sourceFile) };
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, cellFormula: true });
  const fixed = parseCurrentPeriodFixedAssets(workbook, scope);
  const other = parseCurrentPeriodOtherAssets(workbook, scope);
  const assets = [...fixed.assets, ...other.assets];
  const blockers = [...fixed.blockers, ...other.blockers];
  for (const asset of assets) {
    if (asset.categoryCandidate.startsWith("PENDING-")) blockers.push({ code: "ASSET_CATEGORY_UNRESOLVED", message: `资产分类无法唯一识别：${asset.name}`, sourceSheet: asset.sourceSheet, sourceRange: asset.sourceRange });
  }
  return {
    scope,
    workbookCompanyLabels: [...new Set([fixed.companyLabel, ...other.companyLabels].filter((value): value is string => Boolean(value)))],
    periodEvidence: [...fixed.periodEvidence, ...other.periodEvidence],
    assets,
    renovationCostEvidence: other.renovationCostEvidence,
    controls: [...fixed.controls, ...other.controls],
    blockers,
    readyForImport: blockers.length === 0,
  };
}

function fileName(value: string) {
  return value.trim().split(/[\\/]/).at(-1) ?? value.trim();
}
