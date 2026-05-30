import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { parseBalanceSheet } from "../server/services/finance/import/parsers/balance-parser";
import * as fs from "fs";
import * as path from "path";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "data/dev.db";
const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbPath }) });

async function main() {
  const filePath = path.join("prisma/seed-data/财务数据/加拿大/余额表-加拿大2025.xls");
  const buffer = fs.readFileSync(filePath);
  const preview = parseBalanceSheet(buffer, "05", ".xls");
  
  console.log("Excel科目数:", preview.balances?.length);
  
  const systemCodes = new Set(
    (await p.financeAccount.findMany({
      where: { companyCode: "05", year: 2025 },
      select: { code: true },
    })).map(a => a.code)
  );
  console.log("系统科目数:", systemCodes.size);
  
  const missing = (preview.balances || []).filter(b => !systemCodes.has(b.accountCode));
  console.log("\n缺失的科目:");
  for (const m of missing) {
    console.log(`  ${m.accountCode} ${m.accountName}`);
  }
  
  // Check if these codes exist for other years or companies
  console.log("\n是否存在于其他年份/公司:");
  for (const m of missing) {
    const others = await p.financeAccount.findMany({
      where: { code: m.accountCode },
      select: { code: true, name: true, companyCode: true, year: true },
    });
    if (others.length > 0) {
      console.log(`  ${m.accountCode}: 存在于 ${others.map(o => `${o.companyCode}/${o.year}`).join(", ")}`);
    } else {
      console.log(`  ${m.accountCode}: 完全不存在于任何公司`);
    }
  }
  
  await p.$disconnect();
}
main();
