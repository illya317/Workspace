"use client";

import { useEffect, useState } from "react";
import {
  type BodySurfaceBadgeSpec,
  type BodySurfaceSectionSpec,
  type FormSurfaceReadOnlyFieldSpec,
  type PageSurfaceTabBarSpec,
  createPanelSection,
} from "@workspace/core/ui";
import { postJson, putJson, requestJson } from "@workspace/platform/ui/api-client";
import type { ApprovalRequestViewDto } from "@workspace/platform";
import { createDepartmentDescriptionDetailsSections } from "@workspace/platform/ui/organization-units";
import {
  formatWorkflowDateTime,
  getWorkflowStatusLabel,
  getWorkflowStatusTone,
  useWorkflowRequestsSection,
  WorkflowRequestsPage,
  type WorkflowRequestPayloadSectionsContext,
} from "@workspace/platform/ui/workflow";
import { departmentCodeEditableSegment } from "./department-code-input";
import { sanitizeDepartmentDescriptionDetails } from "./draft-utils";
import type { Department, DepartmentDescriptionDraft } from "./types";
import { canUseDepartmentAsParentForHierarchy } from "./utils";
import { useTenantConfig } from "@workspace/platform/ui/tenant-config";

const HR_DEPARTMENT_WORKFLOW_ENDPOINT = "/api/modules/hr/roster/submissions";

export type HrDepartmentWorkflowPayload = {
  entityType: "department";
  departmentId: number | null;
  data: Record<string, unknown>;
};

export type HrDepartmentWorkflowRequest = ApprovalRequestViewDto<HrDepartmentWorkflowPayload>;

export async function createHrDepartmentWorkflowDraft(input: {
  operation: "create" | "update";
  departmentId?: number | null;
  payload: Record<string, unknown>;
  comment?: string | null;
}) {
  return postJson<{ request: HrDepartmentWorkflowRequest }>(
    HR_DEPARTMENT_WORKFLOW_ENDPOINT,
    input,
    "创建组织流程草稿失败",
  );
}

export async function submitHrDepartmentWorkflowDraft(id: number, version?: number | null, comment?: string | null) {
  return postJson<{ request: HrDepartmentWorkflowRequest }>(
    `${HR_DEPARTMENT_WORKFLOW_ENDPOINT}/${id}/submit`,
    { version, comment },
    "提交组织流程失败",
  );
}

export async function updateHrDepartmentWorkflowDraft(
  id: number,
  payload: Record<string, unknown>,
  version?: number | null,
  comment?: string | null,
) {
  return putJson<{ request: HrDepartmentWorkflowRequest }>(
    `${HR_DEPARTMENT_WORKFLOW_ENDPOINT}/${id}`,
    { payload, version, comment },
    "保存处理修改失败",
  );
}

export async function createAndSubmitHrDepartmentWorkflow(input: {
  operation: "create" | "update";
  departmentId?: number | null;
  payload: Record<string, unknown>;
  comment?: string | null;
}) {
  const draft = await createHrDepartmentWorkflowDraft(input);
  return submitHrDepartmentWorkflowDraft(draft.request.id, draft.request.version, input.comment ?? null);
}

export function HrDepartmentWorkflowPage({
  currentUserId,
  navigation,
  notify,
}: {
  currentUserId: number;
  navigation?: PageSurfaceTabBarSpec;
  notify: (toast: { message: string; type: "success" | "error" }) => void;
}) {
  const operatingCommitteeCode = useTenantConfig().organization.operatingCommittee.departmentCode;
  const [departments, setDepartments] = useState<Department[]>([]);
  useEffect(() => {
    let mounted = true;
    void requestJson<{ departments?: Department[] }>("/api/modules/hr/roster/departments?pageSize=500", {
      fallbackMessage: "加载组织列表失败",
    }).then((data) => {
      if (mounted) setDepartments(data.departments ?? []);
    }).catch(() => {
      if (mounted) setDepartments([]);
    });
    return () => { mounted = false; };
  }, []);
  return (
    <WorkflowRequestsPage<HrDepartmentWorkflowRequest>
      {...hrDepartmentWorkflowPanelProps({ currentUserId, notify, departments, operatingCommitteeCode })}
      navigation={navigation}
    />
  );
}

export function useHrDepartmentWorkflowSection({
  currentUserId,
  selectedDepartmentId,
  reloadData,
  notify,
}: {
  currentUserId: number;
  selectedDepartmentId?: number | null;
  reloadData: () => Promise<void>;
  notify: (toast: { message: string; type: "success" | "error" }) => void;
}): BodySurfaceSectionSpec {
  const operatingCommitteeCode = useTenantConfig().organization.operatingCommittee.departmentCode;
  return useWorkflowRequestsSection<HrDepartmentWorkflowRequest>({
    ...hrDepartmentWorkflowPanelProps({ currentUserId, notify, onCommitted: reloadData, operatingCommitteeCode }),
    filterRequests: (requests) => {
      if (!selectedDepartmentId) return requests;
      const related = requests.filter((request) => (
        request.latestPayload.departmentId === selectedDepartmentId ||
        request.subjectId === String(selectedDepartmentId)
      ));
      return related.length ? related : requests.filter((request) => request.status === "submitted");
    },
    emptyText: "暂无组织流程记录",
  });
}

function hrDepartmentWorkflowPanelProps({
  currentUserId,
  notify,
  onCommitted,
  departments = [],
  operatingCommitteeCode,
}: {
  currentUserId: number;
  notify: (toast: { message: string; type: "success" | "error" }) => void;
  onCommitted?: () => void | Promise<void>;
  departments?: Department[];
  operatingCommitteeCode: string;
}) {
  return {
    endpoint: HR_DEPARTMENT_WORKFLOW_ENDPOINT,
    title: "流程记录",
    emptyText: "暂无组织流程记录",
    currentUserId,
    notify,
    onCommitted,
    requestBadges,
    requestFields,
    canEditPayload: (request: HrDepartmentWorkflowRequest) => canEditDepartmentWorkflowPayload(request, currentUserId),
    payloadValue: (request: HrDepartmentWorkflowRequest) => ({ ...request.latestPayload.data }),
    payloadText: (request: HrDepartmentWorkflowRequest) => JSON.stringify(request.latestPayload.data, null, 2),
    requestPayloadSections: departmentWorkflowPayloadSections({ departments, operatingCommitteeCode }),
    updateBody: (request: HrDepartmentWorkflowRequest, data: Record<string, unknown>) => ({
      payload: data,
      version: request.version,
    }),
  };
}

function canEditDepartmentWorkflowPayload(request: HrDepartmentWorkflowRequest, currentUserId: number) {
  const isSubmitter = request.submitterUserId === currentUserId;
  if (request.status === "submitted" && request.canProcess === true && request.handlerCanRevise) return true;
  return isSubmitter && request.requestCanWithdraw && (
    request.status === "draft" ||
    request.status === "withdrawn" ||
    (request.status === "rejected" && request.requestCanResubmit)
  );
}

function departmentWorkflowPayloadSections({
  departments,
  operatingCommitteeCode,
}: {
  departments: Department[];
  operatingCommitteeCode: string;
}) {
  return ({
    value,
    editable,
    saving,
    onChange,
    onSave,
  }: WorkflowRequestPayloadSectionsContext<HrDepartmentWorkflowRequest>): BodySurfaceSectionSpec[] => {
    const draft = normalizeDepartmentPayload(value);
    const fieldState = editable && !saving ? "normal" as const : "disabled" as const;
    const parentOptions = [
      { value: "", label: "无" },
      ...departments
        .filter((department) => canUseDepartmentAsParentForHierarchy({
          candidate: department,
          hierarchyKind: draft.hierarchyKind,
          level: draft.level,
          operatingCommitteeCode,
        }))
        .map((department) => ({ value: String(department.id), label: `${department.name}（${department.code}）` })),
    ];
    const updateField = (key: string, nextValue: unknown) => onChange({ ...value, [key]: nextValue });
    const updateName = (nextName: string) => onChange(withDepartmentDescriptionName({ ...value, name: nextName }, nextName));
    const descriptionDrafts = departmentDescriptionDrafts(value);
    return [
      createPanelSection("department-workflow-payload", {
      sections: [{
        key: "department-workflow-payload-fields",
        body: { kind: "form", form: {
          kind: "fields",
          header: { title: "组织信息" },
          actions: editable ? [{
            key: "save-payload-update",
            action: "save",
            label: saving ? "保存中..." : "保存处理修改",
            disabled: saving,
            onClick: onSave,
          }] : undefined,
          content: {
            layout: { columns: 2 },
            items: [
              {
                key: "hierarchyKind",
                label: "组织体系",
                spec: {
                  valueType: "string",
                  control: "choice",
                  state: fieldState,
                  options: {
                    source: "static",
                    items: [
                      { value: "G", label: "治理" },
                      { value: "M", label: "管理" },
                    ],
                  },
                },
                value: draft.hierarchyKind,
                onChange: (next) => updateField("hierarchyKind", next === "G" ? "G" : "M"),
              },
              {
                key: "code",
                label: "组织编码",
                required: true,
                spec: {
                  valueType: "string",
                  control: "text",
                  mask: { kind: "editableSegment", ...departmentCodeEditableSegment(draft.level, draft.hierarchyKind) },
                  state: fieldState,
                },
                value: draft.code,
                onChange: (next) => updateField("code", String(next ?? "")),
              },
              {
                key: "name",
                label: "组织名称",
                required: true,
                spec: { valueType: "string", control: "text", state: fieldState },
                value: draft.name,
                onChange: (next) => updateName(String(next ?? "")),
              },
              {
                key: "level",
                label: "组织层级",
                spec: {
                  valueType: "number",
                  control: "choice",
                  state: fieldState,
                  options: {
                    source: "static",
                    items: [
                      { value: "1", label: `${draft.hierarchyKind}1` },
                      { value: "2", label: `${draft.hierarchyKind}2` },
                      { value: "3", label: `${draft.hierarchyKind}3` },
                    ],
                  },
                },
                value: String(draft.level),
                onChange: (next) => updateField("level", normalizeLevel(next)),
              },
              {
                key: "parentId",
                label: "上级组织",
                spec: {
                  valueType: "reference",
                  control: "choice",
                  state: fieldState,
                  options: { source: "static", items: parentOptions },
                },
                value: draft.parentId == null ? "" : String(draft.parentId),
                placeholder: "无",
                onChange: (next) => updateField("parentId", next === "" ? null : Number(next)),
              },
              {
                key: "alias",
                label: "别名",
                spec: { valueType: "string", control: "text", state: fieldState },
                value: draft.alias,
                onChange: (next) => updateField("alias", String(next ?? "")),
              },
            ],
          },
        } },
      }],
    }),
    createPanelSection("department-workflow-descriptions", {
      title: "部门说明书",
      sections: descriptionDrafts.map((description, index) => createPanelSection(`department-workflow-description-${index}`, {
        title: description.name || `部门说明书 ${index + 1}`,
        sections: createDepartmentDescriptionDetailsSections({
          value: description.details,
          disabled: !editable || saving,
          confirmDelete: async () => true,
          onChange: (nextDetails) => onChange(withDepartmentDescriptionDetails(value, index, nextDetails)),
        }),
      })),
    }),
    ];
  };
}

function normalizeDepartmentPayload(value: Record<string, unknown>) {
  const hierarchyKind = value.hierarchyKind === "G" ? "G" as const : "M" as const;
  return {
    hierarchyKind,
    level: normalizeLevel(value.level),
    parentId: typeof value.parentId === "number" ? value.parentId : value.parentId ? Number(value.parentId) : null,
    code: String(value.code ?? ""),
    name: String(value.name ?? ""),
    alias: String(value.alias ?? ""),
  };
}

function normalizeLevel(value: unknown): 1 | 2 | 3 {
  const next = Number(value);
  return next === 2 || next === 3 ? next : 1;
}

function departmentDescriptionDrafts(value: Record<string, unknown>): DepartmentDescriptionDraft[] {
  const descriptions = Array.isArray(value.descriptions) ? value.descriptions : [];
  const drafts = descriptions
    .map((description, index) => normalizeDepartmentDescriptionDraft(description, index, value))
    .filter((description): description is DepartmentDescriptionDraft => Boolean(description));
  return drafts.length > 0 ? drafts : [normalizeDepartmentDescriptionDraft({}, 0, value) as DepartmentDescriptionDraft];
}

function normalizeDepartmentDescriptionDraft(
  description: unknown,
  index: number,
  value: Record<string, unknown>,
): DepartmentDescriptionDraft | null {
  const source = description && typeof description === "object" && !Array.isArray(description)
    ? description as Record<string, unknown>
    : {};
  const name = String(value.name ?? source.name ?? "");
  return {
    id: typeof source.id === "number" ? source.id : null,
    code: String(value.code ?? source.code ?? ""),
    name,
    sourceFile: String(source.sourceFile ?? ""),
    codeRaw: String(source.codeRaw ?? ""),
    details: normalizeDepartmentDescriptionDetails(source.details, name),
  };
}

function normalizeDepartmentDescriptionDetails(details: unknown, name: string) {
  const raw = typeof details === "string"
    ? details
    : details && typeof details === "object"
      ? JSON.stringify(details, null, 2)
      : JSON.stringify({ "基本信息": { "部门名称": name } }, null, 2);
  return sanitizeDepartmentDescriptionDetails(raw, name);
}

function withDepartmentDescriptionName(value: Record<string, unknown>, name: string) {
  const descriptions = departmentDescriptionDrafts(value).map((description) => ({
    ...description,
    name,
    details: sanitizeDepartmentDescriptionDetails(description.details, name),
  }));
  return { ...value, descriptions };
}

function withDepartmentDescriptionDetails(value: Record<string, unknown>, index: number, details: string) {
  const descriptions = Array.isArray(value.descriptions) ? [...value.descriptions] : [];
  const current = departmentDescriptionDrafts(value)[index] ?? departmentDescriptionDrafts(value)[0];
  descriptions[index] = { ...current, details };
  return { ...value, descriptions };
}

function requestFields(request: HrDepartmentWorkflowRequest): FormSurfaceReadOnlyFieldSpec[] {
  return [
    readonlyField("operation", "类型", request.operation === "create" ? "创建组织" : "更新组织"),
    readonlyField("status", "状态", getWorkflowStatusLabel(request.status, request.flowType)),
    readonlyField("submitter", "发起人", request.submitterName),
    readonlyField("version", "版本", `v${request.version}`),
    readonlyField("department", "组织", requestDetail(request)),
    readonlyField("updatedAt", "更新时间", formatWorkflowDateTime(request.updatedAt)),
  ];
}

function requestBadges(request: HrDepartmentWorkflowRequest): BodySurfaceBadgeSpec[] {
  return [
    { key: "status", label: getWorkflowStatusLabel(request.status, request.flowType), tone: getWorkflowStatusTone(request.status) },
    { key: "operation", label: request.operation === "create" ? "新建" : "修改", tone: "muted" },
  ];
}

function requestDetail(request: HrDepartmentWorkflowRequest) {
  return String(request.latestPayload.data.name || request.latestPayload.data.code || request.latestPayload.departmentId || "-");
}

function readonlyField(key: string, label: string, value: string): FormSurfaceReadOnlyFieldSpec {
  return { kind: "readonly", key, label, value };
}
