import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { addToMap, rollUpByParent, toSides } from "../server/services/finance/ledger/balance-utils";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "data/dev.db";
const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbPath }) });

async function main() {
  // 模拟 computeBalancesForPeriod 的 Jan 2025 逻辑
  const accounts = await p.financeAccount.findMany({
    where: { companyCode: "01", year: 2025, isActive: true },
    select: { id: true, code: true, parentId: true, balanceDirection: true },
    orderBy: { code: "asc" },
  });
  console.log("Accounts:", accounts.length);

  const items = await p.financeVoucherItem.findMany({
    where: { voucher: { companyCode: "01", status: "posted", period: { year: 2025, month: 1, companyCode: "01" } } },
    include: { account: true },
  });
  console.log("Items:", items.length);

  // Build direct map — same as getMonthlyCurrent
  const direct = new Map<string, { debit: number; credit: number }>();
  for (const item of items) {
    addToMap(direct, item.account.code, item.debit, item.credit);
  }
  console.log("Direct map entries:", direct.size);
  // Show a few
  let shown = 0;
  for (const [code, v] of direct) {
    if (shown < 5) console.log("  direct:", code, "d:", v.debit, "c:", v.credit);
    shown++;
  }

  // Roll up
  const currentMap = rollUpByParent(accounts, direct);
  console.log("Rolled up entries:", currentMap.size);
  // Check key accounts
  for (const code of ["1002", "100209", "224101", "660210"]) {
    const v = currentMap.get(code);
    console.log(`  ${code}: ${v ? `d=${v.debit} c=${v.credit}` : "NOT FOUND"}`);
  }

  // Now check accounts list for matching codes
  const acctSet = new Set(accounts.map(a => a.code));
  console.log("\nDirect codes found in accounts?:");
  let missing = 0;
  for (const code of direct.keys()) {
    if (!acctSet.has(code)) { missing++; if (missing <= 3) console.log("  MISSING:", code); }
  }
  console.log("Missing codes:", missing, "out of", direct.size);

  // Check a specific direct entry: 100209
  const d100209 = direct.get("100209");
  const a100209 = accounts.find(a => a.code === "100209");
  console.log("\n100209 direct:", d100209, "account:", a100209?.id, a100209?.code);

  await p.$disconnect();
}
main();
