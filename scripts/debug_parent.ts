import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

const dbPath = process.env.DATABASE_URL?.replace("file:", "") ?? "data/dev.db";
const p = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbPath }) });

async function main() {
  // Check parent chain for 100209
  const a100209 = await p.financeAccount.findFirst({
    where: { companyCode: "01", code: "100209", year: 2025, isActive: true },
    select: { id: true, code: true, name: true, parentId: true },
  });
  console.log("100209:", a100209);

  if (a100209?.parentId) {
    const parent = await p.financeAccount.findUnique({
      where: { id: a100209.parentId },
      select: { id: true, code: true, name: true, year: true, companyCode: true },
    });
    console.log("Parent:", parent);
  }

  // Check if 1002 exists in the accounts list
  const a1002 = await p.financeAccount.findFirst({
    where: { companyCode: "01", code: "1002", year: 2025, isActive: true },
    select: { id: true, code: true, name: true, parentId: true },
  });
  console.log("1002:", a1002);

  // Let's check ALL 01 accounts that have parentId set
  const withParent = await p.financeAccount.count({
    where: { companyCode: "01", year: 2025, isActive: true, parentId: { not: null } },
  });
  console.log("Accounts with parentId:", withParent, "out of", 817);

  // How many different parent IDs exist?
  const parents = await p.financeAccount.findMany({
    where: { companyCode: "01", year: 2025, isActive: true, parentId: { not: null } },
    select: { parentId: true },
    distinct: ["parentId"],
  });
  console.log("Distinct parentIds:", parents.length);
  // Check first few
  for (const p2 of parents.slice(0, 5)) {
    const pa = await p.financeAccount.findUnique({ where: { id: p2.parentId! }, select: { id: true, code: true, year: true } });
    console.log("  parentId", p2.parentId, "→", pa?.code, "year:", pa?.year);
  }

  await p.$disconnect();
}
main();
