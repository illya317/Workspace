"use client";

import { usePermissionsTab } from "../hooks/usePermissionsTab";
import FilterBar from "@/app/components/FilterBar";
import SelectField from "@/app/components/SelectField";
import ResourceTree from "../components/permissions/ResourceTree";
import MatrixTable from "../components/permissions/MatrixTable";
import type { ResourceItem, SubjectType } from "../types";

interface Props {
  resources: ResourceItem[];
  showToast: (msg: string, type?: "success" | "error") => void;
}

export default function PermissionsTab({ resources, showToast }: Props) {
  const s = usePermissionsTab(resources, showToast);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="w-full shrink-0 lg:w-56">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">资源模块</h3>
          {s.selectedResource && s.isSystemAdmin && s.selectedResource !== "system" && (
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
              最高业务权限：
              <SelectField
                value={s.maxRoleKey === "admin" ? "delete" : s.maxRoleKey}
                onChange={s.updateMaxRole}
                options={[
                  { value: "access", label: "访问" },
                  { value: "write", label: "编辑" },
                  { value: "delete", label: "删除" },
                ]}
                selectClassName="min-h-6 min-w-16 px-1 py-0.5 text-xs text-gray-600"
              />
            </div>
          )}
          <ResourceTree
            resources={resources}
            selectedResource={s.selectedResource}
            onSelect={s.setSelectedResource}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
            {([
              { key: "user" as SubjectType, label: "员工" },
              { key: "position" as SubjectType, label: "岗位" },
              { key: "department" as SubjectType, label: "部门" },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => s.setSubjectType(t.key)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  s.subjectType === t.key
                    ? "bg-white text-emerald-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <FilterBar>
            {s.subjectType !== "department" && (
              <>
	                <SelectField
	                  value={s.l1Dept}
	                  onChange={s.setL1Dept}
	                  options={s.l1Options.flatMap((d) =>
	                    d ? [{ value: d, label: d === "全部" ? "一级部门" : d }] : []
	                  )}
	                  selectClassName="min-w-28 px-3 py-1.5 text-sm"
	                />
	                {s.l2Options.length > 1 && (
	                  <SelectField
	                    value={s.l2Dept}
	                    onChange={s.setL2Dept}
	                    options={s.l2Options.flatMap((d) =>
	                      d ? [{ value: d, label: d === "全部" ? "二级部门" : d }] : []
	                    )}
	                    selectClassName="min-w-28 px-3 py-1.5 text-sm"
	                  />
	                )}
	                {s.l3Options.length > 1 && (
	                  <SelectField
	                    value={s.l3Dept}
	                    onChange={s.setL3Dept}
	                    options={s.l3Options.flatMap((d) =>
	                      d ? [{ value: d, label: d === "全部" ? "三级部门" : d }] : []
	                    )}
	                    selectClassName="min-w-28 px-3 py-1.5 text-sm"
	                  />
                )}
              </>
            )}
            <input
              type="text"
              placeholder={
                s.subjectType === "user"
                  ? "搜索姓名…"
                  : s.subjectType === "position"
                    ? "搜索岗位…"
                    : "搜索部门…"
              }
              value={s.nameSearch}
              onChange={(e) => s.setNameSearch(e.target.value)}
              className="min-w-[160px] rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </FilterBar>

          {s.loading ? (
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-400">加载中…</p>
            </div>
          ) : (
            <MatrixTable s={s} />
          )}
        </div>
      </div>
    </div>
  );
}
