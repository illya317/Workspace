import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import type { WorkKpiMeasurementInput, WorkKpiResultAdjustmentInput } from "../work-kpi-types";

export function validateWorkKpiMeasurementsCommand(input: {
  planId: unknown;
  measurements: unknown;
}): DomainValidationResult<{ planId: number; measurements: WorkKpiMeasurementInput[] }> {
  const planId = positiveInteger(input.planId);
  if (!planId) return failCommand("OKR 计划 ID 无效");
  if (!Array.isArray(input.measurements) || input.measurements.length === 0) return failCommand("请填写 KPI 实际值");
  if (input.measurements.length > 100) return failCommand("单次最多更新 100 个 KPI 实际值");
  const measurements: WorkKpiMeasurementInput[] = [];
  for (const raw of input.measurements) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return failCommand("KPI 实际值明细无效");
    const row = raw as Record<string, unknown>;
    const assignmentId = positiveInteger(row.assignmentId);
    const version = positiveInteger(row.version);
    const currentValue = finiteNumber(row.currentValue);
    if (!assignmentId || !version || currentValue === null) return failCommand("KPI 实际值明细无效");
    measurements.push({ assignmentId, version, currentValue });
  }
  if (new Set(measurements.map((row) => row.assignmentId)).size !== measurements.length) return failCommand("KPI 实际值不能重复提交");
  return okCommand({ planId, measurements });
}

export function validateWorkKpiResultCommitCommand(input: {
  planId: unknown;
  workReportId: unknown;
  adjustments?: unknown;
}): DomainValidationResult<{ planId: number; workReportId: number; adjustments: WorkKpiResultAdjustmentInput[] }> {
  const planId = positiveInteger(input.planId);
  const workReportId = positiveInteger(input.workReportId);
  if (!planId || !workReportId) return failCommand("KPI 结果确认参数无效");
  if (input.adjustments !== undefined && !Array.isArray(input.adjustments)) return failCommand("KPI 调分明细无效");
  const adjustments: WorkKpiResultAdjustmentInput[] = [];
  for (const raw of input.adjustments ?? []) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return failCommand("KPI 调分明细无效");
    const row = raw as Record<string, unknown>;
    const assignmentId = positiveInteger(row.assignmentId);
    if (!assignmentId) return failCommand("KPI 调分指标无效");
    const confirmedScore = row.confirmedScore === null || row.confirmedScore === undefined ? null : finiteNumber(row.confirmedScore);
    if (row.confirmedScore !== null && row.confirmedScore !== undefined && confirmedScore === null) return failCommand("KPI 确认得分无效");
    const adjustmentReason = String(row.adjustmentReason ?? "").trim();
    if (confirmedScore !== null && !adjustmentReason) return failCommand("人工调分必须填写原因");
    adjustments.push({ assignmentId, confirmedScore, adjustmentReason });
  }
  return okCommand({ planId, workReportId, adjustments });
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
