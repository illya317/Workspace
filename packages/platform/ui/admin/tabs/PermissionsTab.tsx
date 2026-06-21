"use client";

import { usePermissionsTab } from "../hooks/usePermissionsTab";
import { EmptyStateCard, FilterBar, PickerSegmentedControl, SearchInput, SelectField } from "@workspace/core/ui";
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
          <div className="mb-2 text-sm font-semibold text-gray-700">资源模块</div>
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
          <PickerSegmentedControl
            className="mb-4"
            value={s.subjectType}
            onChange={(value) => s.setSubjectType(value as SubjectType)}
            options={[
              { value: "user", label: "员工" },
              { value: "position", label: "岗位" },
              { value: "department", label: "部门" },
            ]}
          />

          <FilterBar>
            {s.subjectType !== "department" && (
              <>
	                <SelectField
	                  value={s.l1Dept}
	                  onChange={s.setL1Dept}
	                  options={s.l1Options.flatMap((d) =>
	                    d ? [{ value: d, label: d === "全部" ? "一级部门" : d }] : []
	                  )}
	                  size="toolbar"
	                  selectClassName="min-w-40"
	                />
	                {s.l2Options.length > 1 && (
	                  <SelectField
	                    value={s.l2Dept}
	                    onChange={s.setL2Dept}
	                    options={s.l2Options.flatMap((d) =>
	                      d ? [{ value: d, label: d === "全部" ? "二级部门" : d }] : []
	                    )}
	                    size="toolbar"
	                    selectClassName="min-w-40"
	                  />
	                )}
	                {s.l3Options.length > 1 && (
	                  <SelectField
	                    value={s.l3Dept}
	                    onChange={s.setL3Dept}
	                    options={s.l3Options.flatMap((d) =>
	                      d ? [{ value: d, label: d === "全部" ? "三级部门" : d }] : []
	                    )}
	                    size="toolbar"
	                    selectClassName="min-w-40"
	                  />
                )}
              </>
            )}
            <SearchInput
              placeholder={
                s.subjectType === "user"
                  ? "搜索姓名…"
                  : s.subjectType === "position"
                    ? "搜索岗位…"
                    : "搜索部门…"
              }
              value={s.nameSearch}
              onChange={s.setNameSearch}
              size="toolbar"
              className="min-w-0 sm:w-[22rem]"
            />
          </FilterBar>

          {s.loading ? (
            <EmptyStateCard compact className="mt-4">加载中...</EmptyStateCard>
          ) : (
            <MatrixTable s={s} />
          )}
        </div>
      </div>
    </div>
  );
}
