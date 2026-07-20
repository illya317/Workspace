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
  WORK_TASK_APPROVAL_SUBJECT,
  type WorkTaskApprovalWorkspaceTargetType,
  type WorkTaskApprovalPayload,
} from "./task-approval-helpers";
import { canProcessWorkTaskRequests } from "./task-approval-handlers";

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
  const records = rows.map((row) => {
    const dto = toDto<WorkTaskApprovalPayload>(row as ApprovalRequestRowWithEvents);
    const record = toRecord(row as ApprovalRequestRowWithEvents, dto.latestPayload);
    return { row, dto, record };
  });
  const processable = await canProcessWorkTaskRequests(userId, records.map(({ record }) => record));
  const items = records.map(({ row, dto }, index): WorkflowTodoProviderItem | null => {
    if (!processable[index]) return null;
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
  });
  return items.filter((item): item is WorkflowTodoProviderItem => Boolean(item));
}
