import { guardedDelete, type DeleteGuardResult, type DeleteReferenceGuard } from "@workspace/platform/server/delete-guard";
import { prisma } from "@workspace/platform/server/prisma";
import { validateWorkItemDeleteCommand } from "./domain/work-item-validation";

export async function archiveWorkItem(workId: number, actorUserId: number): Promise<DeleteGuardResult> {
  const command = validateWorkItemDeleteCommand(workId);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  return guardedDelete({
    entityType: "WorkItem",
    modelKey: "workItem",
    id: command.data.workId,
    userId: actorUserId,
    actionLabel: "归档工作项",
    deleteMode: "archive",
    references: workItemArchiveReferences(command.data.workId),
    referencePolicy: "checked",
  });
}

export async function restoreArchivedWorkItem(workId: number): Promise<DeleteGuardResult> {
  const command = validateWorkItemDeleteCommand(workId);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  const result = await prisma.workItem.updateMany({
    where: { id: command.data.workId, isArchived: true },
    data: { isArchived: false },
  });
  return result.count > 0
    ? { ok: true, data: { success: true, id: command.data.workId } }
    : { ok: false, error: "待恢复工作项不存在或尚未归档", status: 404 };
}

function workItemArchiveReferences(workId: number): DeleteReferenceGuard[] {
  return [
    {
      label: "子工作项",
      count: (tx) => tx.workItem.count({ where: { parentWorkItemId: workId } }),
      policy: "block",
    },
    {
      label: "跨周期上级关系",
      count: (tx) => tx.workItem.count({ where: { parentPeriodWorkItemId: workId } }),
      policy: "block",
    },
    {
      label: "跨周期前序关系",
      count: (tx) => tx.workItem.count({ where: { previousPeriodWorkItemId: workId } }),
      policy: "block",
    },
  ];
}
