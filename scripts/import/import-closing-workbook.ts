import fs from "node:fs/promises";
import path from "node:path";
import { parseAssetWorkbook } from "@workspace/finance/server/assets/current-period-workbook";

async function main() {
  const sourcePath = process.argv.find((value) => value.endsWith(".xlsx"));
  const execute = process.argv.includes("--execute");
  const assetOnly = process.argv.includes("--asset-only");
  const assetOutput = option("asset-output");
  const companyCode = option("company");
  const year = Number(option("year"));
  const month = Number(option("month"));
  if (!sourcePath || !companyCode || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("用法: node --import tsx scripts/import/import-closing-workbook.ts <workbook.xlsx> --company=<code> --year=<yyyy> --month=<1-12> [--execute]");
  }
  const buffer = await fs.readFile(path.resolve(sourcePath));
  const scope = { sourceFile: path.basename(sourcePath), companyCode, year, month };
  const parsed = parseAssetWorkbook(buffer, scope);
  if (assetOutput) {
    await fs.mkdir(path.dirname(path.resolve(assetOutput)), { recursive: true });
    await fs.writeFile(path.resolve(assetOutput), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }
  if (assetOnly) {
    console.log(JSON.stringify({ mode: "asset-dry-run", readyForImport: parsed.readyForImport, assets: parsed.assets.length, costEvidence: parsed.renovationCostEvidence.length, blockers: parsed.blockers.length, controls: parsed.controls }, null, 2));
    return;
  }
  const { parseInventoryWorkbook } = await import("@workspace/inventory/server/workbook-import");
  const inventory = parseInventoryWorkbook(buffer);
  if (!execute) {
    console.log(JSON.stringify({ mode: "dry-run", assets: parsed.assets.length, costEvidence: parsed.renovationCostEvidence.length, assetControls: parsed.controls, assetBlockers: parsed.blockers, inventoryLines: inventory.lines.length, inventoryChecks: inventory.checks }, null, 2));
    return;
  }
  const [{ importAssetWorkbook }, { importInventoryWorkbook }, { prisma }] = await Promise.all([
    import("@workspace/finance/server/assets/workbook-import"),
    import("@workspace/inventory/server/workbook-import"),
    import("@workspace/platform/server/prisma"),
  ]);
  try {
    const user = await prisma.user.findUnique({ where: { username: "admin" }, select: { id: true } });
    const result = await importAssetWorkbook({ buffer, sourceFile: path.basename(sourcePath), companyCode, year, month, userId: user?.id });
    const inventoryResult = await importInventoryWorkbook({ buffer, sourceFile: path.basename(sourcePath), companyCode, userId: user?.id });
    console.log(JSON.stringify({ mode: "execute", assets: result, inventory: inventoryResult }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main();

function option(name: string) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() ?? "";
}
