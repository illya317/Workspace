"use client";

import { useEffect, useMemo, useState } from "react";
import { createPageBody, BodySurface, type CreateSurfaceToolbarProps, type FormSurfaceItemSpec } from "@workspace/core/ui";
import { departmentCodeEditableSegment } from "./department-code-input";
import { postDirectCommandJson } from "@workspace/platform/ui/api-client";
import { actionRuntimeCreateSubmission } from "@workspace/platform/ui";
import type { ActionRuntime } from "@workspace/platform/workflow-action-runtime";
import { useDepartmentDescriptionCreateSections } from "./department-descriptions-panel";
import { sanitizeDepartmentDescriptionDetails } from "./draft-utils";
import { canUseDepartmentAsParentForHierarchy, isOperatingCommittee, serializeAlias } from "./utils";
import type { Department, DepartmentDescriptionDraft, OrganizationCodeConfig } from "./types";
import { suggestDepartmentCodeInput } from "./utils";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";

function deriveCreateCode(
  hierarchyKind: "G" | "M",
  level: 1 | 2 | 3,
  parentId: number | null,
  departmentById: Map<number, Department>,
  codeConfig: OrganizationCodeConfig | null,
): string {
  if (!codeConfig) return "";
  const allDepartments = Array.from(departmentById.values());
  const draft = { hierarchyKind, level, parentId, code: "", name: "" };
  const suggestion = suggestDepartmentCodeInput(draft, allDepartments, codeConfig);
  if (hierarchyKind === "G") return suggestion;
  if (level === 1) {
    return `${suggestion}${codeConfig.department.separator}${codeConfig.department.managementRootSuffix}`;
  }
  const parent = parentId == null ? undefined : departmentById.get(parentId);
  const identifierLength = codeConfig.department.identifierLength;
  const prefix = parent?.code.slice(0, identifierLength)
    || suggestion.slice(0, identifierLength)
    || codeConfig.department.functionalPrefix;
  if (level === 2) {
    return `${prefix}${codeConfig.department.separator}${suggestion}${codeConfig.department.level2Suffix}`;
  }
  const parentNumber = parent?.code.slice(identifierLength + codeConfig.department.separator.length)
    || `1${codeConfig.department.level2Suffix}`;
  const stem = parentNumber.slice(0, -codeConfig.department.level2Suffix.length) || "1";
  return `${prefix}${codeConfig.department.separator}${stem}${suggestion}`;
}

type DepartmentCreatePanelProps = {
  departments: Department[];
  codeConfig: OrganizationCodeConfig | null;
  departmentById: Map<number, Department>;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  actionRuntime: ActionRuntime | null;
};

export function useDepartmentCreateSurface({
  departments,
  codeConfig,
  departmentById,
  onCancel,
  onCreated,
  actionRuntime,
  open,
  onOpenChange,
}: DepartmentCreatePanelProps & { open: boolean; onOpenChange: (open: boolean) => void }): CreateSurfaceToolbarProps {
  const operatingCommitteeCode = useTenantConfig().organization.operatingCommittee.departmentCode;
  const defaultManagementRootParentId = useMemo(
    () => Array.from(departmentById.values()).find((department) => isOperatingCommittee(department, operatingCommitteeCode))?.id ?? null,
    [departmentById, operatingCommitteeCode],
  );
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const hierarchyKind = "M" as const;
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [parentId, setParentId] = useState<number | null>(defaultManagementRootParentId);
  const [code, setCode] = useState(() => deriveCreateCode("M", 1, defaultManagementRootParentId, departmentById, codeConfig));
  const [descriptionDraft, setDescriptionDraft] = useState<DepartmentDescriptionDraft>({
    id: null,
    code,
    name: "",
    sourceFile: "",
    codeRaw: "",
    details: JSON.stringify({ "基本信息": { "部门名称": "" } }, null, 2),
  });
  useEffect(() => {
    if (code || !codeConfig) return;
    const generated = deriveCreateCode(hierarchyKind, level, parentId, departmentById, codeConfig);
    setCode(generated);
    setDescriptionDraft((current) => ({ ...current, code: generated }));
  }, [code, codeConfig, departmentById, hierarchyKind, level, parentId]);

  const parentOptions = useMemo(() => {
    return [
      { value: "", label: "无" },
      ...departments
        .filter((d) => canUseDepartmentAsParentForHierarchy({ candidate: d, hierarchyKind, level, operatingCommitteeCode }))
        .map((d) => ({ value: String(d.id), label: `${d.name}（${d.code}）` })),
    ];
  }, [departments, hierarchyKind, level, operatingCommitteeCode]);

  function updateLevelAndParent(nextLevel: 1 | 2 | 3, nextParentId: number | null) {
    const effectiveParentId = hierarchyKind === "M" && nextLevel === 1 ? (nextParentId ?? defaultManagementRootParentId) : nextParentId;
    setLevel(nextLevel);
    setParentId(effectiveParentId);
    setCode(deriveCreateCode(hierarchyKind, nextLevel, effectiveParentId, departmentById, codeConfig));
  }

  function updateDraftName(nextName: string) {
    setName(nextName);
    setDescriptionDraft((prev) => ({
      ...prev,
      name: nextName,
      details: sanitizeDepartmentDescriptionDetails(prev.details, nextName),
    }));
  }

  function buildPayload() {
    return {
      code: code.trim(),
      name: name.trim(),
      alias: serializeAlias(alias || ""),
      hierarchyKind,
      level,
      parentId,
      descriptions: [
        {
          sourceFile: "",
          codeRaw: "",
          details: sanitizeDepartmentDescriptionDetails(descriptionDraft.details, name),
        },
      ],
    };
  }

  async function handleSubmit() {
    if (!name.trim() || !code.trim() || !actionRuntime) return;
    setSubmitting(true);
    try {
      await postDirectCommandJson<{ executionMode: "direct" | "workflow" }>(
        "/api/modules/hr/roster/departments",
        buildPayload(),
        "新建组织失败",
      );
      await onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled = !name.trim() || !code.trim() || submitting;
  const submission = actionRuntimeCreateSubmission(actionRuntime, { disabled: submitDisabled, execute: handleSubmit })
    ?? { action: "save" as const, disabled: true, execute: handleSubmit };
  const canEditDraft = actionRuntime?.editability === "editable";
  const descriptionSections = useDepartmentDescriptionCreateSections({
    drafts: [descriptionDraft],
    dirty: false,
    canEditDepartment: canEditDraft,
    onUpdateDraft: (_index, key, value) => setDescriptionDraft((prev) => ({ ...prev, [key]: value })),
  });
  const departmentInfoItems: FormSurfaceItemSpec[] = [
            {
              kind: "readonly",
              key: "hierarchyKind",
              label: "组织体系",
              value: "管理",
            },
            {
              key: "code",
              label: "组织编码",
              required: true,
              spec: {
                valueType: "string" as const,
                control: "text" as const,
                mask: { kind: "editableSegment" as const, ...departmentCodeEditableSegment(level, hierarchyKind, codeConfig) },
                state: !canEditDraft ? "disabled" as const : "normal" as const,
              },
              value: code,
              onChange: (next) => setCode(String(next ?? "")),
            },
            {
              key: "name",
              label: "组织名称",
              required: true,
              spec: { valueType: "string" as const, control: "text" as const, state: !canEditDraft ? "disabled" as const : "normal" as const },
              value: name,
              onChange: (value) => updateDraftName(String(value ?? "")),
            },
            {
              key: "level",
              label: "组织层级",
              spec: {
                valueType: "number" as const,
                control: "choice" as const,
                state: !canEditDraft ? "disabled" as const : "normal" as const,
                options: {
                  source: "static" as const,
                  items: [
                    { value: "1", label: `${hierarchyKind}1` },
                    { value: "2", label: `${hierarchyKind}2` },
                    { value: "3", label: `${hierarchyKind}3` },
                  ],
                },
              },
              value: String(level),
              onChange: (next) => {
                const nextLevel = Number(next) as 1 | 2 | 3;
                updateLevelAndParent(nextLevel, nextLevel === 1 ? null : parentId);
              },
            },
            {
              key: "parent",
              label: "上级组织",
              spec: {
                valueType: "reference" as const,
                control: "choice" as const,
                state: !canEditDraft || (level === 1 && hierarchyKind !== "M") ? "disabled" as const : "normal" as const,
                options: { source: "static" as const, items: parentOptions },
              },
              value: parentId == null ? "" : String(parentId),
              placeholder: "无",
              onChange: (next) => {
                const nextParentId = next === "" ? null : Number(next);
                const parent = nextParentId == null ? undefined : departmentById.get(nextParentId);
                const nextLevel = parent && parent.hierarchyKind === hierarchyKind ? Math.min(parent.level + 1, 3) as 1 | 2 | 3 : 1;
                updateLevelAndParent(nextLevel, nextParentId);
              },
            },
            {
              key: "alias",
              label: "别名",
              spec: { valueType: "string" as const, control: "text" as const, state: !canEditDraft ? "disabled" as const : "normal" as const },
              value: alias,
              onChange: (value) => setAlias(String(value ?? "")),
            },
  ];

  return {
    id: "department-create",
    trigger: "toolbar",
    presentation: "block",
    title: "新建组织",
    open,
    canCreate: canEditDraft,
    disabled: submitting,
    content: { kind: "sections", sections: [
      { key: "department-info", title: "组织信息", items: departmentInfoItems, layout: { columns: 2 } },
      ...descriptionSections,
    ] },
    submission,
    feedback: { saved: "组织已新建", submitted: "组织流程已提交", error: "新建组织失败" },
    onOpenChange,
    onCancel,
  };
}

export function DepartmentCreatePanel(props: DepartmentCreatePanelProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const create = useDepartmentCreateSurface(props);
  return (
    <BodySurface {...createPageBody([{ key: "department-create", body: { kind: "create", create } }])} />
  );
}
