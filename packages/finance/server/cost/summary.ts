import type { CostQueryParams } from "./common";
import { getShipmentSummary } from "./shipments";
import { getSalesSalarySummary } from "./sales-salary";
import { getCostStructureSummary } from "./cost-structure";
import { getWorkshopSummary } from "./workshop";

export async function getCostSummary(params: CostQueryParams) {
  const [shipments, salaries, costStructure, workshop] = await Promise.all([
    getShipmentSummary(params).catch(() => ({
      totalAmount: 0,
      totalReceived: 0,
      totalUnreceived: 0,
      collectionRate: 0,
      topCustomers: [],
      topSalespeople: [],
      topProducts: [],
    })),
    getSalesSalarySummary(params).catch(() => ({
      totalBaseSalary: 0,
      totalBonus: 0,
      totalDeduction: 0,
      totalActualSalary: 0,
    })),
    getCostStructureSummary(params).catch(() => ({
      totalAmount: 0,
      totalQuantity: 0,
      topProducts: [],
      topCategories: [],
      unitCost: 0,
    })),
    getWorkshopSummary(params).catch(() => ({
      totalWorkPoints: 0,
      totalQuantity: 0,
      topProducts: [],
      topPeople: [],
    })),
  ]);

  const grossProfit = shipments.totalAmount - costStructure.totalAmount;
  const grossMargin = shipments.totalAmount > 0 ? grossProfit / shipments.totalAmount : 0;

  return {
    shipments,
    salaries,
    costStructure,
    workshop,
    grossProfit,
    grossMargin,
  };
}
