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

export function isBlankNewContract(row: ContractRow) {
  return Boolean(row.isNew)
    && !row.company
    && !row.insuranceStatus
    && !row.legalRelation
    && !row.contractType
    && !row.employmentForm
    && !row.firstContractStartDate
    && !row.firstContractEndDate
    && !row.secondContractStartDate
    && !row.secondContractEndDate
    && !row.thirdContractStartDate
    && !row.thirdContractEndDate
    && !row.permanentContractDate
    && !row.confidentialityDate
    && !row.nonCompeteDate
    && !row.isPrimary
    && !row.isInsuredHere;
}

export function persistableContractRows(rows: ContractRow[]) {
  return rows.filter((row) => !isBlankNewContract(row));
}
