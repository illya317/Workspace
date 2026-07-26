import "server-only";

import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import {
  iterateWorkKpiResultAssignmentSnapshotValueRows,
  iterateWorkKpiResultDefinitionSnapshotValueRows,
  iterateWorkKpiResultEvidenceValueRows,
  iterateWorkKpiResultPreviewRows,
  iterateWorkKpiResultScoringRuleValueRows,
  iterateWorkKpiResultSummaryRows,
  iterateWorkKpiResultWorkReportRows,
  type WorkKpiResultsData,
} from "./workspace-analysis-kpi-result-sources";
import {
  iterateWorkKpiScorecardAssignmentRows,
  iterateWorkKpiScorecardDefinitionRows,
  iterateWorkKpiScorecardDefinitionScoringRuleValueRows,
  iterateWorkKpiScorecardDefinitionSnapshotValueRows,
  iterateWorkKpiScorecardEvidenceTaskRows,
  iterateWorkKpiScorecardLatestResultRows,
  iterateWorkKpiScorecardPlanRows,
  iterateWorkKpiScorecardScoringRuleValueRows,
  iterateWorkKpiScorecardSourceAssignmentRows,
  type WorkKpiScorecardData,
} from "./workspace-analysis-kpi-scorecard-sources";
import {
  iterateWorkProjectPlanBaselineItemRows,
  iterateWorkProjectPlanBaselineRows,
  iterateWorkProjectPlanDependencyRows,
  iterateWorkProjectPlanGanttItemRows,
  iterateWorkProjectPlanGanttOwnerRows,
  iterateWorkProjectPlanPhaseRows,
  type WorkProjectPlanBaselinesData,
  type WorkProjectPlanGanttData,
  type WorkProjectPlanPhasesData,
} from "./workspace-analysis-project-plan-detail-sources";

const PARAMETERIZED_DETAIL_SOURCE_KEYS = new Set([
  "work.project-plan-phases",
  "work.project-plan-baselines",
  "work.project-plan-gantt-items",
  "work.project-plan-gantt-owners",
  "work.project-plan-dependencies",
  "work.project-plan-baseline-items",
  "work.kpi-scorecard-plans",
  "work.kpi-scorecard-assignments",
  "work.kpi-scorecard-definitions",
  "work.kpi-scorecard-source-assignments",
  "work.kpi-scorecard-definition-snapshot-values",
  "work.kpi-scorecard-scoring-rule-values",
  "work.kpi-scorecard-definition-scoring-rule-values",
  "work.kpi-scorecard-evidence-tasks",
  "work.kpi-scorecard-latest-results",
  "work.kpi-result-summaries",
  "work.kpi-result-previews",
  "work.kpi-result-work-reports",
  "work.kpi-result-definition-snapshot-values",
  "work.kpi-result-assignment-snapshot-values",
  "work.kpi-result-scoring-rule-values",
  "work.kpi-result-evidence-values",
]);

export async function loadWorkParameterizedDetailSource(input: {
  readonly requesterId: number;
  readonly parameters: WorkspaceAnalysisSourceLoadRequest["parameters"];
  readonly sourceKey: string;
  readonly maxRows: number;
  readonly label: string;
}): Promise<{ readonly rows: readonly unknown[]; readonly totalRows: number } | null> {
  if (!PARAMETERIZED_DETAIL_SOURCE_KEYS.has(input.sourceKey)) return null;
  const iterable: Iterable<unknown> = input.sourceKey.startsWith("work.project-plan-")
    ? await loadProjectPlanRows(input)
    : input.sourceKey.startsWith("work.kpi-scorecard-")
      ? await loadKpiScorecardRows(input)
      : await loadKpiResultRows(input);
  const rows = collectBoundedRows(iterable, input.maxRows, input.sourceKey, input.label);
  return { rows, totalRows: rows.length };
}

async function loadProjectPlanRows(input: {
  readonly requesterId: number;
  readonly parameters: WorkspaceAnalysisSourceLoadRequest["parameters"];
  readonly sourceKey: string;
}) {
  const projectId = integerParameter(input.parameters.planProjectId);
  if (!projectId) throw invalidParameter(input.sourceKey, "项目计划详情来源缺少项目 ID");
  const [{ listProjectPlanBaselines }, { listProjectPlanGantt, listProjectPlanPhases }] = await Promise.all([
    import("./project-plan-baselines"),
    import("./project-plan"),
  ]);

  if (input.sourceKey === "work.project-plan-phases") {
    const result = await listProjectPlanPhases({ userId: input.requesterId, projectId });
    if (!result.ok) throw serviceFailure(result, input.sourceKey, "项目计划阶段");
    return iterateWorkProjectPlanPhaseRows(result.data as WorkProjectPlanPhasesData);
  }
  if (input.sourceKey === "work.project-plan-baselines") {
    const result = await listProjectPlanBaselines({ userId: input.requesterId, projectId });
    if (!result.ok) throw serviceFailure(result, input.sourceKey, "项目计划基线");
    return iterateWorkProjectPlanBaselineRows(result.data as WorkProjectPlanBaselinesData, projectId);
  }

  const result = await listProjectPlanGantt({ userId: input.requesterId, projectId });
  if (!result.ok) throw serviceFailure(result, input.sourceKey, "项目计划甘特详情");
  const data = result.data as WorkProjectPlanGanttData;
  switch (input.sourceKey) {
    case "work.project-plan-gantt-items": return iterateWorkProjectPlanGanttItemRows(data);
    case "work.project-plan-gantt-owners": return iterateWorkProjectPlanGanttOwnerRows(data);
    case "work.project-plan-dependencies": return iterateWorkProjectPlanDependencyRows(data);
    default: return iterateWorkProjectPlanBaselineItemRows(data);
  }
}

async function loadKpiScorecardRows(input: {
  readonly requesterId: number;
  readonly parameters: WorkspaceAnalysisSourceLoadRequest["parameters"];
  readonly sourceKey: string;
}) {
  const planId = requiredPlanId(input.parameters, input.sourceKey, "KPI 计分卡");
  const { executeGetKpiScorecardCommand } = await import("./work-kpi-route-command");
  const result = await executeGetKpiScorecardCommand({ actorUserId: input.requesterId, planId });
  if (!result.ok) throw serviceFailure(result, input.sourceKey, "KPI 计分卡");
  const data = result.data as WorkKpiScorecardData;
  switch (input.sourceKey) {
    case "work.kpi-scorecard-plans": return iterateWorkKpiScorecardPlanRows(data);
    case "work.kpi-scorecard-assignments": return iterateWorkKpiScorecardAssignmentRows(data);
    case "work.kpi-scorecard-definitions": return iterateWorkKpiScorecardDefinitionRows(data);
    case "work.kpi-scorecard-source-assignments": return iterateWorkKpiScorecardSourceAssignmentRows(data);
    case "work.kpi-scorecard-definition-snapshot-values": return iterateWorkKpiScorecardDefinitionSnapshotValueRows(data);
    case "work.kpi-scorecard-scoring-rule-values": return iterateWorkKpiScorecardScoringRuleValueRows(data);
    case "work.kpi-scorecard-definition-scoring-rule-values": return iterateWorkKpiScorecardDefinitionScoringRuleValueRows(data);
    case "work.kpi-scorecard-evidence-tasks": return iterateWorkKpiScorecardEvidenceTaskRows(data);
    default: return iterateWorkKpiScorecardLatestResultRows(data);
  }
}

async function loadKpiResultRows(input: {
  readonly requesterId: number;
  readonly parameters: WorkspaceAnalysisSourceLoadRequest["parameters"];
  readonly sourceKey: string;
}) {
  const planId = requiredPlanId(input.parameters, input.sourceKey, "KPI 结果");
  const { executeGetKpiResultsCommand } = await import("./work-kpi-route-command");
  const result = await executeGetKpiResultsCommand({ actorUserId: input.requesterId, planId });
  if (!result.ok) throw serviceFailure(result, input.sourceKey, "KPI 结果");
  const data = result.data as WorkKpiResultsData;
  switch (input.sourceKey) {
    case "work.kpi-result-summaries": return iterateWorkKpiResultSummaryRows(data, planId);
    case "work.kpi-result-previews": return iterateWorkKpiResultPreviewRows(data);
    case "work.kpi-result-work-reports": return iterateWorkKpiResultWorkReportRows(data, planId);
    case "work.kpi-result-definition-snapshot-values": return iterateWorkKpiResultDefinitionSnapshotValueRows(data, planId);
    case "work.kpi-result-assignment-snapshot-values": return iterateWorkKpiResultAssignmentSnapshotValueRows(data, planId);
    case "work.kpi-result-scoring-rule-values": return iterateWorkKpiResultScoringRuleValueRows(data, planId);
    default: return iterateWorkKpiResultEvidenceValueRows(data, planId);
  }
}

function requiredPlanId(
  parameters: WorkspaceAnalysisSourceLoadRequest["parameters"],
  sourceKey: string,
  label: string,
) {
  const planId = integerParameter(parameters.planId);
  if (!planId) throw invalidParameter(sourceKey, `${label}来源缺少工作计划 ID`);
  return planId;
}

function integerParameter(value: string | number | boolean | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function invalidParameter(sourceKey: string, message: string) {
  return new WorkspaceAnalysisRuntimeError("source_response_invalid", message, sourceKey);
}

function serviceFailure(
  result: { readonly error: string; readonly status?: number },
  sourceKey: string,
  label: string,
) {
  return new WorkspaceAnalysisRuntimeError(
    result.status === 403 ? "source_forbidden" : "source_unavailable",
    result.error || `${label}数据暂不可用`,
    sourceKey,
  );
}

function collectBoundedRows(iterable: Iterable<unknown>, maxRows: number, sourceKey: string, label: string) {
  const rows: unknown[] = [];
  for (const row of iterable) {
    rows.push(row);
    if (rows.length > maxRows) {
      throw new WorkspaceAnalysisRuntimeError("source_limit_exceeded", `${label}超过登记行数上限`, sourceKey);
    }
  }
  return rows;
}
