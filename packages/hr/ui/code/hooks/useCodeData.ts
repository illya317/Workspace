"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { workspacePath } from "@workspace/core/routing";
import type { Employee, CodeItem } from "@workspace/hr/types";

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
  const [companies, setCompanies] = useState<Array<{ code: string; name: string; managementGroup: string; codePoolCode: string | null }>>([]);
  const resolvedApiPath = workspacePath(apiPath);

  useEffect(() => {
    fetch(workspacePath("/api/hr/companies?active=1"))
      .then((r) => r.json())
      .then((data) => setCompanies(data.companies || []))
      .catch(() => {});
  }, []);

  const prefixToCompanies = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const c of companies) {
      const pool = c.codePoolCode || c.code;
      if (!result[pool]) result[pool] = [];
      result[pool].push(c.name);
    }
    return result;
  }, [companies]);

  const stats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of codes) {
      const prefix = c.code.slice(0, 2);
      const allowedCompanies = prefixToCompanies[prefix] || [];
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
  }, [codes, employees, type, prefixToCompanies]);

  const load = useCallback(async () => {
    setLoading(true);
    const resolveCodes = (selected: string): string[] => {
      if (selected === "全部") return companies.map((c) => c.code);
      const c = companies.find((x) => x.name === selected);
      if (!c) return [];
      if (c.managementGroup === "GMP") {
        return companies.filter((x) => x.managementGroup === "GMP").map((x) => x.code);
      }
      return companies.filter((x) => x.managementGroup !== "GMP").map((x) => x.code);
    };
    const codesParam = selectedCompany
      ? resolveCodes(selectedCompany).join(",")
      : "";
    const params = new URLSearchParams();
    if (codesParam) params.set("companys", codesParam);
    if (departmentCode) params.set("departmentCode", departmentCode);
    const url = params.toString() ? `${resolvedApiPath}?${params.toString()}` : resolvedApiPath;
    const [codesRes, empRes] = await Promise.all([
      fetch(url),
      fetch(
        workspacePath(`/api/hr/roster?company=${encodeURIComponent(selectedCompany || "")}`)
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
  }, [resolvedApiPath, selectedCompany, departmentCode, companies]);

  useEffect(() => {
    load();
  }, [load]);

  return { codes, setCodes, employees, stats, loading, refresh: load };
}
