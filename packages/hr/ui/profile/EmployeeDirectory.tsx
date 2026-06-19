"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DataTable,
  FilterToolbar,
  PanelCard,
  Pagination,
  TextField,
  getToolbarActionClassName,
  type DataTableColumn,
} from "@workspace/core/ui";
import { workspacePath } from "@workspace/core/routing";
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

function genderLabel(value: boolean | null) {
  if (value === true) return "男";
  if (value === false) return "女";
  return "-";
}

export default function EmployeeDirectory({ user }: { user: HRUser }) {
  const router = useRouter();
  const canEdit = hrCanEdit(user);
  const [keyword, setKeyword] = useState("");
  const [draftKeyword, setDraftKeyword] = useState("");
  const [employees, setEmployees] = useState<DirectoryEmployee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");

  const pageSize = 50;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);
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
      {
        key: "action",
        label: "操作",
        required: true,
        render: (employee) => (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              router.push(`/hr/roster/employees/${employee.employeeId}`);
            }}
            className={getToolbarActionClassName("secondary")}
          >
            编辑资料
          </button>
        ),
      },
    ],
    [router]
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
      try {
        const res = await fetch(workspacePath(`/api/hr/employees?${params.toString()}`));
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
  }, [keyword, page]);

  async function createEmployee() {
    if (!newEmployeeName.trim()) {
      setError("姓名必填");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(workspacePath("/api/hr/employees"), {
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

  return (
    <div className="space-y-5">
      <PanelCard bodyClassName="p-4">
        <FilterToolbar
          keyword={draftKeyword}
          onKeywordChange={setDraftKeyword}
          searchPlaceholder="搜索员工编号、姓名、拼音"
          extraRight={<span className="text-sm text-slate-500">共 {total} 人</span>}
        >
            <button
              type="button"
              onClick={() => {
                setKeyword(draftKeyword.trim());
                setPage(1);
              }}
              className={getToolbarActionClassName("secondary")}
            >
              搜索
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftKeyword("");
                setKeyword("");
                setPage(1);
              }}
              className={getToolbarActionClassName("secondary")}
            >
              重置
            </button>
        </FilterToolbar>

        {canEdit && (
          <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-[220px_auto]">
            <TextField
              value={newEmployeeName}
              onChange={setNewEmployeeName}
              placeholder="姓名"
            />
            <button
              type="button"
              disabled={creating}
              onClick={createEmployee}
              className={getToolbarActionClassName("primary")}
            >
              新建员工资料
            </button>
          </div>
        )}

        {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </PanelCard>

      <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
        <DataTable
          rows={employees}
          columns={columns}
          visibleColumns={columns.map((column) => column.key)}
          loading={loading}
          emptyText="暂无员工"
          rowKey={(employee) => employee.id}
          onRowClick={(employee) => router.push(`/hr/roster/employees/${employee.employeeId}`)}
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
