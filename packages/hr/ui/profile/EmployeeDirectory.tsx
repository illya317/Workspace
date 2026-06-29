"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPageBody,
  type DataSurfaceColumnSpec,
  createMessageSection,
  PageSurface,
  type PageSurfaceSectionSpec,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { buildHRToolbarItems } from "../components/hr-toolbar-items";
import { HR_REFERENCE_OPTIONS_ENDPOINT } from "../fk-keys";
import type { HRUser } from "@workspace/hr/types";
import type { RosterSurfaceNavigationProps } from "../roster-surface";
import {
  EMPLOYEE_DIRECTORY_DEFAULT_VISIBLE_COLUMNS,
  EMPLOYEE_DIRECTORY_FILTER_FIELDS,
  EMPLOYEE_DIRECTORY_FILTER_VALUE_OPTIONS,
  EMPLOYEE_DIRECTORY_PAGE_SIZE_OPTIONS,
} from "./employee-directory-config";

interface DirectoryEmployee {
  id: number;
  employeeId: string;
  name: string;
  gender: boolean | null;
  birthDate: string | null;
  education: string | null;
  positionName: string | null;
  directDepartmentName: string | null;
}

interface EmployeeListResponse {
  employees: DirectoryEmployee[];
  total: number;
}

function genderLabel(value: boolean | null) {
  if (value === true) return "男";
  if (value === false) return "女";
  return "-";
}

export default function EmployeeDirectory({
  employmentStatus,
  surface,
}: {
  user: HRUser;
  employmentStatus?: "active" | "inactive";
  surface?: RosterSurfaceNavigationProps;
}) {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [employees, setEmployees] = useState<DirectoryEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<string[]>(EMPLOYEE_DIRECTORY_DEFAULT_VISIBLE_COLUMNS);

  const [pageSize, setPageSize] = useState(50);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const columns = useMemo<DataSurfaceColumnSpec<DirectoryEmployee>[]>(
    () => [
      {
        key: "employeeId",
        label: "员工编号",
        required: true,
        cell: (employee) => <span className="font-medium text-slate-900">{employee.employeeId}</span>,
      },
      { key: "name", label: "姓名", required: true, cell: (employee) => employee.name },
      { key: "gender", label: "性别", defaultVisible: true, cell: (employee) => genderLabel(employee.gender) },
      { key: "birthDate", label: "出生年月", defaultVisible: true, cell: (employee) => employee.birthDate || "-" },
      { key: "education", label: "学历", defaultVisible: true, cell: (employee) => employee.education || "-" },
      { key: "positionName", label: "岗位", defaultVisible: true, cell: (employee) => employee.positionName || "-" },
      {
        key: "directDepartmentName",
        label: "直属部门",
        defaultVisible: true,
        cell: (employee) => employee.directDepartmentName || "-",
      },

    ],
    []
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (keyword) params.set("keyword", keyword);
      if (employmentStatus) params.set("employmentStatus", employmentStatus);
      if (filterField && filterValue) {
        params.set("filterField", filterField);
        params.set("filterValue", filterValue);
      }
      try {
        const res = await fetch(workspacePath(`/api/modules/hr/roster/employees?${params.toString()}`));
        if (!res.ok) throw new Error(`加载失败 (${res.status})`);
        const data = (await res.json()) as EmployeeListResponse;
        if (!cancelled) {
          setEmployees(data.employees || []);
          setTotal(data.total || 0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [employmentStatus, filterField, filterValue, keyword, page, pageSize]);

  const toolbarItems = buildHRToolbarItems({
    search: {
      value: keyword,
      onChange: (value: string) => {
        setKeyword(value.trim());
        setPage(1);
      },
      placeholder: "搜索员工编号、姓名、拼音",
      ariaLabel: "搜索员工编号、姓名、拼音",
    },
    advancedFilter: {
      fields: EMPLOYEE_DIRECTORY_FILTER_FIELDS,
      valueOptions: EMPLOYEE_DIRECTORY_FILTER_VALUE_OPTIONS,
      referenceEndpoint: HR_REFERENCE_OPTIONS_ENDPOINT,
      fieldKey: filterField,
      onFieldKeyChange: (key: string) => {
        setFilterField(key);
        setPage(1);
      },
      value: filterValue,
      onValueChange: (value: string) => {
        setFilterValue(value);
        setPage(1);
      },
    },
    reset: {
      onClick: () => {
        setKeyword("");
        setFilterField("");
        setFilterValue("");
        setVisibleColumns(EMPLOYEE_DIRECTORY_DEFAULT_VISIBLE_COLUMNS);
        setPage(1);
      },
    },
    columnToggle: { columns, visible: visibleColumns, onChange: setVisibleColumns },
    meta: <span>共 {total} 人</span>,
    pageSize: {
      value: String(pageSize),
      options: EMPLOYEE_DIRECTORY_PAGE_SIZE_OPTIONS,
      onChange: (value: string) => {
        setPageSize(Number(value));
        setPage(1);
      },
    },
  });

  const sections: PageSurfaceSectionSpec[] = [
    ...(error ? [createMessageSection("error", { content: error, tone: "danger" as const })] : []),
    {
      kind: "data",
      key: "employees",
      surface: {
        kind: "table",
        framed: true,
        rows: employees,
        columns,
        visibleColumns,
        loading,
        emptyText: "暂无员工",
        rowKey: (employee: DirectoryEmployee) => employee.id,
        onRowClick: (employee: DirectoryEmployee) => router.push(`/hr/roster/employees/${employee.employeeId}`),
        rowActions: (employee: DirectoryEmployee) => [
          {
            key: "view",
            label: "查看员工资料",
            kind: "view",
            onClick: () => router.push(`/hr/roster/employees/${employee.employeeId}`),
          },
        ],

      },
    },
  ];

  const footer = {
    pagination: {
      page,
      totalPages,
      total,
      onPageChange: setPage,
      frame: "bordered",
      compact: true,
    },
  };

  return (
    <PageSurface kind="standard"
      {...(surface ?? { embedded: true })}
      toolbar={{ items: toolbarItems }}
      body={createPageBody(sections)}
      footer={footer}
    />
  );
}
