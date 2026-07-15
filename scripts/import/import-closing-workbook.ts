import fs from "node:fs/promises";
import path from "node:path";
import { parseAssetWorkbook, importAssetWorkbook } from "@workspace/finance/server/assets/workbook-import";
import { parseInventoryWorkbook, importInventoryWorkbook } from "@workspace/inventory/server/workbook-import";
import { prisma } from "@workspace/platform/server/prisma";

async function main() {
  const sourcePath = process.argv.find((value) => value.endsWith(".xlsx"));
  const execute = process.argv.includes("--execute");
  const companyCode = option("company");
  const year = Number(option("year"));
  const month = Number(option("month"));
  if (!sourcePath || !companyCode || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("用法: npx tsx scripts/import/import-closing-workbook.ts <workbook.xlsx> --company=<code> --year=<yyyy> --month=<1-12> [--execute]");
  }
  const buffer = await fs.readFile(path.resolve(sourcePath));
  const parsed = parseAssetWorkbook(buffer);
  const inventory = parseInventoryWorkbook(buffer);
  if (!execute) {
    console.log(JSON.stringify({ mode: "dry-run", assets: parsed.assets.length, costLines: parsed.renovationCostLines.length, adjustment: parsed.adjustment, assetChecks: parsed.checks, inventoryLines: inventory.lines.length, inventoryChecks: inventory.checks }, null, 2));
    return;
  }
  const user = await prisma.user.findUnique({ where: { username: "admin" }, select: { id: true } });
  const result = await importAssetWorkbook({ buffer, sourceFile: path.basename(sourcePath), companyCode, year, month, userId: user?.id });
  const inventoryResult = await importInventoryWorkbook({ buffer, sourceFile: path.basename(sourcePath), companyCode, userId: user?.id });
  console.log(JSON.stringify({ mode: "execute", assets: result, inventory: inventoryResult }, null, 2));
}

main().finally(() => prisma.$disconnect());

function option(name: string) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() ?? "";
}
