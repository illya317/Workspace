import type { CostQueryParams } from "./common";
import { getShipmentSummary } from "./shipments";
import { getSalesSalarySummary } from "./sales-salary";
import { getCostStructureSummary } from "./cost-structure";

export async function getCostSummary(params: CostQueryParams) {
  const [shipments, salaries, costStructure] = await Promise.all([
    getShipmentSummary(params),
    getSalesSalarySummary(params),
    getCostStructureSummary(params),
  ]);

  const grossProfit = shipments.totalAmount - costStructure.totalAmount;
  const grossMargin = shipments.totalAmount > 0 ? grossProfit / shipments.totalAmount : 0;

  return {
    shipments,
    salaries,
    costStructure,
    grossProfit,
    grossMargin,
  };
}
