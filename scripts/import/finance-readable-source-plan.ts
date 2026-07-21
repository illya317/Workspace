import type { ReadableBatchSpec } from "../../packages/finance/server/import/readable/types";

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function t6(companyCode: string, companyName: string, ledger: string, years: number[]): ReadableBatchSpec[] {
  const mappingStartYear = Math.min(...years);
  return years.map((year) => ({
    companyCode,
    companyName,
    year,
    sourceSystem: "T6",
    sourceLedger: ledger,
    sourceDatabase: `UFDATA_${ledger}_${year}`,
    mappingMode: "recurring",
    mappingStartYear,
  }));
}

function tplus(
  companyCode: string,
  companyName: string,
  database: string,
  years: number[],
  continuationOf: string,
): ReadableBatchSpec[] {
  const mappingStartYear = Math.min(...years);
  const lastYear = Math.max(...years);
  return years.map((year) => ({
    companyCode,
    companyName,
    year,
    sourceSystem: "TPLUS",
    sourceLedger: database,
    sourceDatabase: database,
    mappingMode: "historical",
    mappingStartYear,
    mappingEndYear: lastYear,
    continuationOf,
    includeCurrentOpenItems: year === lastYear,
  }));
}

export const FINANCE_READABLE_BATCHES: ReadableBatchSpec[] = [
  ...t6("01", "丰华生物", "001", range(2016, 2026)),
  ...t6("02", "丰华天力通", "007", range(2020, 2026)),
  ...tplus("03", "丰华悦通", "UFTData229584_000001", range(2019, 2025), "T6/016"),
  ...t6("03", "丰华悦通", "016", [2026]),
  ...tplus("05", "加拿大", "UFTData836718_000002", range(2020, 2021), "T6/014"),
  ...t6("05", "加拿大", "014", range(2022, 2026)),
  ...t6("06", "上海悦通", "006", range(2018, 2026)),
].sort((left, right) => left.companyCode.localeCompare(right.companyCode) || left.year - right.year);

export function selectReadableBatches(companyCode?: string, year?: number): ReadableBatchSpec[] {
  return FINANCE_READABLE_BATCHES.filter((item) => (
    (!companyCode || item.companyCode === companyCode) && (!year || item.year === year)
  ));
}
