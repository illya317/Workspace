import type { ApprovalOperation } from "@workspace/platform/server/approvals";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  commitDepartmentCollaborationApproval,
  commitDepartmentCollaborationUpdateApproval,
  validateDepartmentCollaborationApprovalPayload,
  validateDepartmentCollaborationUpdateApprovalPayload,
} from "./department-collaborations";
import type {
  DepartmentCollaborationCreateCommand,
  DepartmentCollaborationUpdateCommand,
} from "./domain/department-collaboration-validation";
import {
  getWorkTaskApprovalResourceKey,
  type WorkTaskCollaborationApprovalPayload,
} from "./task-approval-helpers";
import { workTaskScopeId } from "./task-spaces";

export async function commitCollaborationApproval(input: {
  submitterUserId: number;
  operation: ApprovalOperation;
  subjectId: string | null;
  payload: WorkTaskCollaborationApprovalPayload;
}) {
  if (input.operation === "create") {
    const data = input.payload.data as unknown as DepartmentCollaborationCreateCommand;
    return commitDepartmentCollaborationApproval({ ...data, createdByUserId: input.submitterUserId });
  }
  const collaborationId = Number(input.subjectId);
  if (!Number.isInteger(collaborationId) || collaborationId <= 0) return serviceError("审批单缺少协作事项 ID", 400);
  const data = input.payload.data as unknown as DepartmentCollaborationUpdateCommand;
  return commitDepartmentCollaborationUpdateApproval({
    ...data,
    collaborationId,
    updatedByUserId: input.submitterUserId,
  });
}

export async function validateCollaborationApprovalPayload(input: {
  operation: ApprovalOperation;
  subjectId?: string | null;
  payload: WorkTaskCollaborationApprovalPayload;
}) {
  const command = input.operation === "create"
    ? await validateDepartmentCollaborationApprovalPayload(input.payload.data)
    : await validateDepartmentCollaborationUpdateApprovalPayload(input.subjectId, input.payload.data);
  if (!command.ok) return serviceError(command.issue.message, command.issue.status || 400);
  if (input.payload.targetType !== "department" || input.payload.targetId !== command.data.responsibleDepartmentId) {
    return serviceError("部门协作必须由负责部门提交", 400);
  }
  return serviceOk({
    resourceKey: getWorkTaskApprovalResourceKey("department"),
    scopeId: workTaskScopeId("department", command.data.responsibleDepartmentId),
    subjectId: input.operation === "update" ? String((command.data as DepartmentCollaborationUpdateCommand).collaborationId) : null,
    businessActionKey: "work.tasks.collaboration.submit",
    workflowScopeType: "department" as const,
    flowType: "approval" as const,
    separationPolicy: "auto_pass_if_authorized" as const,
    payload: {
      entityType: "collaboration" as const,
      targetType: "department" as const,
      targetId: command.data.responsibleDepartmentId,
      data: command.data as unknown as Record<string, unknown>,
    },
  });
}
