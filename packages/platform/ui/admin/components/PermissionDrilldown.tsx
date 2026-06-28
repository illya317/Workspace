"use client";

import { workspacePath } from "@workspace/core/routing";
import { useMemo, useState, useEffect } from "react";
import { matchEmployee } from "@workspace/platform/search";
import { createPanelBlock, PageSurface } from "@workspace/core/ui";
export interface EmployeePerm {
  employeeId: string;
  name: string;
  userId: number | null;
  username: string | null;
  permissions: string[];
  canLogin: boolean;
  hasApiKey: boolean;
  roles: Array<{
    company: string | null;
    dept1: string | null;
    position: string | null;
  }>;
  resourceRoles: Array<{
    resource: {
      key: string;
      name: string;
    } | null;
    role: {
      key: string;
      name: string;
    } | null;
  }>;
}
interface Props {
  drillKey: string;
  empPerms: EmployeePerm[];
  empLoading: boolean;
  fCompany: string;
  fDept: string;
  fKeyword: string;
  setFCompany: (v: string) => void;
  setFDept: (v: string) => void;
  setFKeyword: (v: string) => void;
  allCompanies: string[];
  allDepts: string[];
  onToggle: (emp: EmployeePerm) => void;
  onClose: () => void;
  empHasAccess: (emp: EmployeePerm, key: string) => boolean;
}
export default function PermissionDrilldown({
  drillKey,
  empPerms,
  empLoading,
  fCompany,
  fDept,
  fKeyword,
  setFCompany,
  setFDept,
  setFKeyword,
  allCompanies,
  allDepts,
  onToggle,
  onClose,
  empHasAccess
}: Props) {
  const [companyMap, setCompanyMap] = useState<Map<string, {
    name: string;
    managementGroup: string;
  }>>(new Map());
  useEffect(() => {
    fetch(workspacePath("/api/modules/hr/roster/companies?active=1")).then(r => r.json()).then(data => {
      const map = new Map<string, {
        name: string;
        managementGroup: string;
      }>();
      for (const c of data.companies || []) {
        map.set(c.name, c);
      }
      setCompanyMap(map);
    });
  }, []);
  const filtered = useMemo(() => empPerms.filter(emp => {
    if (fCompany !== "全部") {
      const target = companyMap.get(fCompany);
      if (!target) return false;
      const mgmt = target.managementGroup;
      const allowed = new Set(Array.from(companyMap.values()).filter(c => c.managementGroup === mgmt).map(c => c.name));
      if (!emp.roles.some(r => allowed.has(r.company || ""))) return false;
    }
    if (fDept !== "全部" && !emp.roles.some(r => r.dept1 === fDept)) return false;
    if (fKeyword && !matchEmployee(emp, fKeyword)) return false;
    return true;
  }).sort((a, b) => {
    const aHas = empHasAccess(a, drillKey) ? 0 : 1;
    const bHas = empHasAccess(b, drillKey) ? 0 : 1;
    return aHas - bHas;
  }), [empPerms, fCompany, fDept, fKeyword, drillKey, empHasAccess, companyMap]);
  return (
    <PageSurface
      kind="settings"
      embedded
      blocks={[createPanelBlock("permission-drilldown", {
        title: `人员 · ${drillKey}`,
        actions: [{ key: "close", label: "关闭", onClick: onClose }],
        bodyClassName: "space-y-3",
        blocks: [
          {
            kind: "form",
            key: "filters",
            surface: {
              kind: "inline",
              fields: [
                {
                  key: "company",
                  label: "公司",
                  spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: allCompanies.map((c) => ({ value: c, label: c })) } },
                  value: fCompany,
                  onChange: (nextValue) => {
                    setFCompany(String(nextValue ?? ""));
                    setFDept("全部");
                  },
                  className: "min-w-40",
                },
                {
                  key: "dept",
                  label: "部门",
                  spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: allDepts.map((d) => ({ value: d, label: d })) } },
                  value: fDept,
                  onChange: (nextValue) => setFDept(String(nextValue ?? "")),
                  className: "min-w-40",
                },
                {
                  key: "keyword",
                  label: "搜索",
                  spec: { valueType: "string", control: "text" },
                  value: fKeyword,
                  onChange: (nextValue) => setFKeyword(String(nextValue ?? "")),
                  placeholder: "搜索姓名/工号...",
                  className: "min-w-0 sm:w-[22rem]",
                },
              ],
            },
          },
          {
            kind: "navigation",
            key: "employees",
            surface: {
              kind: "selector",
              selector: {
                framed: false,
                loading: empLoading,
                loadingText: "加载中...",
                items: filtered,
                selectedId: null,
                onSelect: onToggle,
                getKey: emp => emp.employeeId,
                renderItem: emp => ({
                  title: emp.name,
                  subtitle: emp.employeeId,
                  active: empHasAccess(emp, drillKey),
                }),
                contentClassName: "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
              },
            },
          },
        ],
      })]}
      />
  );
}
