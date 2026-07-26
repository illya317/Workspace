export type InventoryCostEntry = { signedQuantity: number; unitCost: number | null };

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateInventoryValue(entries: InventoryCostEntry[]) {
  return money(entries.reduce((sum, entry) => sum + entry.signedQuantity * Number(entry.unitCost ?? 0), 0));
}

export function calculateIssueCost(entries: InventoryCostEntry[]) {
  return money(Math.abs(entries.filter((entry) => entry.signedQuantity < 0).reduce((sum, entry) => sum + entry.signedQuantity * Number(entry.unitCost ?? 0), 0)));
}

export function calculateMovingWeightedAverage(entries: InventoryCostEntry[]) {
  const onHand = entries.reduce((sum, entry) => sum + entry.signedQuantity, 0);
  if (onHand <= 0) return 0;
  return money(entries.reduce((sum, entry) => sum + entry.signedQuantity * Number(entry.unitCost ?? 0), 0) / onHand);
}
