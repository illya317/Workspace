"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/app/hooks/useToast";
import {
  NAME_TO_CODE,
  SHARED_GROUP_CODES,
  resolveCompanyFilter,
} from "@/lib/company";

import type { HRUser as User } from "./types";

interface Employee {
  id: number;
  employeeId: string;
  name: string;
  managementGroup: string | null;
  center: string | null;
  dept1: string | null;
  dept2: string | null;
  position: string | null;
  gender: string | null;
  ethnicity: string | null;
  hometown: string | null;
  politics: string | null;
  education: string | null;
  title: string | null;
  school: string | null;
  major: string | null;
  phone: string | null;
  joinDate: string | null;
  nature: string | null;
  status?: string | null;
  leaveDate?: string | null;
  alias?: string | null;
  deleted?: boolean | null;
  deletedTime?: string | null;
  deletedBy?: string | null;
}

interface CodeItem {
  code: string;
  name: string;
}

const PREFIX_TO_COMPANIES: Record<string, string[]> = {
  "01": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
  "02": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
  "03": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
  "04": ["丰华制药"],
  "05": ["丰华生物", "丰华天力通", "丰华悦通", "加拿大"],
};

export function useCodeTab({
  user,
  type,
  apiPath,
  companyCode,
  selectedCompany,
  departmentCode,
}: {
  user: User;
  type: "department" | "position";
  apiPath: string;
  companyCode: string;
  selectedCompany: string;
  departmentCode?: string;
}) {
  const [codes, setCodes] = useState<CodeItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { toast, showToast, closeToast } = useToast();
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [deleteCode, setDeleteCode] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"code" | "name" | "count">("code");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [editMode, setEditMode] = useState(false);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editCodeValue, setEditCodeValue] = useState("");
  const [editNameValue, setEditNameValue] = useState("");
  const [detailModal, setDetailModal] = useState<{
    open: boolean;
    code: string;
    name: string;
  } | null>(null);
  const [positionDeptModal, setPositionDeptModal] = useState<{
    open: boolean;
    code: string;
    name: string;
    departments: string[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<
    Array<{ version: number; createdAt: string; editor?: { name: string } }>
  >([]);
  const [currentVersion, setCurrentVersion] = useState<number | undefined>(
    undefined
  );

  const entityType =
    type === "department" ? "code_department" : "code_position";

  function buildFullCode(shortCode: string): string {
    const normalized = companyCode
      ? SHARED_GROUP_CODES.includes(companyCode)
        ? "01"
        : companyCode
      : "";
    return normalized ? normalized + shortCode : shortCode;
  }

  async function load() {
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
  }

  useEffect(() => {
    load();
  }, [apiPath, companyCode, selectedCompany, departmentCode]);

  useEffect(() => {
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
    setStats(map);
  }, [codes, employees, type]);

  function toggleSort(field: "code" | "name" | "count") {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  const sortedCodes = [...codes].sort((a, b) => {
    if (sortField === "count") {
      const aVal = stats[a.code] || 0;
      const bVal = stats[b.code] || 0;
      if (aVal !== bVal) return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      return a.code.localeCompare(b.code);
    }
    const aVal = sortField === "code" ? a.code : a.name;
    const bVal = sortField === "code" ? b.code : b.name;
    if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  async function loadVersions(entityId: string) {
    const res = await fetch(
      `/api/admin/edit-history?entityType=${entityType}&entityId=${entityId}`
    );
    if (res.ok) {
      const data = await res.json();
      setVersions(data.versions || []);
    }
  }

  function startEditRow(item: CodeItem) {
    if (!user.canAccessHR) return;
    setEditRow(item.code);
    setEditCodeValue(item.code.length === 5 ? item.code.slice(2) : item.code);
    setEditNameValue(item.name);
    loadVersions(item.code);
  }

  async function saveEditRow(originalCode: string) {
    if (!/^\d{3}$/.test(editCodeValue)) {
      showToast("编号必须为3位数字", "error");
      return;
    }
    const newFullCode = buildFullCode(editCodeValue);

    if (
      newFullCode !== originalCode &&
      codes.some((c) => c.code === newFullCode)
    ) {
      showToast("编号已存在", "error");
      return;
    }

    const putRes = await fetch(apiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: editCodeValue,
        name: editNameValue.trim(),
        companyCode,
        originalCode: newFullCode !== originalCode ? originalCode : undefined,
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({ error: "保存失败" }));
      showToast(err.error || "保存失败", "error");
      setEditRow(null);
      return;
    }
    setCodes((prev) =>
      prev
        .filter((c) => c.code !== originalCode)
        .concat({ code: newFullCode, name: editNameValue.trim() })
        .sort((a, b) => a.code.localeCompare(b.code))
    );
    showToast("保存成功");
    setEditRow(null);
  }

  async function doDelete(code: string) {
    const res = await fetch(`${apiPath}?code=${encodeURIComponent(code)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCodes((prev) => prev.filter((c) => c.code !== code));
      showToast("删除成功");
    } else {
      const err = await res.json().catch(() => ({ error: "删除失败" }));
      showToast(err.error || "删除失败", "error");
    }
  }

  async function handleAdd() {
    if (!/^\d{3}$/.test(newCode)) {
      showToast("编号必须为3位数字", "error");
      return;
    }
    if (!newName.trim()) {
      showToast("名称不能为空", "error");
      return;
    }
    const fullCode = buildFullCode(newCode);
    if (codes.some((c) => c.code === fullCode)) {
      showToast("编号已存在", "error");
      return;
    }
    const body: Record<string, string> = {
      code: newCode,
      name: newName.trim(),
      companyCode,
    };
    if (departmentCode) {
      body.departmentCode = departmentCode;
    }
    const res = await fetch(apiPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setCodes((prev) =>
        [...prev, { code: fullCode, name: newName.trim() }].sort((a, b) =>
          a.code.localeCompare(b.code)
        )
      );
      setNewCode("");
      setNewName("");
      showToast("添加成功");
    } else {
      showToast("添加失败", "error");
    }
  }

  function getDetailList(codeItem: CodeItem): Employee[] {
    if (type === "department") {
      return employees.filter((e) => e.dept1 === codeItem.name);
    }
    return employees.filter(
      (e) => e.position && e.position.includes(codeItem.name)
    );
  }

  async function loadPositionDepts(item: CodeItem) {
    if (type !== "position") {
      setDetailModal({ open: true, code: item.code, name: item.name });
      return;
    }
    const res = await fetch(
      `/api/admin/position-codes?positionCode=${encodeURIComponent(item.code)}`
    );
    if (res.ok) {
      const data = await res.json();
      setPositionDeptModal({
        open: true,
        code: item.code,
        name: item.name,
        departments: data.departments || [],
      });
    }
  }

  async function handleSelectVersion(version: number) {
    if (!editRow) return;
    const res = await fetch(
      `/api/admin/edit-history?entityType=${entityType}&entityId=${editRow}&version=${version}`
    );
    if (res.ok) {
      const data = await res.json();
      const snapshot = JSON.parse(data.version.dataJson);
      setEditCodeValue(snapshot.code || "");
      setEditNameValue(snapshot.name || "");
      setCurrentVersion(version);
    }
  }

  async function handleSave() {
    if (!editRow) return;
    setSaving(true);
    try {
      await saveEditRow(editRow);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  }

  return {
    // state
    codes,
    employees,
    stats,
    loading,
    toast,
    showToast,
    closeToast,
    newCode,
    setNewCode,
    newName,
    setNewName,
    deleteCode,
    setDeleteCode,
    sortField,
    sortDirection,
    editMode,
    setEditMode,
    editRow,
    setEditRow,
    editCodeValue,
    setEditCodeValue,
    editNameValue,
    setEditNameValue,
    detailModal,
    setDetailModal,
    positionDeptModal,
    setPositionDeptModal,
    saving,
    versions,
    currentVersion,
    // computed
    sortedCodes,
    // actions
    toggleSort,
    startEditRow,
    saveEditRow,
    doDelete,
    handleAdd,
    getDetailList,
    loadPositionDepts,
    loadVersions,
    handleSelectVersion,
    handleSave,
  };
}
