import { useState, useCallback } from "react";
import {
  getCurrentPeriod,
  getPeriodOptions,
  getYearOptions,
  getPeriodTypeName,
} from "@workspace/core/period";
import type { PeriodType } from "@workspace/core/period";
import { loadSavedPeriodType, savePeriodType } from "./useReportAuth";

export function useReportPeriod() {
  const [periodType, setPeriodType] = useState<PeriodType>(loadSavedPeriodType() ?? "weekly");
  const ci = getCurrentPeriod(periodType);
  const [selectedYear, setSelectedYear] = useState(ci.year);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(ci.periodIndex);

  const yearOptions = getYearOptions(periodType, selectedYear);
  const periodOptions = getPeriodOptions(periodType, selectedYear);
  const periodTypeName = getPeriodTypeName(periodType);

  const handlePeriodTypeChange = useCallback((pt: PeriodType) => {
    setPeriodType(pt);
    savePeriodType(pt);
    const info = getCurrentPeriod(pt);
    setSelectedYear(info.year);
    setSelectedPeriodIndex(info.periodIndex);
    return { year: info.year, periodIndex: info.periodIndex };
  }, []);

  const handleYearChange = useCallback((year: number) => {
    setSelectedYear(year);
    const pi = periodType === "yearly" ? 1 : selectedPeriodIndex;
    return { year, periodIndex: pi };
  }, [periodType, selectedPeriodIndex]);

  const handlePeriodIndexChange = useCallback((index: number) => {
    setSelectedPeriodIndex(index);
    return { year: selectedYear, periodIndex: index };
  }, [selectedYear]);

  return {
    periodType,
    selectedYear,
    selectedPeriodIndex,
    yearOptions,
    periodOptions,
    periodTypeName,
    handlePeriodTypeChange,
    handleYearChange,
    handlePeriodIndexChange,
  };
}
