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
  timeControlEnabled: boolean;
}): WorkPlanMaintenance {
  if (input.status === "done" || input.isArchived || (input.kind === "okr" && input.stage === "closed")) {
    return LOCKED_MAINTENANCE;
  }
  if (input.kind === "routine") {
    return { ...LOCKED_MAINTENANCE, task: true };
  }
  if (input.kind !== "okr") return LOCKED_MAINTENANCE;
  if (!input.timeControlEnabled) {
    return { plan: true, objective: true, task: true, keyResult: true };
  }
  const objectiveOpen = input.stage === "objective_draft";
  const executionOpen = input.stage === "executing" || input.stage === "kr_open";
  return {
    plan: objectiveOpen,
    objective: objectiveOpen,
    task: executionOpen,
    keyResult: executionOpen,
  };
}

export function canMaintainWorkItem(maintenance: WorkPlanMaintenance, itemType: string) {
  if (itemType === "objective") return maintenance.objective;
  if (itemType === "task") return maintenance.task;
  if (itemType === "key_result") return maintenance.keyResult;
  return false;
}
