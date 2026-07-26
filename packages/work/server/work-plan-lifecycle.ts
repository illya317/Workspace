import type { ImpactResolutionInput, MutationIntent } from "@workspace/platform/mutation-impact-contract";
import type { DomainServiceResult } from "@workspace/platform/server/domain-validation";
import { runSerializableTransaction } from "@workspace/platform/server/serializable-transaction";
import { validateWorkPlanCommand } from "./domain/work-plan-validation";
import {
  buildAuditedWorkMutationImpactEngine,
  mutationImpactServiceError,
  resolveWorkPlanArchiveSource,
  workMutationRoot,
  type WorkMutationImpactContext,
} from "./work-mutation-impact";

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function archiveWorkPlan(
  planId: number,
  actorUserId: number,
  confirmation?: ImpactResolutionInput,
): Promise<DomainServiceResult<{ success: true }>> {
  const guard = validateWorkPlanCommand("archiveWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const id = positiveId(planId);
  if (!id) return { ok: false, error: "工作计划 ID 无效", status: 400 };
  return executeWorkPlanLifecycle({ id, actorUserId, confirmation, operation: "toggle_archive" });
}

export async function deleteWorkPlan(
  planId: number,
  actorUserId: number,
  confirmation?: ImpactResolutionInput,
): Promise<DomainServiceResult<{ success: true }>> {
  const guard = validateWorkPlanCommand("deleteWorkPlan");
  if (!guard.ok) return { ok: false, error: guard.issue.message, status: guard.issue.status };
  const id = positiveId(planId);
  if (!id) return { ok: false, error: "工作计划 ID 无效", status: 400 };
  return executeWorkPlanLifecycle({ id, actorUserId, confirmation, operation: "delete" });
}

async function executeWorkPlanLifecycle(input: {
  id: number;
  actorUserId: number;
  confirmation?: ImpactResolutionInput;
  operation: "toggle_archive" | "delete";
}): Promise<DomainServiceResult<{ success: true }>> {
  try {
    return await runSerializableTransaction(async (tx) => {
      const plan = await tx.workPlan.findUnique({
        where: { id: input.id },
        select: {
          id: true, title: true, kind: true, isSystemGenerated: true,
          isArchived: true, targetType: true, targetId: true, updatedAt: true,
        },
      });
      if (!plan) return { ok: false as const, error: "工作计划不存在", status: 404 };
      if (plan.kind === "routine") {
        return { ok: false as const, error: "日常工作是空间预留入口，不能归档或删除", status: 400 };
      }
      if (input.operation === "delete" && plan.kind === "okr" && plan.isSystemGenerated) {
        return { ok: false as const, error: "固定周期计划由系统维护，不能删除", status: 400 };
      }

      const intent: MutationIntent = input.operation === "delete"
        ? "delete"
        : plan.isArchived ? "restore" : "archive";
      const archiveSource = intent === "restore"
        ? await resolveWorkPlanArchiveSource(tx, plan.id)
        : undefined;
      const context: WorkMutationImpactContext = {
        tx,
        actorUserId: input.actorUserId,
        scopeType: plan.targetType,
        scopeId: String(plan.targetId),
        archiveSource,
      };
      const engine = buildAuditedWorkMutationImpactEngine(context);
      await engine.execute({
        context,
        actorKey: `user:${input.actorUserId}`,
        scopeKey: `${plan.targetType}:${plan.targetId}`,
        root: workMutationRoot({ plan, intent }),
        confirmation: input.confirmation,
        commitRoot: async () => {
          if (intent === "delete") {
            await tx.workPlan.delete({ where: { id: plan.id, updatedAt: plan.updatedAt } });
          } else {
            await tx.workPlan.update({
              where: { id: plan.id, updatedAt: plan.updatedAt },
              data: { isArchived: intent === "archive" },
            });
          }
          return { success: true as const };
        },
      });
      return { ok: true as const, data: { success: true as const } };
    });
  } catch (error) {
    const impactError = mutationImpactServiceError(error);
    if (impactError) return impactError;
    throw error;
  }
}
