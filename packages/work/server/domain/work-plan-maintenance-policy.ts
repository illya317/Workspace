import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

export type WorkPlanMaintenance = {
  plan: boolean;
  objective: boolean;
  task: boolean;
  keyResult: boolean;
};

const LOCKED_MAINTENANCE: WorkPlanMaintenance = {
  plan: false,
  objective: false,
  task: false,
  keyResult: false,
};

export function resolveWorkPlanMaintenance(input: {
  kind: string;
  stage: string;
  status: string;
  isArchived: boolean;
}): WorkPlanMaintenance {
  if (input.isArchived) return LOCKED_MAINTENANCE;
  if (input.kind === "routine") {
    return { ...LOCKED_MAINTENANCE, task: true };
  }
  if (input.kind !== "okr") return LOCKED_MAINTENANCE;
  return {
    plan: true,
    objective: true,
    task: true,
    keyResult: true,
  };
}

export function canMaintainWorkItem(maintenance: WorkPlanMaintenance, itemType: string) {
  if (itemType === "objective") return maintenance.objective;
  if (itemType === "task") return maintenance.task;
  if (itemType === "key_result") return maintenance.keyResult;
  return false;
}

export type WorkItemMutationFacet = "target" | "execution" | "result";

export function workItemMutationFacets(
  itemType: string,
  input: { changesKrCurrentValue?: boolean } = {},
): WorkItemMutationFacet[] {
  if (itemType === "objective") return ["target"];
  if (itemType === "task") return ["execution"];
  if (itemType === "key_result") {
    return input.changesKrCurrentValue ? ["target", "result"] : ["target"];
  }
  return [];
}

export function validateWorkPlanReopenTransition(input: {
  kind: string;
  currentStatus: string;
  requestedStatus: unknown;
  updateGuard: unknown;
  directTargetRevision?: boolean;
}): DomainValidationResult<{ reopening: boolean }> {
  const reopening = input.kind === "okr"
    && input.currentStatus === "done"
    && input.requestedStatus === "active";
  if (reopening && input.updateGuard !== "workflow-approved" && input.directTargetRevision !== true) {
    return failCommand("已完成 OKR 计划必须通过修订入口保存或提交", 409);
  }
  return okCommand({ reopening });
}
