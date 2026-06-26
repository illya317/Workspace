"use client";

import { useMemo, useState } from "react";
import { usePermissionsTab } from "../hooks/usePermissionsTab";
import { FormSurface, NavigationSurface, PageSurface } from "@workspace/core/ui";
import ResourceTree from "../components/ResourceTree";
import MatrixTable from "../components/permissions/MatrixTable";
import type { ResourceItem, SubjectType } from "../types";

interface Props {
  resources: ResourceItem[];
  capabilitiesByOwner: Record<string, ResourceItem[]>;
  showToast: (msg: string, type?: "success" | "error") => void;
}

function flattenResources(items: ResourceItem[]): ResourceItem[] {
  const output: ResourceItem[] = [];
  for (const item of items) {
    output.push(item);
    if (item.children?.length) output.push(...flattenResources(item.children));
  }
  return output;
}

export default function PermissionsTab({ resources, capabilitiesByOwner, showToast }: Props) {
  const capabilities = useMemo(
    () => Object.values(capabilitiesByOwner).flat(),
    [capabilitiesByOwner],
  );
  const resourceLookup = useMemo(
    () => [...resources, ...capabilities],
    [resources, capabilities],
  );
  const capabilityOwnerByKey = useMemo(
    () => new Map(capabilities.map((capability) => [capability.key, capability.ownerKey ?? ""])),
    [capabilities],
  );
  const [resourceMode, setResourceMode] = useState<"entry" | "capability">("entry");
  const s = usePermissionsTab(resources, resourceLookup, showToast);

  const selectedOwnerKey = s.selectedResource
    ? capabilityOwnerByKey.get(s.selectedResource) || s.selectedResource
    : null;
  const ownerCapabilities = selectedOwnerKey ? capabilitiesByOwner[selectedOwnerKey] ?? [] : [];
  const selectedCapability = s.selectedResource ? capabilityOwnerByKey.has(s.selectedResource) : false;
  const selectedEntry = s.selectedResource && !selectedCapability
    ? flattenResources(resources).find((resource) => resource.key === s.selectedResource)
    : null;

  function selectResource(key: string) {
    setResourceMode("entry");
    s.setSelectedResource(key);
  }

  function switchMode(value: string) {
    const nextMode = value as "entry" | "capability";
    setResourceMode(nextMode);
    if (nextMode === "entry" && selectedCapability && selectedOwnerKey) {
      s.setSelectedResource(selectedOwnerKey);
    }
    if (nextMode === "capability" && !selectedCapability && ownerCapabilities[0]) {
      s.setSelectedResource(ownerCapabilities[0].key);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="w-full shrink-0 lg:w-72">
          <div className="mb-2 text-sm font-semibold text-gray-700">资源模块</div>
          {s.selectedResource && s.isSystemAdmin && (
            <FormSurface
              kind="inline"
              className="mb-2 text-xs text-gray-500"
              fields={[{
                key: "max-role",
                label: "最高业务权限",
                spec: {
                  valueType: "string",
                  editor: "select",
                  options: {
                    source: "static",
                    mode: "dropdown",
                    items: [
                      { value: "access", label: "访问" },
                      { value: "write", label: "编辑" },
                      { value: "delete", label: "删除" },
                    ],
                  },
                },
                value: s.maxRoleKey === "admin" ? "delete" : s.maxRoleKey,
                onChange: (value) => s.updateMaxRole(String(value ?? "")),
              }]}
            />
          )}
          <ResourceTree
            resources={resources}
            selectedResource={s.selectedResource}
            onSelect={selectResource}
          />
        </div>

        <div className="min-w-0 flex-1">
          {selectedOwnerKey && ownerCapabilities.length > 0 && (
            <NavigationSurface
              kind="tabs"
              className="mb-4"
              tabs={{
                active: resourceMode,
                onChange: switchMode,
                tabs: [
                  { key: "entry", label: "入口权限" },
                  { key: "capability", label: "设置" },
                ],
              }}
            />
          )}

          {resourceMode === "capability" && selectedOwnerKey && (
            <PageSurface
              kind="settings"
              embedded
              className="mb-4"
              blocks={[{
                kind: "panel",
                key: "owner-capabilities",
                title: `${selectedEntry?.name ?? selectedOwnerKey} 的设置能力`,
                bodyClassName: "p-3",
                blocks: ownerCapabilities.length > 0 ? [{
                  kind: "navigation",
                  key: "capability-tabs",
                  surface: {
                    kind: "tabs",
                    tabs: {
                      variant: "micro",
                      active: resourceMode === "capability" ? s.selectedResource ?? "" : "",
                      onChange: (key) => s.setSelectedResource(key),
                      tabs: ownerCapabilities.map((capability) => ({
                        key: capability.key,
                        label: capability.name,
                      })),
                    },
                  },
                }] : [{ kind: "message", key: "empty-capabilities", tone: "muted", content: "暂无独立设置能力" }],
              }]}
            />
          )}

          <NavigationSurface
            kind="tabs"
            className="mb-4"
            tabs={{
              active: s.subjectType,
              onChange: (value) => s.setSubjectType(value as SubjectType),
              tabs: [
                { key: "user", label: "员工" },
                { key: "position", label: "岗位" },
                { key: "department", label: "部门" },
              ],
            }}
          />

          <FormSurface
            kind="inline"
            fields={[
              ...(s.subjectType !== "department"
                ? [
                    {
                      key: "l1-dept",
                      label: "一级部门",
                      spec: { valueType: "string" as const, editor: "select" as const, options: { source: "static" as const, mode: "dropdown" as const, items: s.l1Options.flatMap((d) => d ? [{ value: d, label: d === "全部" ? "一级部门" : d }] : []) } },
                      value: s.l1Dept,
                      onChange: (value: unknown) => s.setL1Dept(String(value ?? "")),
                      className: "min-w-40",
                    },
                    ...(s.l2Options.length > 1
                      ? [{
                          key: "l2-dept",
                          label: "二级部门",
                          spec: { valueType: "string" as const, editor: "select" as const, options: { source: "static" as const, mode: "dropdown" as const, items: s.l2Options.flatMap((d) => d ? [{ value: d, label: d === "全部" ? "二级部门" : d }] : []) } },
                          value: s.l2Dept,
                          onChange: (value: unknown) => s.setL2Dept(String(value ?? "")),
                          className: "min-w-40",
                        }]
                      : []),
                    ...(s.l3Options.length > 1
                      ? [{
                          key: "l3-dept",
                          label: "三级部门",
                          spec: { valueType: "string" as const, editor: "select" as const, options: { source: "static" as const, mode: "dropdown" as const, items: s.l3Options.flatMap((d) => d ? [{ value: d, label: d === "全部" ? "三级部门" : d }] : []) } },
                          value: s.l3Dept,
                          onChange: (value: unknown) => s.setL3Dept(String(value ?? "")),
                          className: "min-w-40",
                        }]
                      : []),
                  ]
                : []),
              {
                key: "name",
                label: "搜索",
                spec: { valueType: "string", editor: "input" },
                placeholder: s.subjectType === "user"
                  ? "搜索姓名…"
                  : s.subjectType === "position"
                    ? "搜索岗位…"
                    : "搜索部门…",
                value: s.nameSearch,
                onChange: (value: unknown) => s.setNameSearch(String(value ?? "")),
                className: "min-w-0 sm:w-[22rem]",
              },
            ]}
          />

          {s.loading ? (
            <PageSurface kind="settings" embedded className="mt-4" empty={{ content: "加载中..." }} />
          ) : (
            <MatrixTable s={s} />
          )}
        </div>
      </div>
    </div>
  );
}
