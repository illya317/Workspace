"use client";

import { useDeptAdminsTab } from "./useDeptAdminsTab";

interface Props {
  showToast: (msg: string, type?: "success" | "error") => void;
}

export default function DeptAdminsTab({ showToast }: Props) {
  const {
    deptLoading,
    companyTab,
    setCompanyTab,
    deptAddOpen,
    setDeptAddOpen,
    deptSearchQ,
    setDeptSearchQ,
    deptResults,
    deptConfirm,
    handleRemoveDeptAdmin,
    addDeptAdmin,
    filteredDepts,
  } = useDeptAdminsTab(showToast);

  return (
    <div className="space-y-4">
      <div className="mb-3 flex gap-2">
        {(["全部", "丰华制药", "丰华生物"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setCompanyTab(tab)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              companyTab === tab
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
        {deptLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">加载中...</p>
        ) : filteredDepts.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">暂无部门</p>
        ) : (
          filteredDepts.map((dept) => (
            <div key={dept.id} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-800">{dept.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{dept.company}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDeptAddOpen(deptAddOpen === dept.id ? null : dept.id)}
                  className="text-xs text-emerald-600 hover:text-emerald-800"
                >
                  {deptAddOpen === dept.id ? "取消" : "添加"}
                </button>
              </div>
              {dept.admins.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {dept.admins.map((a) => {
                    const confirming = deptConfirm === a.id;
                    return (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700"
                      >
                        {a.user.name}
                        <button
                          type="button"
                          onClick={() => handleRemoveDeptAdmin(a.id)}
                          className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold ${
                            confirming
                              ? "bg-red-100 text-red-600"
                              : "text-gray-400 hover:bg-red-50 hover:text-red-500"
                          }`}
                        >
                          {confirming ? "?" : "×"}
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              {deptAddOpen === dept.id && (
                <div className="relative mt-2">
                  <input
                    type="text"
                    value={deptSearchQ}
                    onChange={(e) => setDeptSearchQ(e.target.value)}
                    placeholder="搜索员工姓名/工号..."
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  />
                  {deptSearchQ.trim() && deptResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                      <div className="max-h-40 overflow-y-auto">
                        {deptResults.map((emp) => (
                          <div
                            key={`${emp.rowId}-${emp.employeeId}`}
                            onClick={() => addDeptAdmin(dept.id, emp.userId!, emp.name)}
                            className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm hover:bg-emerald-50"
                          >
                            <span className="font-medium text-gray-800">{emp.name}</span>
                            <span className="text-xs text-gray-400">
                              {emp.employeeId}
                              {emp.dept1 ? ` · ${emp.dept1}` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
