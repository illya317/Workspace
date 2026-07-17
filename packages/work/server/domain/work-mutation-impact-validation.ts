import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";

type WorkPlanItemCascadeCommand = {
  planId: number;
  itemIds: number[];
  intent: "archive" | "restore" | "delete";
};

export function validateWorkPlanItemCascade(input: {
  rootEntity: string;
  rootId: string;
  intent: string;
  itemIds: number[];
}): DomainValidationResult<WorkPlanItemCascadeCommand> {
  const planId = Number(input.rootId);
  if (input.rootEntity !== "WorkPlan" || !Number.isInteger(planId) || planId <= 0) {
    return failCommand("工作计划级联根对象无效", 500);
  }
  if (input.intent !== "archive" && input.intent !== "restore" && input.intent !== "delete") {
    return failCommand("工作计划级联操作无效", 500);
  }
  if (input.itemIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return failCommand("工作计划级联包含无效工作项", 500);
  }
  return okCommand({ planId, itemIds: [...new Set(input.itemIds)], intent: input.intent });
}

export function validateWorkPlanKpiAssignmentCascade(input: {
  rootEntity: string;
  rootId: string;
  intent: string;
  assignmentIds: number[];
}) {
  const planId = Number(input.rootId);
  if (input.rootEntity !== "WorkPlan" || !Number.isInteger(planId) || planId <= 0) {
    return failCommand("KPI 级联根计划无效", 500);
  }
  if (input.intent !== "delete") return failCommand("KPI 分配只允许随计划删除", 500);
  if (input.assignmentIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return failCommand("计划 KPI 级联包含无效分配", 500);
  }
  return okCommand({ planId, assignmentIds: [...new Set(input.assignmentIds)] });
}
