import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { parseBalanceSheet } from "@workspace/finance/server/import/parsers/balance-parser";
import * as fs from "fs";
import * as path from "path";

const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "data/dev.db" }) });

async function main() {
  const filePath = path.join("prisma/seed-data/财务数据/丰华悦通/丰华悦通/余额表-丰华悦通 2025.xlsx");
  const buffer = fs.readFileSync(filePath);
  const preview = parseBalanceSheet(buffer, "03", ".xlsx");
  
  const systemCodes = new Set(
    (await p.financeAccount.findMany({
      where: { companyCode: "03", year: 2025 },
      select: { code: true },
    })).map(a => a.code)
  );
  
  const missing = (preview.balances || []).filter(b => !systemCodes.has(b.accountCode));
  console.log("03 缺失科目:");
  for (const m of missing) {
    console.log(`  ${m.accountCode} ${m.accountName}`);
    console.log(`    期初 借:${m.openingDebit} 贷:${m.openingCredit}`);
    console.log(`    本期 借:${m.currentDebit} 贷:${m.currentCredit}`);
    console.log(`    期末 借:${m.closingDebit} 贷:${m.closingCredit}`);
  }
  
  await p.$disconnect();
}
main();
