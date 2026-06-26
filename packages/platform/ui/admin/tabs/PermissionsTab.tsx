"use client";

import { useMemo, useState } from "react";
import { usePermissionsTab } from "../hooks/usePermissionsTab";
import { EmptyStateCard, SectionCard, SelectField, TabBar, Toolbar, type ToolbarItem } from "@workspace/core/ui";
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
                triggerClassName="min-h-6 min-w-16 px-1 py-0.5 text-xs text-gray-600"
              />
            </div>
          )}
          <ResourceTree
            resources={resources}
            selectedResource={s.selectedResource}
            onSelect={selectResource}
          />
        </div>

        <div className="min-w-0 flex-1">
          {selectedOwnerKey && ownerCapabilities.length > 0 && (
            <TabBar
              className="mb-4"
              active={resourceMode}
              onChange={switchMode}
              tabs={[
                { key: "entry", label: "入口权限" },
                { key: "capability", label: "设置" },
              ]}
            />
          )}

          {resourceMode === "capability" && selectedOwnerKey && (
            <SectionCard
              title={`${selectedEntry?.name ?? selectedOwnerKey} 的设置能力`}
              className="mb-4"
              bodyClassName="p-3"
            >
              {ownerCapabilities.length > 0 ? (
                <TabBar
                  variant="micro"
                  active={resourceMode === "capability" ? s.selectedResource ?? "" : ""}
                  onChange={(key) => s.setSelectedResource(key)}
                  tabs={ownerCapabilities.map((capability) => ({
                    key: capability.key,
                    label: capability.name,
                  }))}
                />
              ) : (
                <p className="text-sm text-slate-400">暂无独立设置能力</p>
              )}
            </SectionCard>
          )}

          <TabBar
            className="mb-4"
            active={s.subjectType}
            onChange={(value) => s.setSubjectType(value as SubjectType)}
            tabs={[
              { key: "user", label: "员工" },
              { key: "position", label: "岗位" },
              { key: "department", label: "部门" },
            ]}
          />

          <Toolbar
            items={[
              ...(s.subjectType !== "department"
                ? [
                    {
                      kind: "select" as const,
                      key: "l1-dept",
                      section: "filter" as const,
                      value: s.l1Dept,
                      onChange: s.setL1Dept,
                      options: s.l1Options.flatMap((d) => d ? [{ value: d, label: d === "全部" ? "一级部门" : d }] : []),
                      triggerClassName: "min-w-40",
                    },
                    ...(s.l2Options.length > 1
                      ? [{
                          kind: "select" as const,
                          key: "l2-dept",
                          section: "filter" as const,
                          value: s.l2Dept,
                          onChange: s.setL2Dept,
                          options: s.l2Options.flatMap((d) => d ? [{ value: d, label: d === "全部" ? "二级部门" : d }] : []),
                          triggerClassName: "min-w-40",
                        }]
                      : []),
                    ...(s.l3Options.length > 1
                      ? [{
                          kind: "select" as const,
                          key: "l3-dept",
                          section: "filter" as const,
                          value: s.l3Dept,
                          onChange: s.setL3Dept,
                          options: s.l3Options.flatMap((d) => d ? [{ value: d, label: d === "全部" ? "三级部门" : d }] : []),
                          triggerClassName: "min-w-40",
                        }]
                      : []),
                  ]
                : []),
              {
                kind: "search" as const,
                key: "name",
                section: "search" as const,
                placeholder: s.subjectType === "user"
                  ? "搜索姓名…"
                  : s.subjectType === "position"
                    ? "搜索岗位…"
                    : "搜索部门…",
                value: s.nameSearch,
                onChange: s.setNameSearch,
                className: "min-w-0 sm:w-[22rem]",
              },
            ] satisfies ToolbarItem[]}
          />

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
