"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// ─── Types ─────────────────────────────────────────────────

export interface CompanyYearOption {
  companyCode: string;
  year: number;
}

interface StatementConfigCtx {
  /** Currently selected company code. */
  company: string;
  setCompany: (v: string) => void;
  /** Currently selected year (string for FinanceFilters compat). */
  year: string;
  setYear: (v: string) => void;
  /** Combined setter — both change together (year requires re-aggregation). */
  setCompanyYear: (c: string, y: string) => void;
  /** Distinct company codes present in FinancePeriod (sorted). */
  companies: string[];
  /** All distinct (companyCode, year) pairs present in FinancePeriod. */
  availablePairs: CompanyYearOption[];
  /** True while the initial defaults are being resolved. */
  loading: boolean;
}

// ─── Context ───────────────────────────────────────────────

const Ctx = createContext<StatementConfigCtx | null>(null);

export function StatementConfigProvider({ children }: { children: ReactNode }) {
  const [company, setCompanyState] = useState("02");
  const [year, setYearState] = useState("2025");
  const [pairs, setPairs] = useState<CompanyYearOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch periods to derive available companies + (company, year) pairs
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/finance/periods");
        if (!res.ok) return;
        const d = await res.json();
        const seen = new Map<string, CompanyYearOption>();
        for (const p of d.periods as { companyCode: string | null; year: number }[]) {
          if (!p.companyCode) continue;
          const k = `${p.companyCode}:${p.year}`;
          if (!seen.has(k)) seen.set(k, { companyCode: p.companyCode, year: p.year });
        }
        if (cancelled) return;
        const next = [...seen.values()].sort((a, b) =>
          a.year === b.year
            ? a.companyCode.localeCompare(b.companyCode)
            : b.year - a.year,
        );
        setPairs(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Default to the latest year that has data, when the initial fetch lands.
  // The pick: latest (companyCode, year) overall. Avoids the legacy hardcoded
  // 02/2025 default that ignored periods entirely.
  useEffect(() => {
    if (loading || pairs.length === 0) return;
    const latest = pairs[0]; // already sorted year desc
    setCompanyState(latest.companyCode);
    setYearState(String(latest.year));
    // We only want this to run once after initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const companies = useMemo(
    () => [...new Set(pairs.map((p) => p.companyCode))].sort(),
    [pairs],
  );

  const value: StatementConfigCtx = {
    company, setCompany: setCompanyState,
    year, setYear: setYearState,
    setCompanyYear: (c, y) => { setCompanyState(c); setYearState(y); },
    companies, availablePairs: pairs,
    loading,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStatementConfig(): StatementConfigCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStatementConfig must be used within StatementConfigProvider");
  return v;
}
