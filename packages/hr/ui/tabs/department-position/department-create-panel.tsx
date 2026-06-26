"use client";

import { useMemo, useState } from "react";
import { FormSurface, PageSurface } from "@workspace/core/ui";
import { DepartmentCodeInput } from "./department-code-input";
import { postJson } from "@workspace/platform/ui/api-client";
import { DepartmentDescriptionsPanel } from "./department-descriptions-panel";
import { DetailSectionHeader } from "./detail-editors";
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

export function DepartmentCreatePanel({
  departments,
  departmentById,
  onCancel,
  onCreated,
  canEdit,
}: {
  departments: Department[];
  departmentById: Map<number, Department>;
  onCancel: () => void;
  onCreated: () => void | Promise<void>;
  canEdit: boolean;
}) {
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

  const formContent = (
    <div className="space-y-3">
      <PageSurface
        embedded
        kind="detail"
        blocks={[{
          kind: "panel",
          key: "department-info",
          bodyClassName: "p-4",
          blocks: [{
            kind: "moduleView",
            key: "fields",
            view: (
              <>
                <DetailSectionHeader title="部门信息" />
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                      <span>部门编码</span>
                      <span className="text-red-500">*</span>
                    </div>
                    <DepartmentCodeInput value={code} level={level} disabled={!canEdit} onChange={setCode} />
                  </div>
                  <FormSurface
                    kind="fields"
                    columns={2}
                    className="contents"
                    bodyClassName="contents"
                    fields={[
                      {
                        key: "name",
                        label: "部门名称",
                        required: true,
                        spec: { valueType: "string", editor: "input", state: !canEdit ? "disabled" : "normal" },
                        value: name,
                        onChange: (value) => updateDraftName(String(value ?? "")),
                      },
                      {
                        key: "level",
                        label: "部门层级",
                        spec: {
                          valueType: "number",
                          editor: "select",
                          state: !canEdit ? "disabled" : "normal",
                          options: {
                            source: "static",
                            mode: "dropdown",
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
                          valueType: "reference",
                          editor: "select",
                          state: !canEdit || level === 1 ? "disabled" : "normal",
                          options: { source: "static", mode: "dropdown", items: parentOptions },
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
                        spec: { valueType: "string", editor: "input", state: !canEdit ? "disabled" : "normal" },
                        value: alias,
                        onChange: (value) => setAlias(String(value ?? "")),
                      },
                      {
                        key: "manager",
                        label: "部门负责人",
                        spec: { valueType: "string", editor: "input", state: !canEdit ? "disabled" : "normal" },
                        value: managerPositionName,
                        onChange: (value) => updateDraftManager(String(value ?? "")),
                      },
                    ]}
                  />
                </div>
              </>
            ),
          }],
        }]}
      />
      <DepartmentDescriptionsPanel
        drafts={[descriptionDraft]}
        dirty={false}
        canEditDepartment={canEdit}
        onUpdateDraft={(_index, key, value) =>
          setDescriptionDraft((prev) => ({ ...prev, [key]: value }))
        }
      />
    </div>
  );

  return (
    <PageSurface
      embedded
      kind="detail"
      blocks={[{
        kind: "panel",
        key: "create-department",
        title: "新建部门",
        actions: [
          { key: "submit", label: submitting ? "保存中..." : "保存", variant: "primary", disabled: submitting || submitDisabled, onClick: () => void handleSubmit() },
          { key: "cancel", label: "取消", disabled: submitting, onClick: onCancel },
        ],
        blocks: [{ kind: "moduleView", key: "content", view: formContent }],
      }]}
    />
  );
}
