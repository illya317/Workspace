import fs from "node:fs/promises";
import path from "node:path";
import { createExecutionApprovedFinanceAssetErpGlCutoverReconciler, getApprovedFinanceAssetLegacySyntheticAssets, loadApprovedFinanceAssetCutoverConfig } from "@workspace/finance/server/assets/approved-cutover-config";
import { parseAssetWorkbook } from "@workspace/finance/server/assets/current-period-workbook";
import { importAssetWorkbook } from "@workspace/finance/server/assets/workbook-import";
import { applyFinanceAssetLegacySyntheticAssets } from "@workspace/finance/server/assets/legacy-synthetic-assets";
import { requireClosingWorkbookActor } from "./closing-workbook-cutover-config";

async function main() {
  const sourcePath = process.argv.find((value) => value.endsWith(".xlsx"));
  const execute = process.argv.includes("--execute");
  const assetOnly = process.argv.includes("--asset-only");
  const assetOutput = option("asset-output");
  const companyCode = option("company");
  const year = Number(option("year"));
  const month = Number(option("month"));
  if (!sourcePath || !companyCode || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("用法: node --import tsx scripts/import/import-closing-workbook.ts <workbook.xlsx> --company=<code> --year=<yyyy> --month=<1-12> [--execute --actor=<username> --asset-gl-config=<config.json>] [--asset-only]");
  }
  const buffer = await fs.readFile(path.resolve(sourcePath));
  const scope = { sourceFile: path.basename(sourcePath), companyCode, year, month };
  const cutoverConfigPath = option("asset-gl-config");
  const cutoverOptions = cutoverConfigPath
    ? await loadApprovedFinanceAssetCutoverConfig(cutoverConfigPath, { companyCode, year, month })
    : null;
  const parseWorkbookForCutover = (workbookBuffer: Buffer, workbookScope: typeof scope) => applyFinanceAssetLegacySyntheticAssets(
    parseAssetWorkbook(workbookBuffer, workbookScope),
    cutoverOptions ? [...getApprovedFinanceAssetLegacySyntheticAssets(cutoverOptions)] : [],
  );
  const parsed = parseWorkbookForCutover(buffer, scope);
  if (assetOutput) {
    await fs.mkdir(path.dirname(path.resolve(assetOutput)), { recursive: true });
    await fs.writeFile(path.resolve(assetOutput), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }
  if (assetOnly && !execute) {
    console.log(JSON.stringify({ mode: "asset-dry-run", readyForImport: parsed.readyForImport, assets: parsed.assets.length, costEvidence: parsed.renovationCostEvidence.length, blockers: parsed.blockers.length, controls: parsed.controls }, null, 2));
    return;
  }
  const inventory = assetOnly ? null : (await import("@workspace/inventory/server/workbook-import")).parseInventoryWorkbook(buffer);
  if (!execute) {
    console.log(JSON.stringify({ mode: "dry-run", assets: parsed.assets.length, costEvidence: parsed.renovationCostEvidence.length, assetControls: parsed.controls, assetBlockers: parsed.blockers, inventoryLines: inventory?.lines.length ?? 0, inventoryChecks: inventory?.checks ?? [] }, null, 2));
    return;
  }
  const actor = requireClosingWorkbookActor(option("actor"));
  const [inventoryModule, { prisma }] = await Promise.all([
    assetOnly ? Promise.resolve(null) : import("@workspace/inventory/server/workbook-import"),
    import("@workspace/platform/server/prisma"),
  ]);
  if (!cutoverOptions) throw new Error("执行资产导入必须提供绝对路径 --asset-gl-config=<0600审批配置.json>");
  const reconcileCutover = createExecutionApprovedFinanceAssetErpGlCutoverReconciler(cutoverOptions, actor);
  try {
    const user = await prisma.user.findUnique({ where: { username: actor }, select: { id: true } });
    if (!user) throw new Error(`资产导入操作者不存在：${actor}`);
    const result = await importAssetWorkbook(
      { buffer, sourceFile: path.basename(sourcePath), companyCode, year, month, userId: user.id },
      { reconcileCutover, parseWorkbook: parseWorkbookForCutover },
    );
    const inventoryResult = inventoryModule
      ? await inventoryModule.importInventoryWorkbook({ buffer, sourceFile: path.basename(sourcePath), companyCode, userId: user.id })
      : null;
    console.log(JSON.stringify({ mode: "execute", assets: result, inventory: inventoryResult }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main();

function option(name: string) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() ?? "";
}
