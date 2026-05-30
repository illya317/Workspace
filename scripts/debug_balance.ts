import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { computeBalancesForPeriod } from "../server/services/finance/ledger/balances";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "data/dev.db";
const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbPath }) });

async function main() {
  // 1. 直接查凭证 —— 绕过 Prisma 嵌套 filter，看原始数据
  console.log("=== 1. Raw voucher count ===");
  const period = await p.financePeriod.findFirst({ where: { companyCode: "01", year: 2025, month: 1 } });
  console.log("Period Jan 2025 id:", period?.id, "companyCode:", period?.companyCode);

  const vouchers = await p.financeVoucher.findMany({
    where: { companyCode: "01", status: "posted", periodId: period?.id },
    take: 2,
    include: { items: { include: { account: true }, take: 1 } },
  });
  console.log("Vouchers in Jan 2025:", vouchers.length);
  if (vouchers[0]) console.log("  v:", vouchers[0].voucherNo, "items:", vouchers[0].items.length, "account:", vouchers[0].items[0]?.account?.code);

  // 2. Prisma 嵌套 filter —— 模拟 getMonthlyCurrent
  console.log("\n=== 2. Nested filter (getMonthlyCurrent) ===");
  const items = await p.financeVoucherItem.findMany({
    where: {
      voucher: {
        companyCode: "01",
        status: "posted",
        period: { year: 2025, month: 1, companyCode: "01" },
      },
    },
    include: { account: true },
    take: 3,
  });
  console.log("Items via nested filter:", items.length);
  if (items[0]) console.log("  account:", items[0].account.code, "debit:", items[0].debit, "credit:", items[0].credit);

  // 3. Prisma 嵌套 filter (without period.companyCode)  
  console.log("\n=== 3. Nested filter (no period companyCode) ===");
  const items2 = await p.financeVoucherItem.findMany({
    where: {
      voucher: {
        companyCode: "01",
        status: "posted",
        period: { year: 2025, month: 1 },
      },
    },
    include: { account: true },
    take: 3,
  });
  console.log("Items via nested filter (no p.cc):", items2.length);
  if (items2[0]) console.log("  account:", items2[0].account.code, "debit:", items2[0].debit);

  // 4. Direct SQL equivalent
  console.log("\n=== 4. Direct SQL ===");
  const result = await p.$queryRaw`SELECT COUNT(*) as cnt FROM FinanceVoucherItem vi 
    JOIN FinanceVoucher v ON vi.voucherId = v.id 
    JOIN FinancePeriod p2 ON v.periodId = p2.id 
    WHERE v.companyCode = '01' AND v.status = 'posted' 
    AND p2.year = 2025 AND p2.month = 1 AND p2.companyCode = '01'`;
  console.log("SQL count:", result);

  // 5. Try computing Jan 2025 balance
  console.log("\n=== 5. Compute Jan 2025 ===");
  try {
    const r = await computeBalancesForPeriod(period!.id);
    console.log("computeBalancesForPeriod result:", JSON.stringify(r));
  } catch (e: any) {
    console.error("Error:", e.message);
  }

  // 6. Check Jan balance after compute
  console.log("\n=== 6. Jan 2025 balance after compute ===");
  const bals = await p.financeAccountBalance.findMany({
    where: { periodId: period!.id },
    include: { account: true },
    take: 5,
  });
  for (const b of bals) console.log("  ", b.account.code, b.account.name, "curD", b.currentDebit, "curC", b.currentCredit);

  await p.$disconnect();
}
main();
