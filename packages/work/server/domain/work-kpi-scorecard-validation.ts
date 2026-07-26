import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { normalizeWorkKpiScoringRule } from "../work-kpi-scoring";
import type { WorkKpiScorecardEntryInput, WorkKpiScoringRule } from "../work-kpi-types";

export type WorkKpiScorecardEntryCommand = Omit<WorkKpiScorecardEntryInput, "scoringRule"> & {
  id: number | null;
  version: number | null;
  objectiveWorkItemId: number | null;
  sourceAssignmentId: number | null;
  relationKind: "direct" | "decompose";
  baselineValue: number | null;
  targetValue: number | null;
  targetLowerBound: number | null;
  targetUpperBound: number | null;
  scoringRule: WorkKpiScoringRule | null;
};

export type WorkKpiScorecardCommand = {
  planId: number;
  expectedPlanGovernanceRevision?: number;
  intent: "draft" | "finalize";
  entries: WorkKpiScorecardEntryCommand[];
};

export function validateWorkKpiScorecardCommand(input: {
  planId: unknown;
  expectedPlanGovernanceRevision?: unknown;
  intent?: unknown;
  entries: unknown;
}): DomainValidationResult<WorkKpiScorecardCommand> {
  const planId = positiveId(input.planId);
  if (!planId) return failCommand("OKR 计划 ID 无效", 400, "planId");
  if (!Array.isArray(input.entries)) return failCommand("KPI 计分卡明细无效", 400, "entries");
  if (input.entries.length > 100) return failCommand("单张计分卡最多包含 100 个指标", 400, "entries");
  const intent = input.intent === "finalize" ? "finalize" : "draft";
  const entries: WorkKpiScorecardEntryCommand[] = [];
  for (const [index, raw] of input.entries.entries()) {
    const normalized = validateEntry(raw, index);
    if (!normalized.ok) return normalized;
    entries.push(normalized.data);
  }
  const definitionIds = entries.map((entry) => entry.definitionId);
  if (new Set(definitionIds).size !== definitionIds.length) return failCommand("同一计分卡不能重复选择同一指标版本", 400, "entries");
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (intent === "finalize" && Math.abs(totalWeight - 100) > 0.000001) {
    return failCommand("KPI 权重合计必须等于 100% 才能确认", 400, "entries");
  }
  const expectedPlanGovernanceRevision = optionalPositiveInteger(input.expectedPlanGovernanceRevision);
  if (input.expectedPlanGovernanceRevision !== undefined && expectedPlanGovernanceRevision === null) {
    return failCommand("计划治理版本无效", 400, "expectedPlanGovernanceRevision");
  }
  return okCommand({
    planId,
    intent,
    entries,
    ...(expectedPlanGovernanceRevision === null ? {} : { expectedPlanGovernanceRevision }),
  });
}

function validateEntry(raw: unknown, index: number): DomainValidationResult<WorkKpiScorecardEntryCommand> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return failCommand(`第 ${index + 1} 个 KPI 无效`, 400, `entries.${index}`);
  const input = raw as Record<string, unknown>;
  const definitionId = positiveId(input.definitionId);
  const ownerEmployeeId = positiveId(input.ownerEmployeeId);
  if (!definitionId) return failCommand(`第 ${index + 1} 个 KPI 指标无效`, 400, `entries.${index}.definitionId`);
  if (!ownerEmployeeId) return failCommand(`第 ${index + 1} 个 KPI 责任人无效`, 400, `entries.${index}.ownerEmployeeId`);
  const weight = finiteNumber(input.weight);
  if (weight === null || weight <= 0 || weight > 100) return failCommand(`第 ${index + 1} 个 KPI 权重须大于 0 且不超过 100`, 400, `entries.${index}.weight`);
  const id = optionalPositiveInteger(input.id);
  const version = optionalPositiveInteger(input.version);
  if (input.id !== undefined && input.id !== null && id === null) return failCommand(`第 ${index + 1} 个 KPI ID 无效`);
  if (id && version === null) return failCommand(`第 ${index + 1} 个 KPI 版本不能为空`);
  const relationKind = input.relationKind === "decompose" ? "decompose" : "direct";
  const sourceAssignmentId = optionalPositiveInteger(input.sourceAssignmentId);
  if (relationKind === "decompose" && sourceAssignmentId === null) return failCommand(`第 ${index + 1} 个 KPI 必须选择上级指标`);
  if (relationKind === "direct" && sourceAssignmentId !== null) return failCommand(`第 ${index + 1} 个 KPI 的直接分配不能保留上级指标`);
  const scoringRule = input.scoringRule == null ? okCommand(null) : normalizeWorkKpiScoringRule(input.scoringRule);
  if (!scoringRule.ok) return scoringRule;
  return okCommand({
    id,
    version,
    definitionId,
    ownerEmployeeId,
    objectiveWorkItemId: optionalPositiveInteger(input.objectiveWorkItemId),
    sourceAssignmentId,
    relationKind,
    weight,
    baselineValue: finiteNumber(input.baselineValue),
    targetValue: finiteNumber(input.targetValue),
    targetLowerBound: finiteNumber(input.targetLowerBound),
    targetUpperBound: finiteNumber(input.targetUpperBound),
    scoringRule: scoringRule.data,
  });
}

function positiveId(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function optionalPositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return positiveId(value);
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
