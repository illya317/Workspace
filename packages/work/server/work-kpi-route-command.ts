import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { listKpiDefinitions, saveKpiDefinitionRevision } from "./work-kpi-definitions";
import { finalizeKpiScorecard, getKpiScorecard, updateKpiMeasurements } from "./work-kpi-scorecard";
import { prepareKpiResultSubmission } from "./work-kpi-results";

type WorkKpiDefinitionListCommand = {
  actorUserId: number;
  targetType: string;
  targetId: number;
  ownerDepartmentId?: number;
  includeRetired: boolean;
};

export function buildListKpiDefinitionsCommand(input: {
  user: { userId: number };
  query: Record<string, unknown>;
}): DomainValidationResult<WorkKpiDefinitionListCommand> {
  const targetType = String(input.query.targetType ?? "personal");
  const targetId = positiveInteger(input.query.targetId) ?? (targetType === "personal" ? input.user.userId : null);
  if (!targetId) return failCommand("KPI 指标库目标空间无效");
  const ownerDepartmentId = optionalPositiveInteger(input.query.ownerDepartmentId);
  return okCommand({
    actorUserId: input.user.userId,
    targetType,
    targetId,
    ...(ownerDepartmentId ? { ownerDepartmentId } : {}),
    includeRetired: input.query.includeRetired === "true",
  });
}

export function executeListKpiDefinitionsCommand(command: WorkKpiDefinitionListCommand) {
  return listKpiDefinitions(command);
}

export function buildSaveKpiDefinitionCommand(input: {
  userId: number;
  definitionId?: number | null;
  body: Record<string, unknown>;
}) {
  return okCommand({ actorUserId: input.userId, definitionId: input.definitionId ?? null, data: input.body });
}

export function executeSaveKpiDefinitionCommand(command: {
  actorUserId: number;
  definitionId: number | null;
  data: Record<string, unknown>;
}) {
  return saveKpiDefinitionRevision(command);
}

export function buildKpiPlanCommand(input: {
  userId: number;
  planId: number;
  body?: Record<string, unknown>;
}) {
  if (!positiveInteger(input.planId)) return failCommand("OKR 计划 ID 无效");
  return okCommand({ actorUserId: input.userId, planId: input.planId, body: input.body ?? {} });
}

export function executeGetKpiScorecardCommand(command: { actorUserId: number; planId: number }) {
  return getKpiScorecard(command);
}

export function executeFinalizeKpiScorecardCommand(command: {
  actorUserId: number;
  planId: number;
  body: Record<string, unknown>;
}) {
  return finalizeKpiScorecard({
    actorUserId: command.actorUserId,
    planId: command.planId,
    expectedPlanGovernanceRevision: optionalPositiveInteger(command.body.expectedPlanGovernanceRevision) ?? undefined,
    entries: command.body.entries,
    authorization: "direct",
  });
}

export function executeUpdateKpiMeasurementsCommand(command: {
  actorUserId: number;
  planId: number;
  body: Record<string, unknown>;
}) {
  return updateKpiMeasurements({
    actorUserId: command.actorUserId,
    planId: command.planId,
    measurements: command.body.measurements,
  });
}

export function executeGetKpiResultsCommand(command: { actorUserId: number; planId: number }) {
  return prepareKpiResultSubmission(command);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function optionalPositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return positiveInteger(value);
}
