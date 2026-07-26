import type { ReadableBatchSpec } from "../../packages/finance/server/import/readable/types";
import { loadTenantFinanceImports } from "../lib/tenant-config";

function expandSourceSeries(): ReadableBatchSpec[] {
  return loadTenantFinanceImports().readableSourceSeries.flatMap((series) => {
    const years = Array.from(
      { length: series.endYear - series.startYear + 1 },
      (_, index) => series.startYear + index,
    );
    if (series.sourceSystem === "T6" && !series.sourceLedger) {
      throw new Error(`T6 readable source ${series.companyCode} requires sourceLedger`);
    }
    if (series.sourceSystem === "TPLUS" && !series.sourceDatabase) {
      throw new Error(`TPLUS readable source ${series.companyCode} requires sourceDatabase`);
    }
    return years.map((year): ReadableBatchSpec => {
      const sourceLedger = series.sourceSystem === "T6" ? series.sourceLedger! : series.sourceDatabase!;
      return {
        companyCode: series.companyCode,
        companyName: series.companyName,
        year,
        sourceSystem: series.sourceSystem,
        sourceLedger,
        sourceDatabase: series.sourceSystem === "T6"
          ? `UFDATA_${sourceLedger}_${year}`
          : series.sourceDatabase!,
        mappingMode: series.mappingMode,
        mappingStartYear: series.startYear,
        mappingEndYear: series.mappingMode === "historical" ? series.endYear : undefined,
        continuationOf: series.continuationOf,
        includeCurrentOpenItems: series.mappingMode === "historical" && year === series.endYear,
      };
    });
  });
}

export const FINANCE_READABLE_BATCHES: ReadableBatchSpec[] = expandSourceSeries()
  .sort((left, right) => left.companyCode.localeCompare(right.companyCode) || left.year - right.year);

export function selectReadableBatches(companyCode?: string, year?: number): ReadableBatchSpec[] {
  return FINANCE_READABLE_BATCHES.filter((item) => (
    (!companyCode || item.companyCode === companyCode) && (!year || item.year === year)
  ));
}
