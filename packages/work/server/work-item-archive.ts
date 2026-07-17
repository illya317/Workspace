import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { runSerializableTransaction } from "@workspace/platform/server/serializable-transaction";

import { validateWorkItemRestore } from "./domain/work-completion-policy";
import { validateWorkItemDeleteCommand } from "./domain/work-item-validation";
import {
  buildAuditedWorkMutationImpactEngine,
  mutationImpactServiceError,
  workItemMutationRoot,
  type WorkMutationImpactContext,
} from "./work-mutation-impact";

type WorkItemLifecycleIntent = "archive" | "restore" | "delete";
type WorkItemLifecycleResult = DomainServiceResult<{ success: true; id: number }>;

class WorkItemRevisionConflictError extends Error {}

export async function archiveWorkItem(workId: number, actorUserId: number): Promise<WorkItemLifecycleResult> {
  const command = validateWorkItemDeleteCommand(workId);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  return executeWorkItemLifecycle({ workId: command.data.workId, actorUserId, intent: "archive" });
}

export async function restoreArchivedWorkItem(workId: number, actorUserId: number): Promise<WorkItemLifecycleResult> {
  const command = validateWorkItemDeleteCommand(workId);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  return executeWorkItemLifecycle({ workId: command.data.workId, actorUserId, intent: "restore" });
}

export async function deleteWorkItemRecord(workId: number, actorUserId: number): Promise<WorkItemLifecycleResult> {
  const command = validateWorkItemDeleteCommand(workId);
  if (!command.ok) return { ok: false, error: command.issue.message, status: command.issue.status };
  return executeWorkItemLifecycle({ workId: command.data.workId, actorUserId, intent: "delete" });
}

async function executeWorkItemLifecycle(input: {
  workId: number;
  actorUserId: number;
  intent: WorkItemLifecycleIntent;
}): Promise<WorkItemLifecycleResult> {
  try {
    return await runSerializableTransaction(async (tx) => {
      const item = await tx.workItem.findUnique({
        where: { id: input.workId },
        select: {
          id: true, content: true, updatedAt: true, status: true, isArchived: true,
          planId: true, parentWorkItemId: true, targetType: true, targetId: true,
        },
      });
      if (!item) return { ok: false as const, error: "工作项不存在", status: 404 };
      const lifecycleError = lifecycleStateError(item.isArchived, input.intent);
      if (lifecycleError) return lifecycleError;
      if (input.intent === "restore") {
        const restoreError = await validateWorkItemRestore(tx, item.id);
        if (restoreError) return { ok: false as const, error: restoreError, status: 409 };
      }

      const context: WorkMutationImpactContext = {
        tx,
        actorUserId: input.actorUserId,
        scopeType: item.targetType,
        scopeId: String(item.targetId),
      };
      const result = await buildAuditedWorkMutationImpactEngine(context).execute({
        context,
        actorKey: `user:${input.actorUserId}`,
        scopeKey: `${item.targetType}:${item.targetId}`,
        root: workItemMutationRoot({ item, intent: input.intent }),
        commitRoot: async () => {
          const changed = input.intent === "delete"
            ? await tx.workItem.deleteMany({ where: { id: item.id, updatedAt: item.updatedAt } })
            : await tx.workItem.updateMany({
              where: { id: item.id, updatedAt: item.updatedAt },
              data: { isArchived: input.intent === "archive" },
            });
          if (changed.count !== 1) throw new WorkItemRevisionConflictError();
          return { success: true as const, id: item.id };
        },
      });
      return { ok: true as const, data: result };
    });
  } catch (error) {
    if (error instanceof WorkItemRevisionConflictError) {
      return { ok: false, error: "工作项已被其他人修改，请刷新后重试", status: 409 };
    }
    const impactError = mutationImpactServiceError(error);
    if (impactError) return impactError;
    throw error;
  }
}

function lifecycleStateError(isArchived: boolean, intent: WorkItemLifecycleIntent): WorkItemLifecycleResult | null {
  if (intent === "archive" && isArchived) {
    return { ok: false, error: "不能归档工作项，目标记录已归档", status: 409 };
  }
  if (intent === "restore" && !isArchived) {
    return { ok: false, error: "待恢复工作项不存在或尚未归档", status: 404 };
  }
  if (intent === "delete" && isArchived) {
    return { ok: false, error: "不能删除工作项，目标记录已归档", status: 409 };
  }
  return null;
}
