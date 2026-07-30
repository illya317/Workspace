import type { Prisma } from "@workspace/platform/server/prisma";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import {
  ERP_DILIGENCE_CAMPAIGN_KEY,
  ERP_DILIGENCE_DEFINITION_VERSION,
  type ErpDiligenceEvidenceItem,
  type ErpDiligenceProcessStep,
  type ErpDiligenceResponsibilityPositionOption,
  type ErpDiligenceStatus,
} from "@workspace/administration/types";
import {
  ERP_DILIGENCE_QUESTION_KEYS,
  ERP_DILIGENCE_QUESTION_OPTION_VALUES,
} from "@workspace/administration/constants";
import type { ErpDiligenceSaveInput } from "../erp-diligence-schemas";

export interface ErpDiligenceSaveCommand {
  userId: number;
  campaignKey: string;
  definitionVersion: number;
  positionAssignmentId: number | null;
  departmentId: number | null;
  departmentName: string;
  roleTitle: string;
  primaryArea: string;
  status: ErpDiligenceStatus;
  answers: Prisma.InputJsonValue;
  processSteps: Prisma.InputJsonValue;
  evidenceItems: Prisma.InputJsonValue;
}

export interface ErpDiligencePositionSelection {
  id: number;
  departmentId: number;
  departmentName: string;
  positionName: string;
}

export interface ErpDiligenceSaveValidationContext {
  positionSelection: ErpDiligencePositionSelection | null;
  responsibilityPositions: readonly ErpDiligenceResponsibilityPositionOption[];
}

const QUESTION_KEYS = new Set<string>(ERP_DILIGENCE_QUESTION_KEYS);

function normalizeAnswers(input: ErpDiligenceSaveInput["answers"]): DomainValidationResult<Record<string, string | string[]>> {
  const answers: Record<string, string | string[]> = {};
  for (const [key, rawValue] of Object.entries(input)) {
    if (!QUESTION_KEYS.has(key)) continue;
    const allowed = ERP_DILIGENCE_QUESTION_OPTION_VALUES.get(key);
    const value = Array.isArray(rawValue)
      ? Array.from(new Set(rawValue.map((item) => item.trim()).filter(Boolean)))
      : rawValue.trim();
    const values = Array.isArray(value) ? value : value ? [value] : [];
    if (values.some((item) => !allowed?.has(item))) {
      return failCommand("尽调选项已失效，请重新选择", 400, `answers.${key}`);
    }
    if (Array.isArray(value) ? value.length > 0 : Boolean(value)) answers[key] = value;
  }
  return okCommand(answers);
}

function normalizeProcessStep(
  step: ErpDiligenceProcessStep,
  positions: ReadonlyMap<number, ErpDiligenceResponsibilityPositionOption>,
): DomainValidationResult<ErpDiligenceProcessStep | null> {
  if (!step.activityKey) return okCommand(null);
  const owner = step.ownerPositionId ? positions.get(step.ownerPositionId) : null;
  if (step.ownerPositionId && !owner) {
    return failCommand("流程责任岗位必须来自填写人所在部门或下级部门", 400, "processSteps.ownerPositionId");
  }
  return okCommand({
    ...step,
    key: step.key.trim(),
    ownerPositionId: owner?.positionId ?? null,
    ownerPositionName: owner?.positionName ?? "",
    ownerDepartmentName: owner?.departmentName ?? "",
    painPoints: Array.from(new Set(step.painPoints)),
    notes: step.notes.trim(),
  });
}

function normalizeEvidenceItem(
  item: ErpDiligenceEvidenceItem,
  positions: ReadonlyMap<number, ErpDiligenceResponsibilityPositionOption>,
): DomainValidationResult<ErpDiligenceEvidenceItem | null> {
  if (!item.documentType && !item.sampleLocation.trim()) return okCommand(null);
  const owner = item.ownerPositionId ? positions.get(item.ownerPositionId) : null;
  if (item.ownerPositionId && !owner) {
    return failCommand("材料负责人必须来自填写人所在部门或下级部门", 400, "evidenceItems.ownerPositionId");
  }
  return okCommand({
    ...item,
    key: item.key.trim(),
    sampleLocation: item.sampleLocation.trim(),
    ownerPositionId: owner?.positionId ?? null,
    ownerPositionName: owner?.positionName ?? "",
    ownerDepartmentName: owner?.departmentName ?? "",
    notes: item.notes.trim(),
  });
}

export function buildErpDiligenceSaveCommand(
  input: ErpDiligenceSaveInput,
  userId: number,
  context: ErpDiligenceSaveValidationContext,
): DomainValidationResult<ErpDiligenceSaveCommand> {
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("用户无效", 400, "userId");
  const { positionSelection } = context;
  if (input.positionAssignmentId && input.positionAssignmentId !== positionSelection?.id) {
    return failCommand("所选岗位不属于当前填报人的在岗岗位", 400, "positionAssignmentId");
  }
  const departmentName = positionSelection?.departmentName.trim() ?? "";
  const roleTitle = positionSelection?.positionName.trim() ?? "";
  const answers = normalizeAnswers(input.answers);
  if (!answers.ok) return answers;
  const positionById = new Map(context.responsibilityPositions.map((position) => [position.positionId, position]));
  const processSteps: ErpDiligenceProcessStep[] = [];
  for (const step of input.processSteps) {
    const normalized = normalizeProcessStep(step, positionById);
    if (!normalized.ok) return normalized;
    if (normalized.data) processSteps.push(normalized.data);
  }
  const evidenceItems: ErpDiligenceEvidenceItem[] = [];
  for (const item of input.evidenceItems) {
    const normalized = normalizeEvidenceItem(item, positionById);
    if (!normalized.ok) return normalized;
    if (normalized.data) evidenceItems.push(normalized.data);
  }

  if (input.status === "submitted") {
    if (!positionSelection) return failCommand("提交前请选择当前在岗岗位", 400, "positionAssignmentId");
    if (!input.primaryArea) return failCommand("提交前请选择主要参与环节", 400, "primaryArea");
    if (processSteps.length === 0) return failCommand("提交前请至少填写一个实际流程步骤", 400, "processSteps");
    if (processSteps.some((step) => !step.ownerPositionId)) return failCommand("提交前请为每个流程选择责任岗位", 400, "processSteps.ownerPositionId");
    if (processSteps.some((step) => (
      !step.frequency
      || !step.volumeBand
      || !step.touchTimeBand
      || !step.waitTimeBand
      || !step.executionMode
      || !step.inputStructure
      || !step.ruleType
      || !step.variability
      || !step.exceptionRate
      || !step.errorRate
      || !step.handoffMode
      || !step.systemCount
      || !step.logAvailability
      || !step.riskLevel
      || !step.reviewRequirement
      || step.painPoints.length === 0
    ))) return failCommand("提交前请完成每个流程活动的诊断选项", 400, "processSteps");
    if (evidenceItems.some((item) => !item.ownerPositionId)) return failCommand("提交前请为每份材料选择负责人岗位", 400, "evidenceItems.ownerPositionId");
    if (evidenceItems.some((item) => !item.documentType || !item.format || !item.updateFrequency || !item.completeness)) {
      return failCommand("提交前请完成每份材料的类型、格式、更新频率和完整性", 400, "evidenceItems");
    }
    if (Object.keys(answers.data).length < 10) return failCommand("提交前请至少完成十项结构化现状判断", 400, "answers");
  }

  return okCommand({
    userId,
    campaignKey: ERP_DILIGENCE_CAMPAIGN_KEY,
    definitionVersion: ERP_DILIGENCE_DEFINITION_VERSION,
    positionAssignmentId: positionSelection?.id ?? null,
    departmentId: positionSelection?.departmentId ?? null,
    departmentName,
    roleTitle,
    primaryArea: input.primaryArea,
    status: input.status,
    answers: answers.data as Prisma.InputJsonValue,
    processSteps: processSteps as unknown as Prisma.InputJsonValue,
    evidenceItems: evidenceItems as unknown as Prisma.InputJsonValue,
  });
}
