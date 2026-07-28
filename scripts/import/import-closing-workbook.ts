import fs from "node:fs/promises";
import path from "node:path";
import { parseInventoryWorkbook, importInventoryWorkbook } from "@workspace/inventory/server/workbook-import";
import { prisma } from "@workspace/platform/server/prisma";

async function main() {
  const sourcePath = process.argv.find((value) => value.endsWith(".xlsx"));
  const execute = process.argv.includes("--execute");
  const companyCode = option("company");
  if (!sourcePath || !companyCode) {
    throw new Error("用法: node --import tsx scripts/import/import-closing-workbook.ts <workbook.xlsx> --company=<code> [--execute]");
  }
  const buffer = await fs.readFile(path.resolve(sourcePath));
  const inventory = parseInventoryWorkbook(buffer);
  if (!execute) {
    console.log(JSON.stringify({ mode: "dry-run", inventoryLines: inventory.lines.length, inventoryChecks: inventory.checks }, null, 2));
    return;
  }
  const user = await prisma.user.findUnique({ where: { username: "admin" }, select: { id: true } });
  const inventoryResult = await importInventoryWorkbook({ buffer, sourceFile: path.basename(sourcePath), companyCode, userId: user?.id });
  console.log(JSON.stringify({ mode: "execute", inventory: inventoryResult }, null, 2));
}

main().finally(() => prisma.$disconnect());

function option(name: string) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() ?? "";
}
