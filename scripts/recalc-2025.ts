import { computeBalancesForPeriod } from "@workspace/finance/server/ledger/balances";
import { prisma } from "@workspace/platform/server/prisma";

async function main() {
  // 天力通 (02) 2025.12 period
  const period = await prisma.financePeriod.findFirst({
    where: { companyCode: "02", year: 2025, month: 12 },
  });
  if (!period) { console.log("period not found"); return; }
  console.log(`Recalculating period ${period.id} (02/2025-12)...`);
  const result = await computeBalancesForPeriod(period.id);
  console.log(`Done: ${result.count} balances`);
  
  // Check 1123
  const b1123 = await prisma.financeAccountBalance.findFirst({
    where: { periodId: period.id, account: { code: "1123" } },
    include: { account: true },
  });
  if (b1123) {
    console.log(`1123 预付账款: opening ${b1123.openingDebit} → current ${b1123.currentDebit} → closing ${b1123.closingDebit - b1123.closingCredit}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
