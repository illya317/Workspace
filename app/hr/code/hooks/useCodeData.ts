"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { NAME_TO_CODE, resolveCompanyFilter } from "@/lib/company";
import type { Employee, CodeItem } from "../types";

const PREFIX_TO_COMPANIES: Record<string, string[]> = {
  "01": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
  "02": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
  "03": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
  "04": ["丰华制药"],
  "05": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
};

export function useCodeData({
  type,
  apiPath,
  selectedCompany,
  departmentCode,
}: {
  type: "department" | "position";
  apiPath: string;
  companyCode: string;
  selectedCompany: string;
  departmentCode?: string;
}) {
  const [codes, setCodes] = useState<CodeItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const stats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of codes) {
      const prefix = c.code.slice(0, 2);
      const allowedCompanies = PREFIX_TO_COMPANIES[prefix] || [];
      const companyEmps = employees.filter((e) =>
        allowedCompanies.includes(e.company || "")
      );
      if (type === "department") {
        map[c.code] = new Set(
          companyEmps.filter((e) => e.dept1 === c.name).map((e) => e.employeeId)
        ).size;
      } else {
        map[c.code] = new Set(
          companyEmps
            .filter((e) => {
              if (!e.position) return false;
              const positions = e.position.split("、").map((p) => p.trim());
              return positions.includes(c.name);
            })
            .map((e) => e.employeeId)
        ).size;
      }
    }
    return map;
  }, [codes, employees, type]);

  const load = useCallback(async () => {
    setLoading(true);
    const codesParam = selectedCompany
      ? resolveCompanyFilter(selectedCompany)
          .map((n) => NAME_TO_CODE[n] || "")
          .filter(Boolean)
          .join(",")
      : "";
    const params = new URLSearchParams();
    if (codesParam) params.set("companys", codesParam);
    if (departmentCode) params.set("departmentCode", departmentCode);
    const url = params.toString() ? `${apiPath}?${params.toString()}` : apiPath;
    const [codesRes, empRes] = await Promise.all([
      fetch(url),
      fetch(
        `/api/employees?company=${encodeURIComponent(selectedCompany || "")}`
      ),
    ]);
    if (codesRes.ok) {
      const data = await codesRes.json();
      setCodes(data.codes || []);
    }
    if (empRes.ok) {
      const data = await empRes.json();
      setEmployees(data.employees || []);
    }
    setLoading(false);
  }, [apiPath, selectedCompany, departmentCode]);

  useEffect(() => {
    load();
  }, [load]);

  return { codes, setCodes, employees, stats, loading, refresh: load };
}
