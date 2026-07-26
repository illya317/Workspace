import { createHash } from "crypto";
import { Prisma } from "@workspace/platform/server/prisma";
import type { QcBatchSignature, QcBatchSummary, QcBatchTemplateSnapshot } from "./types";

export const QC_BATCH_INCLUDE = {
  fieldValues: { orderBy: { fieldKey: "asc" as const } },
  signatures: { orderBy: [{ signedAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.ProductionQcBatchInclude;

export type QcBatchRecord = Prisma.ProductionQcBatchGetPayload<{ include: typeof QC_BATCH_INCLUDE }>;

export function toQcBatchSummary(record: QcBatchRecord): QcBatchSummary {
  const fields = Object.fromEntries(record.fieldValues.map((field) => [field.fieldKey, field.value]));
  for (const signature of record.signatures) fields[signature.fieldKey] = signature.signerName;
  const signatures = record.signatures.map(toSignature);
  return {
    id: record.id,
    recordUid: record.recordUid,
    batchNumber: record.batchNumber,
    productId: record.productId,
    productKey: record.productKey,
    productName: record.productName,
    templateSnapshot: record.templateSnapshot as unknown as QcBatchTemplateSnapshot,
    inspector: signatures.filter((signature) => signature.role === "inspector").at(-1)?.signerName ?? "",
    status: record.status === "submitted" ? "submitted" : "draft",
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    fields,
    signatures,
  };
}

export function qcJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function hashQcPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stabilize(value))).digest("hex");
}

export function signaturePayload(input: {
  batch: QcBatchRecord;
  fields: Record<string, string>;
  recordVersion: number;
  fieldKey: string;
  role: string;
  meaning: string;
  signerUserId: number;
  signerEmployeeId?: string | null;
  signerName: string;
  signedAt: Date;
}) {
  return {
    recordUid: input.batch.recordUid,
    batchNumber: input.batch.batchNumber,
    productId: input.batch.productId,
    productKey: input.batch.productKey,
    templateHash: input.batch.templateHash,
    recordVersion: input.recordVersion,
    fields: input.fields,
    signature: {
      fieldKey: input.fieldKey,
      role: input.role,
      meaning: input.meaning,
      signerUserId: input.signerUserId,
      signerEmployeeId: input.signerEmployeeId ?? null,
      signerName: input.signerName,
      signedAt: input.signedAt.toISOString(),
      authMethod: "active_session",
    },
  };
}

function toSignature(record: QcBatchRecord["signatures"][number]): QcBatchSignature {
  return {
    id: record.id,
    fieldKey: record.fieldKey,
    scopeKey: record.scopeKey,
    scopeKind: record.scopeKind === "precheck" ? "precheck" : "inspection",
    stageKey: record.stageKey,
    testName: record.testName ?? undefined,
    role: record.role === "reviewer" ? "reviewer" : "inspector",
    meaning: record.meaning,
    signerUserId: record.signerUserId ?? undefined,
    signerEmployeeId: record.signerEmployeeId ?? undefined,
    signerName: record.signerName,
    signedAt: record.signedAt.toISOString(),
    signedRecordVersion: record.signedRecordVersion,
    signedPayloadHash: record.signedPayloadHash,
    authMethod: record.authMethod === "legacy_file_import" ? "legacy_file_import" : "active_session",
  };
}

function stabilize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stabilize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stabilize(item)]));
}
