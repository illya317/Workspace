"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useRef, useState } from "react";

export interface StatementScopeOption {
  companyCode: string;
  year: number;
}

export function useStatementScope(allowedCompanyCodes?: string[]) {
  const [company, setCompany] = useState("02");
  const [year, setYear] = useState(2025);
  const [availablePairs, setAvailablePairs] = useState<StatementScopeOption[]>([]);
  const initializedScope = useRef("");
  const allowedKey = allowedCompanyCodes?.join(",") ?? "*";

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
        const allowed = allowedCompanyCodes ? new Set(allowedCompanyCodes) : null;
        const next = [...pairs.values()].filter((pair) => !allowed || allowed.has(pair.companyCode)).sort((left, right) =>
          right.year - left.year || left.companyCode.localeCompare(right.companyCode));
        setAvailablePairs(next);
        if (initializedScope.current !== allowedKey && next[0]) {
          initializedScope.current = allowedKey;
          setCompany(next[0].companyCode);
          setYear(next[0].year);
        } else if (next.length === 0) {
          setCompany("");
        }
      });
    return () => { cancelled = true; };
  }, [allowedCompanyCodes, allowedKey]);

  return { company, setCompany, year, setYear, availablePairs };
}
