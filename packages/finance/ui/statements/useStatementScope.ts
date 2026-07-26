"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  adjacentAvailableFinancePeriod,
  latestAvailableFinancePeriod,
} from "./finance-period-dataset";
import { useFinancePeriodDataset } from "./useFinancePeriodDataset";

export interface StatementScopeOption {
  companyCode: string;
  year: number;
  month: number;
}

export function useStatementScope(allowedCompanyCodes?: string[]) {
  const availablePairs = useFinancePeriodDataset(allowedCompanyCodes);
  const [company, setCompanyValue] = useState("");
  const [year, setYearValue] = useState(new Date().getFullYear());
  const [month, setMonthValue] = useState(new Date().getMonth() + 1);
  const initializedScope = useRef("");
  const allowedKey = allowedCompanyCodes?.join(",") ?? "*";

  useEffect(() => {
    if (availablePairs.length === 0) return;
    if (initializedScope.current === allowedKey) return;
    initializedScope.current = allowedKey;
    const initial = latestAvailableFinancePeriod(availablePairs);
    if (!initial) return;
    setCompanyValue(initial.companyCode);
    setYearValue(initial.year);
    setMonthValue(initial.month);
  }, [allowedKey, availablePairs]);

  const setCompany = useCallback((nextCompany: string) => {
    setCompanyValue(nextCompany);
    const next = latestAvailableFinancePeriod(availablePairs.filter((period) => period.companyCode === nextCompany));
    if (!next) return;
    setYearValue(next.year);
    setMonthValue(next.month);
  }, [availablePairs]);

  const setPeriod = useCallback((nextYear: number, nextMonth: number) => {
    if (!availablePairs.some((period) => (
      period.companyCode === company && period.year === nextYear && period.month === nextMonth
    ))) return;
    setYearValue(nextYear);
    setMonthValue(nextMonth);
  }, [availablePairs, company]);

  const setYear = useCallback((nextYear: number) => {
    const candidates = availablePairs.filter((period) => period.companyCode === company && period.year === nextYear);
    const next = candidates.find((period) => period.month === month) ?? candidates[0];
    if (next) setPeriod(next.year, next.month);
  }, [availablePairs, company, month, setPeriod]);

  const setMonth = useCallback((nextMonth: number) => setPeriod(year, nextMonth), [setPeriod, year]);

  const shiftPeriod = useCallback((delta: -1 | 1) => {
    const next = adjacentAvailableFinancePeriod(
      availablePairs.filter((period) => period.companyCode === company),
      { year, month },
      delta,
    );
    if (next) setPeriod(next.year, next.month);
  }, [availablePairs, company, month, setPeriod, year]);

  return { company, setCompany, year, setYear, month, setMonth, setPeriod, shiftPeriod, availablePairs };
}
