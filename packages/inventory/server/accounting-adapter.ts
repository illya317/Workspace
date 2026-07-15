import type { InventoryAccountingContract } from "@workspace/platform/contracts/inventory-accounting";
import { prisma } from "@workspace/platform/server/prisma";
import { calculateInventoryValue, calculateIssueCost } from "./calculator";
import { buildLinkInventoryVoucherCommand } from "./domain/inventory-validation";

export const inventoryAccountingAdapter: InventoryAccountingContract = {
  async getValuationSnapshot(scope) {
    const endDate = `${scope.year}-${String(scope.month).padStart(2, "0")}-31`;
    const rows = await prisma.inventoryLedgerEntry.findMany({ where: { companyCode: scope.companyCode, movementDate: { lte: endDate } }, select: { signedQuantity: true, unitCost: true } });
    return {
      ...scope,
      onHandQuantity: quantity(rows.reduce((sum, row) => sum + Number(row.signedQuantity), 0)),
      inventoryValue: calculateInventoryValue(rows.map((row) => ({ signedQuantity: Number(row.signedQuantity), unitCost: row.unitCost == null ? null : Number(row.unitCost) }))),
    };
  },
  async getPostingProposal(scope) {
    const startDate = `${scope.year}-${String(scope.month).padStart(2, "0")}-01`;
    const endDate = `${scope.year}-${String(scope.month).padStart(2, "0")}-31`;
    const issues = await prisma.inventoryLedgerEntry.findMany({
      where: { companyCode: scope.companyCode, movementDate: { gte: startDate, lte: endDate }, signedQuantity: { lt: 0 } },
      select: { signedQuantity: true, unitCost: true },
    });
    const issueCost = calculateIssueCost(issues.map((row) => ({ signedQuantity: Number(row.signedQuantity), unitCost: row.unitCost == null ? null : Number(row.unitCost) })));
    return issueCost === 0 ? [] : [
      { accountCode: "6401", direction: "debit", amount: issueCost, description: `${scope.year}年${scope.month}月发出存货成本` },
      { accountCode: "1405", direction: "credit", amount: issueCost, description: `${scope.year}年${scope.month}月存货成本结转` },
    ];
  },
  async linkVoucher(scope, voucherId, userId) {
    const command = buildLinkInventoryVoucherCommand({ ...scope, voucherId }, userId);
    if (!command.ok) throw new Error(command.issue.message);
    scope = { companyCode: command.data.companyCode, year: command.data.year, month: command.data.month };
    voucherId = command.data.voucherId;
    await prisma.inventoryPeriodClose.upsert({
      where: { companyCode_year_month: scope },
      create: { ...scope, status: "closed", voucherId, lockedBy: userId, lockedAt: new Date() },
      update: { status: "closed", voucherId, lockedBy: userId, lockedAt: new Date(), unlockedBy: null, unlockedAt: null },
    });
  },
};

function quantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
