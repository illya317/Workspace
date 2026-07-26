"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState } from "react";

import {
  normalizeFinancePeriodOptions,
  type FinancePeriodOption,
} from "./finance-period-dataset";

export function useFinancePeriodDataset(allowedCompanyCodes?: readonly string[]) {
  const [periods, setPeriods] = useState<FinancePeriodOption[]>([]);
  const allowedKey = allowedCompanyCodes?.join(",") ?? "*";

  useEffect(() => {
    let cancelled = false;
    void fetch(workspacePath("/api/modules/finance/ledger/periods"))
      .then((response) => response.ok ? response.json() : { periods: [] })
      .then((result) => {
        if (cancelled) return;
        setPeriods(normalizeFinancePeriodOptions(
          result.periods as Array<{ companyCode: string | null; year: number; month: number }>,
          allowedKey === "*" ? undefined : allowedKey.split(","),
        ));
      });
    return () => { cancelled = true; };
  }, [allowedKey]);

  return periods;
}
