"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DataTable,
  EmptyStateCard,
  FormField,
  CreatePanel,
  InputControl,
  PanelCard,
  Pagination,
  Toolbar,
  type DataTableColumn,
  type SelectFieldOption,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
import { buildHRToolbarItems } from "../components/hr-toolbar-items";
import { HR_EDUCATIONS } from "@workspace/hr/constants";
import { hrCanEdit, type HRUser } from "@workspace/hr/types";

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

const pageSizeOptions = [20, 50, 100, 200].map((size) => ({
  value: String(size),
  label: `${size}条/页`,
}));
const directoryFilterFields = [
  { value: "gender", label: "性别" },
  { value: "education", label: "学历" },
  { value: "positionName", label: "岗位" },
  { value: "directDepartmentName", label: "直属部门" },
];
const directoryFilterValueOptions: Record<string, SelectFieldOption[]> = {
  gender: [
    { value: "男", label: "男" },
    { value: "女", label: "女" },
  ],
  education: HR_EDUCATIONS.map((item) => ({ value: item, label: item })),
};
const defaultVisibleColumns = [
  "employeeId",
  "name",
  "gender",
  "birthDate",
  "education",
  "positionName",
  "directDepartmentName",
];

function genderLabel(value: boolean | null) {
  if (value === true) return "男";
  if (value === false) return "女";
  return "-";
}

export default function EmployeeDirectory({
  user,
  employmentStatus,
}: {
  user: HRUser;
  employmentStatus?: "active" | "inactive";
}) {
  const router = useRouter();
  const canEdit = hrCanEdit(user);
  const [keyword, setKeyword] = useState("");
  const [employees, setEmployees] = useState<DirectoryEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [filterField, setFilterField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);

  const [pageSize, setPageSize] = useState(50);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const columns = useMemo<DataTableColumn<DirectoryEmployee>[]>(
    () => [
      {
        key: "employeeId",
        label: "员工编号",
        required: true,
        render: (employee) => <span className="font-medium text-slate-900">{employee.employeeId}</span>,
      },
      { key: "name", label: "姓名", required: true, render: (employee) => employee.name },
      { key: "gender", label: "性别", defaultVisible: true, render: (employee) => genderLabel(employee.gender) },
      { key: "birthDate", label: "出生年月", defaultVisible: true, render: (employee) => employee.birthDate || "-" },
      { key: "education", label: "学历", defaultVisible: true, render: (employee) => employee.education || "-" },
      { key: "positionName", label: "岗位", defaultVisible: true, render: (employee) => employee.positionName || "-" },
      {
        key: "directDepartmentName",
        label: "直属部门",
        defaultVisible: true,
        render: (employee) => employee.directDepartmentName || "-",
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

  async function createEmployee() {
    if (!newEmployeeName.trim()) {
      setError("姓名必填");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(workspacePath("/api/modules/hr/roster/employees"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newEmployeeName.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `新建失败 (${res.status})`);
      const employeeId = data.employee?.employeeId as string | undefined;
      setNewEmployeeName("");
      setCreateOpen(false);
      if (employeeId) router.push(`/hr/roster/employees/${employeeId}`);
      else {
        setKeyword("");
        setPage(1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "新建失败");
    } finally {
      setCreating(false);
    }
  }

  const toolbarItems = buildHRToolbarItems({
    create: canEdit
      ? {
          label: "新建员工资料",
          active: createOpen,
          disabled: creating,
          onClick: () => setCreateOpen((open) => !open),
        }
      : undefined,
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
      fields: directoryFilterFields,
      valueOptions: directoryFilterValueOptions,
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
        setVisibleColumns(defaultVisibleColumns);
        setPage(1);
      },
    },
    columnToggle: { columns, visible: visibleColumns, onChange: setVisibleColumns },
    meta: <span>共 {total} 人</span>,
    pageSize: {
      value: String(pageSize),
      options: pageSizeOptions,
      onChange: (value: string) => {
        setPageSize(Number(value));
        setPage(1);
      },
    },
  });

  return (
    <div className="space-y-5">
      <Toolbar items={toolbarItems} />

      {canEdit && createOpen && (
        <CreatePanel
          variant="inline"
          title="新建员工资料"
          onSubmit={() => void createEmployee()}
          onCancel={() => {
            setCreateOpen(false);
            setNewEmployeeName("");
          }}
          submitDisabled={creating || !newEmployeeName.trim()}
          submitting={creating}
        >
          <FormField label="姓名" required>
            <InputControl
              spec={{ valueType: "string", editor: "input" }}
              value={newEmployeeName}
              onChange={(value) => setNewEmployeeName(String(value ?? ""))}
              placeholder="输入姓名"
            />
          </FormField>
        </CreatePanel>
      )}

      {error && <EmptyStateCard compact className="border-red-100 text-red-600">{error}</EmptyStateCard>}

      <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
        <DataTable
          rows={employees}
          columns={columns}
          visibleColumns={visibleColumns}
          loading={loading}
          emptyText="暂无员工"
          rowKey={(employee) => employee.id}
          onRowClick={(employee) => router.push(`/hr/roster/employees/${employee.employeeId}`)}
          rowActions={(employee) => [
            {
              key: "view",
              label: "查看员工资料",
              kind: "view",
              onClick: () => router.push(`/hr/roster/employees/${employee.employeeId}`),
            },
          ]}
        />
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          className="border-t border-slate-200 px-4 py-3"
          compact
        />
      </PanelCard>
    </div>
  );
}
