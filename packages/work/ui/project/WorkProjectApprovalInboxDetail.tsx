"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  BodySurface,
  createFieldsSection,
  createPageBody,
  createSectionSection,
  createStatusSection,
  useFeedback,
  type FormSurfaceItemSpec,
} from "@workspace/core/ui";
import {
  actionRuntimeCommands,
  getWorkflowStatusLabel,
  workflowActionSurfaceActions,
  workflowRequestTimelineSectionSpec,
} from "@workspace/platform/ui";
import { resolveActionRuntime } from "@workspace/platform/workflow-action-runtime";

type ProjectApprovalRequest = {
  id: number;
  businessActionKey: string;
  status: "draft" | "submitted" | "committing" | "withdrawn" | "rejected" | "approved" | "cancelled";
  submitterUserId: number;
  submitterName: string;
  handlerCanRevise: boolean;
  requestCanWithdraw: boolean;
  requestCanResubmit: boolean;
  requestCanCancel: boolean;
  requestCanRevise: boolean;
  version: number;
  canProcess?: boolean;
  latestPayload: {
    data: {
      name: string;
      description?: string | null;
      projectType: "company" | "department" | "other";
      projectLevel?: string | null;
      leadingDepartmentId?: number | null;
      enablingDepartmentIds?: number[] | null;
      workspaceEnabled?: boolean | null;
      plannedStartDate?: string | null;
      plannedEndDate?: string | null;
      members?: Array<{ employeeId: number; role: string }> | null;
    };
  };
  departments: Array<{ id: number; name: string; code: string }>;
  employees: Array<{ id: number; name: string; employeeId: string }>;
  events: Array<{ id: number; eventType: string; actorName: string; comment: string | null; createdAt: string }>;
};

export default function WorkProjectApprovalInboxDetail({
  requestId,
  currentUserId,
  onChanged,
  onBack,
}: {
  requestId: number;
  currentUserId: number;
  onChanged: () => void;
  onBack?: () => void;
}) {
  const feedback = useFeedback();
  const [request, setRequest] = useState<ProjectApprovalRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/work/projects/submissions/${requestId}`));
      const data = await response.json().catch(() => ({})) as { request?: ProjectApprovalRequest; error?: string };
      if (!response.ok || !data.request) throw new Error(data.error || "加载项目确认单失败");
      setRequest(data.request);
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "加载项目确认单失败");
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [feedback, requestId]);

  useEffect(() => { void load(); }, [load]);

  const runAction = useCallback(async (action: "approve" | "reject") => {
    if (!request) return;
    setSaving(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/work/projects/submissions/${request.id}/${action}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: request.version, comment: comment.trim() || null }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "项目确认失败");
      feedback.success(action === "approve" ? "已确认项目赋能" : "已驳回项目赋能");
      setComment("");
      await load();
      onChanged();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "项目确认失败");
    } finally {
      setSaving(false);
    }
  }, [comment, feedback, load, onChanged, request]);

  const submitComment = useCallback(async () => {
    if (!request || !comment.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(workspacePath(`/api/modules/work/projects/submissions/${request.id}/comment`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: request.version, comment: comment.trim() }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "评论失败");
      feedback.success("评论已提交");
      setComment("");
      await load();
      onChanged();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "评论失败");
    } finally {
      setSaving(false);
    }
  }, [comment, feedback, load, onChanged, request]);

  const actionItems = useMemo(() => {
    if (!request) return [];
    const runtime = resolveActionRuntime({
      businessActionKey: request.businessActionKey,
      workflowPolicyMode: "required",
      workflowWhenDisabled: "unavailable",
      actor: { userId: currentUserId, canProcessWorkflow: request.canProcess === true },
      request: {
        id: request.id,
        status: request.status,
        submitterUserId: request.submitterUserId,
        handlerCanRevise: request.handlerCanRevise,
        requestCanWithdraw: request.requestCanWithdraw,
        requestCanResubmit: request.requestCanResubmit,
        requestCanCancel: request.requestCanCancel,
        requestCanRevise: request.requestCanRevise,
      },
    });
    return workflowActionSurfaceActions(actionRuntimeCommands(runtime, {
      "workflow.request.approve": { disabled: saving, onClick: () => void runAction("approve") },
      "workflow.request.reject": { disabled: saving, onClick: () => void runAction("reject") },
    }));
  }, [currentUserId, request, runAction, saving]);

  const body = createPageBody(loading && !request
    ? [createStatusSection("project-approval-loading", { kind: "loading", content: "加载项目确认单中..." })]
    : !request
      ? [createStatusSection("project-approval-empty", { kind: "empty", content: "这条项目确认已处理或不可访问。" })]
      : [createSectionSection("project-approval", {
          title: "项目赋能确认",
          actions: onBack ? [{ key: "back", label: "返回列表", icon: "back", onClick: onBack }] : undefined,
          sections: [
            createFieldsSection("project-approval-fields", projectFields(request), { kind: "detail", layout: { columns: 3 } }),
            createFieldsSection("project-approval-actions", [], { actions: actionItems }),
            workflowRequestTimelineSectionSpec("project-approval-events", request.events.map((event) => ({
              id: event.id,
              actor: event.actorName,
              type: eventLabel(event.eventType),
              at: new Date(event.createdAt).toLocaleString("zh-CN", { hour12: false }),
              comment: event.comment || undefined,
            }))),
            createFieldsSection("project-approval-comment", [{
              key: "comment",
              label: "确认意见",
              spec: { valueType: "string", control: "text", multiline: true, state: saving || request.status !== "submitted" ? "disabled" : "normal" },
              value: comment,
              placeholder: "填写确认意见或驳回原因",
              onChange: (value) => setComment(String(value ?? "")),
              span: "wide",
            }], {
              layout: { columns: 1 },
              actions: [{ key: "comment", action: "send", label: "评论", disabled: saving || !comment.trim() || request.status !== "submitted", onClick: () => void submitComment() }],
            }),
          ],
        })]);

  return <BodySurface {...body} />;
}

function projectFields(request: ProjectApprovalRequest): FormSurfaceItemSpec[] {
  const data = request.latestPayload.data;
  const departmentById = new Map(request.departments.map((department) => [department.id, department]));
  const employeeById = new Map(request.employees.map((employee) => [employee.id, employee]));
  const enabling = (data.enablingDepartmentIds ?? []).map((id) => departmentById.get(id)?.name ?? String(id)).join("、") || "-";
  const members = (data.members ?? []).map((member) => `${member.role}：${employeeById.get(member.employeeId)?.name ?? member.employeeId}`).join("；") || "未设置";
  return [
    readonly("status", "状态", getWorkflowStatusLabel(request.status)),
    readonly("submitter", "发起人", request.submitterName),
    readonly("name", "项目名称", data.name),
    readonly("type", "项目类型", projectTypeLabel(data.projectType)),
    readonly("level", "项目级别", data.projectLevel || "普通"),
    readonly("leading", "归口部门", data.leadingDepartmentId ? departmentById.get(data.leadingDepartmentId)?.name ?? String(data.leadingDepartmentId) : "-"),
    readonly("enabling", "赋能部门", enabling, "wide"),
    readonly("workspace", "项目空间", data.workspaceEnabled ? "开启" : "关闭"),
    readonly("period", "计划周期", [data.plannedStartDate, data.plannedEndDate].filter(Boolean).join(" 至 ") || "-"),
    readonly("members", "项目人员", members, "wide"),
    readonly("description", "项目描述", data.description || "-", "wide"),
  ];
}

function readonly(key: string, label: string, value: string, span?: "wide"): FormSurfaceItemSpec {
  return { kind: "readonly", key, label, value, span };
}

function projectTypeLabel(value: string) {
  if (value === "company") return "公司项目";
  if (value === "other") return "其他项目";
  return "部门项目";
}

function eventLabel(value: string) {
  if (value === "create_draft") return "创建申请";
  if (value === "submit") return "提交确认";
  if (value === "approve") return "确认";
  if (value === "reject") return "驳回";
  if (value === "comment") return "评论";
  if (value === "commit_failed") return "创建项目失败";
  return value;
}
