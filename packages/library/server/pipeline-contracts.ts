import { createHash } from "node:crypto";
import { z } from "zod";
import {
  LIBRARY_ENTITY_TYPES,
  LIBRARY_LOCATOR_SCHEMA_VERSION,
  LIBRARY_PIPELINE_ERROR_CODES,
  LIBRARY_PROCESSING_JOB_KINDS,
  LIBRARY_PROCESSING_JOB_STATUSES,
  LIBRARY_TAG_DIMENSIONS,
} from "../constants/pipeline";

export const LibraryLocatorSchema = z.object({
  schemaVersion: z.literal(LIBRARY_LOCATOR_SCHEMA_VERSION),
  page: z.number().int().positive().optional(),
  slide: z.number().int().positive().optional(),
  sheet: z.string().min(1).optional(),
  cellRange: z.string().min(1).optional(),
  sectionPath: z.array(z.string().min(1)).optional(),
  charStart: z.number().int().nonnegative().optional(),
  charEnd: z.number().int().positive().optional(),
  timestampStartMs: z.number().int().nonnegative().optional(),
  timestampEndMs: z.number().int().positive().optional(),
}).strict().superRefine((value, context) => {
  const hasAnchor = value.page !== undefined || value.slide !== undefined || value.sheet !== undefined
    || value.sectionPath !== undefined || value.timestampStartMs !== undefined;
  if (!hasAnchor) context.addIssue({ code: "custom", message: "locator requires a source anchor" });
  if (value.charStart !== undefined && value.charEnd !== undefined && value.charEnd <= value.charStart) {
    context.addIssue({ code: "custom", message: "charEnd must be greater than charStart" });
  }
});

export const LibraryProcessingJobContractSchema = z.object({
  versionUid: z.string().uuid(),
  inputChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(LIBRARY_PROCESSING_JOB_KINDS),
  status: z.enum(LIBRARY_PROCESSING_JOB_STATUSES),
  pipelineVersion: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  errorCode: z.enum(LIBRARY_PIPELINE_ERROR_CODES).optional(),
}).strict();

export const LibraryTagCandidateContractSchema = z.object({
  versionUid: z.string().uuid(),
  dimension: z.enum(LIBRARY_TAG_DIMENSIONS),
  proposedKey: z.string().min(1),
  proposedName: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.object({
    quote: z.string().min(1),
    locator: LibraryLocatorSchema,
  }).strict()).min(1),
  providerKey: z.literal("workspace-agent"),
  modelKey: z.string().min(1),
  promptVersion: z.string().min(1),
}).strict();

export const LibraryEntityMentionContractSchema = z.object({
  versionUid: z.string().uuid(),
  entityType: z.enum(LIBRARY_ENTITY_TYPES),
  canonicalValue: z.string().min(1),
  observedText: z.string().min(1),
  locator: LibraryLocatorSchema,
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(["deterministic", "workspace-agent"]),
  modelKey: z.string().min(1).optional(),
}).strict();

export function buildLibraryJobIdempotencyKey(input: {
  versionUid: string;
  inputChecksum: string;
  kind: string;
  pipelineVersion: string;
}): string {
  return createHash("sha256")
    .update([input.versionUid, input.inputChecksum, input.kind, input.pipelineVersion].join(":"))
    .digest("hex");
}
