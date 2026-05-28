"use client";

import { usePermissionsTab, type SubjectType } from "../hooks/usePermissionsTab";
import FilterBar from "@/app/components/FilterBar";
import type { ResourceItem } from "../types";

interface Props {
  resources: ResourceItem[];
  showToast: (msg: string, type?: "success" | "error") => void;
}

export default function PermissionsTab({ resources, showToast }: Props) {
  const s = usePermissionsTab(resources, showToast);

  return (
    <div className="space-y-6">
      {/* Resource Tree + Subject Type Selector */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left: Resource Tree */}
        <div className="w-full shrink-0 lg:w-56">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">资源模块</h3>
          <ResourceTree
            resources={s.topResources}
            selectedResource={s.selectedResource}
            onSelect={(key) => { s.setParentResource(key); s.setSelectedResource(key); }}
          />
          {s.childResources.length > 0 && s.parentResource && (
            <div className="mt-2">
              <p className="mb-1 text-xs text-gray-500">子权限</p>
              <ResourceTree
                resources={s.childResources}
                selectedResource={s.selectedResource}
                onSelect={s.setSelectedResource}
                isChild
              />
            </div>
          )}
        </div>

        {/* Right: Main Area */}
        <div className="min-w-0 flex-1">
          {/* Subject Type Segmented Control */}
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

          {/* Filters */}
          <FilterBar>
            {s.subjectType !== "department" && (
              <>
                <select
                  value={s.l1Dept}
                  onChange={(e) => s.setL1Dept(e.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
                >
                  {s.l1Options.map((d) => (
                    <option key={d} value={d}>
                      {d === "全部" ? "一级部门" : d}
                    </option>
                  ))}
                </select>
                {s.l2Options.length > 1 && (
                  <select
                    value={s.l2Dept}
                    onChange={(e) => s.setL2Dept(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
                  >
                    {s.l2Options.map((d) => (
                      <option key={d} value={d}>
                        {d === "全部" ? "二级部门" : d}
                      </option>
                    ))}
                  </select>
                )}
                {s.l3Options.length > 1 && (
                  <select
                    value={s.l3Dept}
                    onChange={(e) => s.setL3Dept(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
                  >
                    {s.l3Options.map((d) => (
                      <option key={d} value={d}>
                        {d === "全部" ? "三级部门" : d}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            <input
              type="text"
              placeholder={s.subjectType === "user" ? "搜索姓名…" : s.subjectType === "position" ? "搜索岗位…" : "搜索部门…"}
              value={s.nameSearch}
              onChange={(e) => s.setNameSearch(e.target.value)}
              className="min-w-[160px] rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-emerald-400 focus:outline-none"
            />
          </FilterBar>

          {/* Matrix Table */}
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

/* ─── Resource Tree ─── */

function ResourceTree({
  resources,
  selectedResource,
  onSelect,
  isChild = false,
}: {
  resources: ResourceItem[];
  selectedResource: string | null;
  onSelect: (key: string) => void;
  isChild?: boolean;
}) {
  return (
    <div className={`space-y-1 ${isChild ? "pl-2" : ""}`}>
      {resources.map((r) => {
        const isSelected =
          selectedResource === r.key ||
          (!isChild && selectedResource?.startsWith(r.key + "."));
        return (
          <button
            key={r.key}
            onClick={() => onSelect(r.key)}
            className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
              isSelected
                ? "bg-emerald-50 text-emerald-700 font-medium"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {r.name}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Matrix Table ─── */

function MatrixTable({ s }: { s: ReturnType<typeof usePermissionsTab> }) {
  if (!s.selectedResource) {
    return (
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-400">请选择左侧资源模块</p>
      </div>
    );
  }

  if (s.subjects.length === 0) {
    return (
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-400">无匹配结果</p>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
            <th className="whitespace-nowrap pb-2 pr-3">
              {s.subjectType === "user" ? "姓名" : s.subjectType === "position" ? "岗位" : "部门"}
            </th>
            {s.roles.map((r) => (
              <th key={r.key} className="whitespace-nowrap pb-2 pr-3 text-center">
                {r.name}
              </th>
            ))}
            <th className="whitespace-nowrap pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {s.subjects.map((subject) => (
            <MatrixRow key={subject.id} subject={subject} s={s} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatrixRow({ subject, s }: { subject: { id: number; name: string; extra?: Record<string, unknown> }; s: ReturnType<typeof usePermissionsTab> }) {
  const isExpanded = s.expandedRows.has(subject.id);
  const hasNoUser = s.subjectType === "user" && !subject.extra?.hasUser;

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50">
        <td className="whitespace-nowrap py-2 pr-3">
          <div className="flex flex-col">
            <span className="font-medium text-gray-800">{subject.name}</span>
            {s.subjectType === "user" && !!subject.extra?.employeeId && (
              <span className="text-xs text-gray-400">{String(subject.extra.employeeId)}</span>
            )}
            {s.subjectType !== "user" && !!subject.extra?.code && (
              <span className="text-xs text-gray-400">{String(subject.extra.code)}</span>
            )}
            {hasNoUser && (
              <span className="text-xs text-red-500">未关联账号</span>
            )}
          </div>
        </td>
        {s.roles.map((role) => {
          const state = s.getPermissionState(subject, role.key);
          return (
            <td key={role.key} className="whitespace-nowrap py-2 pr-3 text-center">
              <PermissionCell
                state={state}
                disabled={hasNoUser}
                onClick={() => s.toggleGrant(subject, role.key)}
              />
            </td>
          );
        })}
        <td className="whitespace-nowrap py-2">
          <button
            onClick={() => s.toggleRowExpand(subject.id)}
            className="text-xs text-gray-400 hover:text-emerald-600"
          >
            {isExpanded ? "收起" : "详情"}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={s.roles.length + 2} className="border-b border-gray-100 bg-gray-50 px-3 py-3">
            <PermissionDetails subject={subject} s={s} />
          </td>
        </tr>
      )}
    </>
  );
}

function PermissionCell({
  state,
  disabled,
  onClick,
}: {
  state: { has: boolean; source: string | null };
  disabled: boolean;
  onClick: () => void;
}) {
  if (disabled) {
    return <span className="text-gray-300">—</span>;
  }

  if (state.has) {
    const isInherited = state.source !== "direct";
    return (
      <button
        onClick={isInherited ? undefined : onClick}
        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
          isInherited
            ? "bg-gray-100 text-gray-500 cursor-default"
            : "bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-600"
        }`}
        title={state.source ? `来源: ${sourceLabel(state.source)}` : undefined}
      >
        {isInherited ? (
          <>
            <span className="opacity-60">✓</span>
            <span>继承</span>
          </>
        ) : (
          "✓"
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="rounded px-2 py-1 text-xs text-gray-300 hover:bg-emerald-100 hover:text-emerald-600"
      title="点击授权"
    >
      +
    </button>
  );
}

function sourceLabel(source: string): string {
  switch (source) {
    case "direct":
      return "直接授权";
    case "position":
      return "岗位继承";
    case "department":
      return "部门继承";
    case "ancestor":
      return "父资源继承";
    case "system.admin":
      return "系统管理员";
    default:
      return source;
  }
}

function PermissionDetails({
  subject,
  s,
}: {
  subject: { id: number; name: string; extra?: Record<string, unknown> };
  s: ReturnType<typeof usePermissionsTab>;
}) {
  const details: string[] = [];

  for (const role of s.roles) {
    const state = s.getPermissionState(subject, role.key);
    if (state.has && state.source) {
      details.push(`${role.name}: ${sourceLabel(state.source)}`);
    }
  }

  if (details.length === 0) {
    return <p className="text-xs text-gray-400">无权限</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {details.map((d, i) => (
        <span
          key={i}
          className="rounded bg-white px-2 py-1 text-xs text-gray-600 shadow-sm"
        >
          {d}
        </span>
      ))}
    </div>
  );
}
