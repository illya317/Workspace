"use client";

import { useMemo, useState } from "react";
import { PageSurface, createCreatePanelBlock, createPanelBlock, type PageSurfaceBlockSpec } from "@workspace/core/ui";
import { departmentCodeEditableSegment } from "./department-code-input";
import { postJson } from "@workspace/platform/ui/api-client";
import { useDepartmentDescriptionsBlock } from "./department-descriptions-panel";
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

export function useDepartmentCreatePanelBlock({
  departments,
  departmentById,
  onCancel,
  onCreated,
  canEdit,
}: DepartmentCreatePanelProps): PageSurfaceBlockSpec {
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [managerPositionName, setManagerPositionName] = useState("");
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [parentId, setParentId] = useState<number | null>(null);
  const [code, setCode] = useState(() => deriveCreateCode(1, null, departmentById));
  const [descriptionDraft, setDescriptionDraft] = useState<DepartmentDescriptionDraft>({
    id: null,
    code,
    name: "",
    sourceFile: "",
    codeRaw: "",
    details: JSON.stringify({ "基本信息": { "部门名称": "", "负责人": "" } }, null, 2),
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
      details: sanitizeDepartmentDescriptionDetails(prev.details, nextName, managerPositionName),
    }));
  }

  function updateDraftManager(nextManager: string) {
    setManagerPositionName(nextManager);
    setDescriptionDraft((prev) => ({
      ...prev,
      details: sanitizeDepartmentDescriptionDetails(prev.details, name, nextManager),
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
              details: sanitizeDepartmentDescriptionDetails(descriptionDraft.details, name, managerPositionName),
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
  const descriptionsBlock = useDepartmentDescriptionsBlock({
    drafts: [descriptionDraft],
    dirty: false,
    canEditDepartment: canEdit,
    onUpdateDraft: (_index, key, value) => setDescriptionDraft((prev) => ({ ...prev, [key]: value })),
  });
  const departmentInfoBlock: PageSurfaceBlockSpec = createPanelBlock("department-info", {
    title: "部门信息",
    bodyClassName: "p-4",
    blocks: [
      {
        kind: "form" as const,
        key: "fields",
        surface: {
          kind: "fields" as const,
          columns: 2 as const,
          bodyClassName: "contents",
          fields: [
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
            {
              key: "manager",
              label: "部门负责人",
              spec: { valueType: "string" as const, control: "text" as const, state: !canEdit ? "disabled" as const : "normal" as const },
              value: managerPositionName,
              onChange: (value) => updateDraftManager(String(value ?? "")),
            },
          ],
        },
      },
    ],
  });

  return createCreatePanelBlock("create-department", {
    title: "新建部门",
    creating: true,
    canCreate: canEdit,
    submitting,
    submitDisabled,
    submitLabel: "保存",
    onStartCreate: () => undefined,
    onSubmit: () => void handleSubmit(),
    onCancel,
    createContent: (
      <PageSurface
        embedded
        kind="detail"
        blocks={[
          departmentInfoBlock,
          descriptionsBlock,
        ]}
      />
    ),
    children: null,
  });
}

export function DepartmentCreatePanel(props: DepartmentCreatePanelProps) {
  const block = useDepartmentCreatePanelBlock(props);
  return (
    <PageSurface
      embedded
      kind="detail"
      blocks={[block]}
    />
  );
}
