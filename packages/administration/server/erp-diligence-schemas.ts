import { z } from "zod";
import { ERP_DILIGENCE_AREA_OPTIONS } from "@workspace/administration/constants";

const boundedText = (max: number) => z.string().trim().max(max);

export const ErpDiligenceProcessStepSchema = z.object({
  key: boundedText(80),
  name: boundedText(160),
  trigger: boundedText(1000),
  owner: boundedText(300),
  inputOutput: boundedText(2000),
  tool: boundedText(1000),
  handoff: boundedText(1000),
  exceptions: boundedText(2000),
}).strict();

export const ErpDiligenceEvidenceItemSchema = z.object({
  key: boundedText(80),
  documentType: boundedText(80),
  sampleLocation: boundedText(1000),
  owner: boundedText(300),
  notes: boundedText(2000),
}).strict();

export const ErpDiligenceSaveSchema = z.object({
  departmentName: boundedText(200),
  roleTitle: boundedText(200),
  primaryArea: z.union([z.literal(""), z.enum(ERP_DILIGENCE_AREA_OPTIONS.map((option) => option.value))]),
  status: z.enum(["draft", "submitted"]),
  answers: z.record(z.string().max(80), boundedText(5000)),
  processSteps: z.array(ErpDiligenceProcessStepSchema).max(40),
  evidenceItems: z.array(ErpDiligenceEvidenceItemSchema).max(40),
}).strict();

export const ErpDiligenceAnswersSchema = z.record(z.string().max(80), boundedText(5000));

export type ErpDiligenceSaveInput = z.infer<typeof ErpDiligenceSaveSchema>;
