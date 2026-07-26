import { z } from "zod";
import {
  ERP_DILIGENCE_AREA_OPTIONS,
  ERP_DILIGENCE_EVIDENCE_COMPLETENESS_OPTIONS,
  ERP_DILIGENCE_EVIDENCE_FORMAT_OPTIONS,
  ERP_DILIGENCE_EVIDENCE_TYPES,
  ERP_DILIGENCE_EVIDENCE_UPDATE_OPTIONS,
  ERP_DILIGENCE_EXECUTION_MODE_OPTIONS,
  ERP_DILIGENCE_FREQUENCY_OPTIONS,
  ERP_DILIGENCE_HANDOFF_OPTIONS,
  ERP_DILIGENCE_INPUT_STRUCTURE_OPTIONS,
  ERP_DILIGENCE_LOG_OPTIONS,
  ERP_DILIGENCE_PAIN_POINT_OPTIONS,
  ERP_DILIGENCE_PROCESS_ACTIVITY_OPTIONS,
  ERP_DILIGENCE_RATE_OPTIONS,
  ERP_DILIGENCE_REVIEW_OPTIONS,
  ERP_DILIGENCE_RISK_OPTIONS,
  ERP_DILIGENCE_RULE_TYPE_OPTIONS,
  ERP_DILIGENCE_SYSTEM_COUNT_OPTIONS,
  ERP_DILIGENCE_TIME_OPTIONS,
  ERP_DILIGENCE_VARIABILITY_OPTIONS,
  ERP_DILIGENCE_VOLUME_OPTIONS,
  ERP_DILIGENCE_WAIT_OPTIONS,
} from "@workspace/administration/constants";

const boundedText = (max: number) => z.string().trim().max(max);
const optionalChoice = (options: readonly { value: string }[]) => (
  z.union([z.literal(""), z.enum(options.map((option) => option.value))])
);

export const ErpDiligenceProcessStepSchema = z.object({
  key: boundedText(80),
  activityKey: optionalChoice(ERP_DILIGENCE_PROCESS_ACTIVITY_OPTIONS),
  ownerPositionId: z.number().int().positive().nullable(),
  ownerPositionName: boundedText(200),
  ownerDepartmentName: boundedText(200),
  frequency: optionalChoice(ERP_DILIGENCE_FREQUENCY_OPTIONS),
  volumeBand: optionalChoice(ERP_DILIGENCE_VOLUME_OPTIONS),
  touchTimeBand: optionalChoice(ERP_DILIGENCE_TIME_OPTIONS),
  waitTimeBand: optionalChoice(ERP_DILIGENCE_WAIT_OPTIONS),
  executionMode: optionalChoice(ERP_DILIGENCE_EXECUTION_MODE_OPTIONS),
  inputStructure: optionalChoice(ERP_DILIGENCE_INPUT_STRUCTURE_OPTIONS),
  ruleType: optionalChoice(ERP_DILIGENCE_RULE_TYPE_OPTIONS),
  variability: optionalChoice(ERP_DILIGENCE_VARIABILITY_OPTIONS),
  exceptionRate: optionalChoice(ERP_DILIGENCE_RATE_OPTIONS),
  errorRate: optionalChoice(ERP_DILIGENCE_RATE_OPTIONS),
  handoffMode: optionalChoice(ERP_DILIGENCE_HANDOFF_OPTIONS),
  systemCount: optionalChoice(ERP_DILIGENCE_SYSTEM_COUNT_OPTIONS),
  logAvailability: optionalChoice(ERP_DILIGENCE_LOG_OPTIONS),
  riskLevel: optionalChoice(ERP_DILIGENCE_RISK_OPTIONS),
  reviewRequirement: optionalChoice(ERP_DILIGENCE_REVIEW_OPTIONS),
  painPoints: z.array(z.enum(ERP_DILIGENCE_PAIN_POINT_OPTIONS.map((option) => option.value))).max(10),
  notes: boundedText(2000),
}).strict();

export const ErpDiligenceEvidenceItemSchema = z.object({
  key: boundedText(80),
  documentType: optionalChoice(ERP_DILIGENCE_EVIDENCE_TYPES),
  format: optionalChoice(ERP_DILIGENCE_EVIDENCE_FORMAT_OPTIONS),
  updateFrequency: optionalChoice(ERP_DILIGENCE_EVIDENCE_UPDATE_OPTIONS),
  completeness: optionalChoice(ERP_DILIGENCE_EVIDENCE_COMPLETENESS_OPTIONS),
  sampleLocation: boundedText(1000),
  ownerPositionId: z.number().int().positive().nullable(),
  ownerPositionName: boundedText(200),
  ownerDepartmentName: boundedText(200),
  notes: boundedText(2000),
}).strict();

export const ErpDiligenceAnswersSchema = z.record(
  z.string().max(80),
  z.union([boundedText(200), z.array(boundedText(200)).max(12)]),
);

export const ErpDiligenceSaveSchema = z.object({
  positionAssignmentId: z.number().int().positive().nullable(),
  primaryArea: z.union([z.literal(""), z.enum(ERP_DILIGENCE_AREA_OPTIONS.map((option) => option.value))]),
  status: z.enum(["draft", "submitted"]),
  answers: ErpDiligenceAnswersSchema,
  processSteps: z.array(ErpDiligenceProcessStepSchema).max(40),
  evidenceItems: z.array(ErpDiligenceEvidenceItemSchema).max(40),
}).strict();

export const ErpDiligenceEvidenceUploadSchema = z.object({
  evidenceKey: boundedText(80),
  file: z.instanceof(File),
}).strict();

export const ErpDiligenceEvidenceAttachmentParamsSchema = z.object({
  attachmentUid: z.string().uuid(),
}).strict();

export type ErpDiligenceSaveInput = z.infer<typeof ErpDiligenceSaveSchema>;
