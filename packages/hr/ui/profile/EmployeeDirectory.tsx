"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={draftKeyword}
              onChange={(event) => setDraftKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setKeyword(draftKeyword.trim());
                  setPage(1);
                }
              }}
              placeholder="搜索员工编号、姓名、拼音"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:w-72"
            />
            <button
              type="button"
              onClick={() => {
                setKeyword(draftKeyword.trim());
                setPage(1);
              }}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
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
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              重置
            </button>
          </div>
          <div className="text-sm text-slate-500">共 {total} 人</div>
        </div>

        {canEdit && (
          <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 md:grid-cols-[220px_auto]">
            <input
              value={newEmployeeName}
              onChange={(event) => setNewEmployeeName(event.target.value)}
              placeholder="姓名"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              disabled={creating}
              onClick={createEmployee}
              className="w-fit rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-slate-300"
            >
              新建员工资料
            </button>
          </div>
        )}

        {error && <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">员工编号</th>
                <th className="px-4 py-3 font-medium">姓名</th>
                <th className="px-4 py-3 font-medium">性别</th>
                <th className="px-4 py-3 font-medium">出生年月</th>
                <th className="px-4 py-3 font-medium">学历</th>
                <th className="px-4 py-3 font-medium">岗位</th>
                <th className="px-4 py-3 font-medium">直属部门</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">加载中...</td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">暂无员工</td></tr>
              ) : (
                employees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="cursor-pointer transition hover:bg-emerald-50/60"
                    onClick={() => router.push(`/hr/roster/employees/${employee.employeeId}`)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{employee.employeeId}</td>
                    <td className="whitespace-nowrap px-4 py-3">{employee.name}</td>
                    <td className="whitespace-nowrap px-4 py-3">{genderLabel(employee.gender)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{employee.birthDate || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{employee.education || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{employee.positionName || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{employee.directDepartmentName || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/hr/roster/employees/${employee.employeeId}`);
                        }}
                        className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        编辑资料
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
          <span>第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-md border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              className="rounded-md border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
