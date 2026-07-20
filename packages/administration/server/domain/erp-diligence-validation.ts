import type { Prisma } from "@workspace/platform/server/prisma";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import {
  ERP_DILIGENCE_CAMPAIGN_KEY,
  ERP_DILIGENCE_DEFINITION_VERSION,
  type ErpDiligenceEvidenceItem,
  type ErpDiligenceProcessStep,
  type ErpDiligenceStatus,
} from "@workspace/administration/types";
import { ERP_DILIGENCE_QUESTION_KEYS } from "@workspace/administration/constants";
import type { ErpDiligenceSaveInput } from "../erp-diligence-schemas";

export interface ErpDiligenceSaveCommand {
  userId: number;
  campaignKey: string;
  definitionVersion: number;
  departmentName: string;
  roleTitle: string;
  primaryArea: string;
  status: ErpDiligenceStatus;
  answers: Prisma.InputJsonValue;
  processSteps: Prisma.InputJsonValue;
  evidenceItems: Prisma.InputJsonValue;
}

const QUESTION_KEYS = new Set<string>(ERP_DILIGENCE_QUESTION_KEYS);

function trimRecord(input: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => QUESTION_KEYS.has(key))
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => Boolean(value)),
  );
}

function trimProcessStep(step: ErpDiligenceProcessStep): ErpDiligenceProcessStep {
  return Object.fromEntries(Object.entries(step).map(([key, value]) => [key, value.trim()])) as unknown as ErpDiligenceProcessStep;
}

function trimEvidenceItem(item: ErpDiligenceEvidenceItem): ErpDiligenceEvidenceItem {
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, value.trim()])) as unknown as ErpDiligenceEvidenceItem;
}

export function buildErpDiligenceSaveCommand(
  input: ErpDiligenceSaveInput,
  userId: number,
): DomainValidationResult<ErpDiligenceSaveCommand> {
  if (!Number.isInteger(userId) || userId <= 0) return failCommand("用户无效", 400, "userId");
  const departmentName = input.departmentName.trim();
  const roleTitle = input.roleTitle.trim();
  const answers = trimRecord(input.answers);
  const processSteps = input.processSteps.map(trimProcessStep).filter((step) => step.name);
  const evidenceItems = input.evidenceItems.map(trimEvidenceItem).filter((item) => item.documentType || item.sampleLocation);

  if (input.status === "submitted") {
    if (!departmentName) return failCommand("提交前请填写部门", 400, "departmentName");
    if (!roleTitle) return failCommand("提交前请填写岗位或角色", 400, "roleTitle");
    if (!input.primaryArea) return failCommand("提交前请选择主要参与环节", 400, "primaryArea");
    if (processSteps.length === 0) return failCommand("提交前请至少填写一个实际流程步骤", 400, "processSteps");
    if (Object.keys(answers).length < 5) return failCommand("提交前请至少完成五项现状说明", 400, "answers");
  }

  return okCommand({
    userId,
    campaignKey: ERP_DILIGENCE_CAMPAIGN_KEY,
    definitionVersion: ERP_DILIGENCE_DEFINITION_VERSION,
    departmentName,
    roleTitle,
    primaryArea: input.primaryArea,
    status: input.status,
    answers: answers as Prisma.InputJsonValue,
    processSteps: processSteps as unknown as Prisma.InputJsonValue,
    evidenceItems: evidenceItems as unknown as Prisma.InputJsonValue,
  });
}
