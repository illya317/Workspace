import type { ContractRow } from "@workspace/hr/types";

export function normalizeValue(value: unknown) {
  if (value === undefined || value === "") return null;
  return value;
}

export function valuesEqual(left: unknown, right: unknown) {
  return normalizeValue(left) === normalizeValue(right);
}

export function normalizeContractRow<T extends ContractRow>(row: T): T {
  const periodEndDates = [
    row.firstContractEndDate,
    row.secondContractEndDate,
    row.thirdContractEndDate,
  ].filter(Boolean);
  if (!row.endDate || (!row.permanentContractDate && !periodEndDates.includes(row.endDate))) return row;
  return { ...row, endDate: null };
}
