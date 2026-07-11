import {
  registerWorkflowTodoProvider,
  type WorkflowTodoProviderItem,
} from "@workspace/platform/server/workflow-todo-providers";
import { prisma } from "@workspace/platform/server/prisma";
import {
  requestInclude,
  toDto,
  toRecord,
  type ApprovalRequestRowWithEvents,
} from "@workspace/platform/server/approvals/serialization";
import {
  getWorkTaskApprovalResourceKey,
  approvalEntityType,
  approvalSummary,
  approvalTitle,
  workApprovalRequestHref,
  type WorkTaskApprovalWorkspaceTargetType,
  type WorkTaskApprovalPayload,
} from "./task-approval-helpers";
import { canProcessWorkTaskRequest } from "./task-approval-handlers";
import { WORK_TASK_APPROVAL_SUBJECT } from "./task-approval-adapter";

let registered = false;

export function registerWorkWorkflowTodoProvider() {
  if (registered) return;
  registerWorkflowTodoProvider({
    handles: (input) => WORK_TASK_APPROVAL_RESOURCE_KEYS.has(input.resourceKey ?? ""),
    list: listProcessableWorkTaskTodos,
  });
  registered = true;
}

const WORK_TASK_APPROVAL_RESOURCE_KEYS = new Set(
  (["company", "committee", "department", "personal", "project"] as const satisfies readonly WorkTaskApprovalWorkspaceTargetType[])
    .map((targetType) => getWorkTaskApprovalResourceKey(targetType)),
);

async function listProcessableWorkTaskTodos(userId: number): Promise<WorkflowTodoProviderItem[]> {
  const rows = await prisma.approvalRequest.findMany({
    where: {
      subjectType: WORK_TASK_APPROVAL_SUBJECT,
      status: "submitted",
    },
    include: requestInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  const items = await Promise.all(rows.map(async (row): Promise<WorkflowTodoProviderItem | null> => {
    const dto = toDto<WorkTaskApprovalPayload>(row as ApprovalRequestRowWithEvents);
    const record = toRecord(row as ApprovalRequestRowWithEvents, dto.latestPayload);
    if (!(await canProcessWorkTaskRequest(userId, record))) return null;
    const entityType = approvalEntityType(dto.latestPayload);
    const summary = approvalSummary(dto.latestPayload) || `审批单 #${dto.id}`;
    return {
      requestId: dto.id,
      businessActionKey: dto.businessActionKey,
      flowType: dto.flowType,
      status: "submitted",
      title: approvalTitle(dto.operation, entityType),
      summary,
      href: workApprovalRequestHref(dto.latestPayload, dto.id),
      eventType: "submit",
      resourceKey: dto.resourceKey,
      scopeId: dto.scopeId,
      createdAt: row.submittedAt ?? row.updatedAt ?? row.createdAt,
      actor: {
        id: dto.submitterUserId,
        name: dto.submitterName || "",
        avatar: null,
      },
    } satisfies WorkflowTodoProviderItem;
  }));
  return items.filter((item): item is WorkflowTodoProviderItem => Boolean(item));
}
