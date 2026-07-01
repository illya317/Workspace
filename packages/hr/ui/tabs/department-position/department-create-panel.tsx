"use client";

import { useMemo, useState } from "react";
import { createPageBody, PageSurface, createPanelSection, type BodySurfaceSectionSpec } from "@workspace/core/ui";
import { departmentCodeEditableSegment } from "./department-code-input";
import { postJson } from "@workspace/platform/ui/api-client";
import { useDepartmentDescriptionsSection } from "./department-descriptions-panel";
import { sanitizeDepartmentDescriptionDetails } from "./draft-utils";
import { serializeAlias } from "./utils";
import type { Department, DepartmentDescriptionDraft } from "./types";
import { suggestDepartmentCodeInput } from "./utils";

function deriveCreateCode(level: 1 | 2 | 3, parentId: number | null, departmentById: Map<number, Department>): string {
  const allDepartments = Array.from(departmentById.values());
  const draft = { level, parentId, code: "", name: "" };
  const suggestion = suggestDepartmentCodeInput(draft, allDepartments);
  if (level === 1) return `${suggestion}001`;
  const parent = parentId == null ? undefined : departmentById.get(parentId);
  const prefix = parent?.code.slice(0, 3) || suggestion.slice(0, 3) || "ORG";
  if (level === 2) return `${prefix}${suggestion}00`;
  const parentNumber = parent?.code.slice(3) || "100";
  const stem = parentNumber.slice(0, -2) || "1";
  return `${prefix}${stem}${suggestion}`;
}

type DepartmentCreatePanelProps = {
  departments: Department[];
  departmentById: Map<number, Department>;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  canEdit: boolean;
};

export function useDepartmentCreatePanelSection({
  departments,
  departmentById,
  onCancel,
  onCreated,
  canEdit,
}: DepartmentCreatePanelProps): BodySurfaceSectionSpec {
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [parentId, setParentId] = useState<number | null>(null);
  const [code, setCode] = useState(() => deriveCreateCode(1, null, departmentById));
  const [descriptionDraft, setDescriptionDraft] = useState<DepartmentDescriptionDraft>({
    id: null,
    code,
    name: "",
    sourceFile: "",
    codeRaw: "",
    details: JSON.stringify({ "基本信息": { "部门名称": "" } }, null, 2),
  });

  const parentOptions = useMemo(() => {
    return [
      { value: "", label: "无" },
      ...departments
        .filter((d) => d.level < 3)
        .map((d) => ({ value: String(d.id), label: `${d.name}（L${d.level}）` })),
    ];
  }, [departments]);

  function updateLevelAndParent(nextLevel: 1 | 2 | 3, nextParentId: number | null) {
    setLevel(nextLevel);
    setParentId(nextParentId);
    setCode(deriveCreateCode(nextLevel, nextParentId, departmentById));
  }

  function updateDraftName(nextName: string) {
    setName(nextName);
    setDescriptionDraft((prev) => ({
      ...prev,
      name: nextName,
      details: sanitizeDepartmentDescriptionDetails(prev.details, nextName),
    }));
  }

  async function handleSubmit() {
    if (!name.trim() || !code.trim() || !canEdit) return;
    setSubmitting(true);
    try {
      await postJson(
        "/api/modules/hr/roster/departments",
        {
          code: code.trim(),
          name: name.trim(),
          alias: serializeAlias(alias || ""),
          level,
          parentId,
          descriptions: [
            {
              code: code.trim(),
              name: name.trim(),
              sourceFile: "",
              codeRaw: "",
              details: sanitizeDepartmentDescriptionDetails(descriptionDraft.details, name),
            },
          ],
        },
        "新建部门失败",
      );
      await onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled = !name.trim() || !code.trim() || submitting;
  const descriptionsSection = useDepartmentDescriptionsSection({
    drafts: [descriptionDraft],
    dirty: false,
    canEditDepartment: canEdit,
    onUpdateDraft: (_index, key, value) => setDescriptionDraft((prev) => ({ ...prev, [key]: value })),
  });
  const departmentInfoSection: BodySurfaceSectionSpec = createPanelSection("department-info", {
    title: "部门信息",

    sections: [
      {
        key: "fields",
        body: { kind: "form", form: {
          kind: "fields" as const,
          content: {
            layout: { columns: 2 },
            items: [
            {
              key: "code",
              label: "部门编码",
              required: true,
              spec: {
                valueType: "string" as const,
                control: "text" as const,
                mask: { kind: "editableSegment" as const, ...departmentCodeEditableSegment(level) },
                state: !canEdit ? "disabled" as const : "normal" as const,
              },
              value: code,
              onChange: (next) => setCode(String(next ?? "")),
            },
            {
              key: "name",
              label: "部门名称",
              required: true,
              spec: { valueType: "string" as const, control: "text" as const, state: !canEdit ? "disabled" as const : "normal" as const },
              value: name,
              onChange: (value) => updateDraftName(String(value ?? "")),
            },
            {
              key: "level",
              label: "部门层级",
              spec: {
                valueType: "number" as const,
                control: "choice" as const,
                state: !canEdit ? "disabled" as const : "normal" as const,
                options: {
                  source: "static" as const,
                  mode: "dropdown" as const,
                  items: [
                    { value: "1", label: "L1" },
                    { value: "2", label: "L2" },
                    { value: "3", label: "L3" },
                  ],
                },
              },
              value: String(level),
              onChange: (next) => updateLevelAndParent(Number(next) as 1 | 2 | 3, level === 1 ? null : parentId),
            },
            {
              key: "parent",
              label: "上级部门",
              spec: {
                valueType: "reference" as const,
                control: "choice" as const,
                state: !canEdit || level === 1 ? "disabled" as const : "normal" as const,
                options: { source: "static" as const, mode: "dropdown" as const, items: parentOptions },
              },
              value: parentId == null ? "" : String(parentId),
              placeholder: "无",
              onChange: (next) => {
                const nextParentId = next === "" ? null : Number(next);
                const parentLevel = nextParentId == null ? 0 : (departmentById.get(nextParentId)?.level ?? 0);
                updateLevelAndParent(Math.min(parentLevel + 1, 3) as 1 | 2 | 3, nextParentId);
              },
            },
            {
              key: "alias",
              label: "别名",
              spec: { valueType: "string" as const, control: "text" as const, state: !canEdit ? "disabled" as const : "normal" as const },
              value: alias,
              onChange: (value) => setAlias(String(value ?? "")),
            },
            ],
          },
        } },
      },
    ],
  });

  return createPanelSection("create-department", {
    title: "新建部门",
    actions: [
      { key: "cancel", label: "取消", icon: "cancel", onClick: onCancel },
      { key: "submit", label: submitting ? "保存中..." : "保存", icon: "save", variant: "primary", disabled: !canEdit || submitting || submitDisabled, onClick: () => void handleSubmit() },
    ],
    sections: [
      departmentInfoSection,
      descriptionsSection,
    ],
  });
}

export function DepartmentCreatePanel(props: DepartmentCreatePanelProps) {
  const section = useDepartmentCreatePanelSection(props);
  return (
    <PageSurface kind="standard"
      embedded
      body={createPageBody([section])}
    />
  );
}
