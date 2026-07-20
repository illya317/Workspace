import type { Prisma } from "@workspace/platform/server/prisma";
import { validateWorkKrEvidenceCommand } from "./domain/work-kr-evidence-validation";

type WorkKrEvidenceValidationStore = Pick<Prisma.TransactionClient, "workItem">;

export class WorkKrEvidenceValidationError extends Error {}

export function normalizeEvidenceTaskIds(value: unknown): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids));
}

export async function replaceKrEvidenceTasks(
  tx: Prisma.TransactionClient,
  input: {
    krWorkItemId: number;
    planId: number | null;
    objectiveId: number | null;
    evidenceTaskIds?: number[];
  },
) {
  const command = validateWorkKrEvidenceCommand("replaceKrEvidenceTasks");
  if (!command.ok) return command.issue.message;
  if (input.evidenceTaskIds === undefined) return null;
  const validationError = await validateKrEvidenceTasks(tx, input);
  if (validationError) return validationError;
  await tx.workKrEvidence.deleteMany({ where: { krWorkItemId: input.krWorkItemId } });
  if (input.evidenceTaskIds.length === 0) return null;
  await tx.workKrEvidence.createMany({
    data: input.evidenceTaskIds.map((taskWorkItemId, index) => ({
      krWorkItemId: input.krWorkItemId,
      taskWorkItemId,
      sortOrder: (index + 1) * 10,
    })),
  });
  return null;
}

/** Read-only validation shared by form writes and Agent proposal preflight. */
export async function validateKrEvidenceTasks(
  store: WorkKrEvidenceValidationStore,
  input: {
    planId: number | null;
    objectiveId: number | null;
    evidenceTaskIds?: number[];
  },
) {
  if (input.evidenceTaskIds === undefined) return null;
  if (!input.planId || !input.objectiveId) return "KR 必须挂在目标下才能关联任务证据";
  if (input.evidenceTaskIds.length > 0) {
    const tasks = await store.workItem.findMany({
      where: { id: { in: input.evidenceTaskIds } },
      select: { id: true, planId: true, itemType: true, parentWorkItemId: true },
    });
    if (tasks.length !== input.evidenceTaskIds.length) return "关联的任务证据不存在";
    const invalidTask = tasks.find((task) => (
      task.planId !== input.planId
      || task.itemType !== "task"
      || task.parentWorkItemId !== input.objectiveId
    ));
    if (invalidTask) return "KR 证据只能关联同一目标下的任务";
  }
  return null;
}
