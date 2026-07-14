"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useRef, useState } from "react";

export interface StatementScopeOption {
  companyCode: string;
  year: number;
}

export function useStatementScope() {
  const [company, setCompany] = useState("02");
  const [year, setYear] = useState(2025);
  const [availablePairs, setAvailablePairs] = useState<StatementScopeOption[]>([]);
  const initializedDefault = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(workspacePath("/api/modules/finance/ledger/periods"))
      .then((response) => response.ok ? response.json() : { periods: [] })
      .then((result) => {
        if (cancelled) return;
        const pairs = new Map<string, StatementScopeOption>();
        for (const period of result.periods as Array<{ companyCode: string | null; year: number }>) {
          if (!period.companyCode) continue;
          pairs.set(`${period.companyCode}:${period.year}`, {
            companyCode: period.companyCode,
            year: period.year,
          });
        }
        const next = [...pairs.values()].sort((left, right) =>
          right.year - left.year || left.companyCode.localeCompare(right.companyCode));
        setAvailablePairs(next);
        if (!initializedDefault.current && next[0]) {
          initializedDefault.current = true;
          setCompany(next[0].companyCode);
          setYear(next[0].year);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return { company, setCompany, year, setYear, availablePairs };
}
