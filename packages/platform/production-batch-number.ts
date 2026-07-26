export const PRODUCTION_BATCH_NUMBER_MESSAGE = "批号必须是202xMMDD格式的有效日期";

export function normalizeProductionBatchNumberInput(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 8);
}

export function isProductionBatchNumber(value: unknown) {
  const text = String(value ?? "").trim();
  if (!/^202\d{5}$/.test(text)) return false;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
