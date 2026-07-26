import "dotenv/config";

import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { Prisma, prisma } from "@workspace/platform/server/prisma";

type LegacyBatch = {
  id: number;
  batchNumber: string;
  productKey: string;
  productName: string;
  templateSnapshot?: Record<string, unknown>;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  fields?: Record<string, unknown>;
};

function sourcePath() {
  const root = process.env.WORKSPACE_CONFIG_DIR?.trim();
  if (!root || !path.isAbsolute(root)) throw new Error("WORKSPACE_CONFIG_DIR must be an absolute path");
  return path.join(root, "data", "qc.json");
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validDate(value: string | undefined) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function snapshot(batch: LegacyBatch) {
  return batch.templateSnapshot ?? {
    templateId: 0,
    templateVersion: 0,
    productKey: batch.productKey,
    productName: batch.productName,
    document: { schemaVersion: 1, kind: "qc-editor-document", id: `legacy:${batch.id}`, title: batch.productName, blocks: [] },
    fieldModel: { schemaVersion: 1, fields: {}, formulas: {} },
    capturedAt: batch.createdAt ?? new Date().toISOString(),
  };
}

function signatureParts(fieldKey: string) {
  const parts = fieldKey.split("/");
  if (parts.at(-2) !== "signature") return null;
  const role = parts.at(-1);
  if (role !== "inspector" && role !== "reviewer") return null;
  const scope = parts.slice(0, -2);
  const precheck = scope.at(-1) === "precheck";
  const stageKey = scope[0] ?? "legacy";
  return {
    fieldKey,
    scopeKey: scope.join("/"),
    scopeKind: precheck ? "precheck" : "inspection",
    stageKey,
    testName: precheck ? null : scope.slice(1).join("/") || null,
    role,
    meaning: role === "reviewer" ? "旧文件状态复核签名" : "旧文件状态检验签名",
  };
}

async function migrateBatch(batch: LegacyBatch) {
  const templateSnapshot = snapshot(batch);
  const values = Object.entries(batch.fields ?? {});
  const signatures = values.flatMap(([fieldKey, value]) => {
    const parts = signatureParts(fieldKey);
    const signerName = String(value ?? "").trim();
    return parts && signerName ? [{ ...parts, signerName }] : [];
  });
  const fields = values.filter(([key]) => !signatureParts(key));
  const signedAt = validDate(batch.updatedAt);

  await prisma.$transaction(async (tx) => {
    const record = await tx.productionQcBatch.create({
      data: {
        legacyFileId: batch.id,
        batchNumber: batch.batchNumber,
        productKey: batch.productKey,
        productName: batch.productName,
        templateId: Number(templateSnapshot.templateId) || 0,
        templateVersion: Number(templateSnapshot.templateVersion) || 0,
        templateSnapshot: jsonValue(templateSnapshot),
        templateHash: hash(templateSnapshot),
        status: batch.status === "submitted" ? "submitted" : "draft",
        createdAt: validDate(batch.createdAt),
        updatedAt: validDate(batch.updatedAt),
      },
    });
    if (fields.length) {
      await tx.productionQcFieldValue.createMany({
        data: fields.map(([fieldKey, value]) => ({
          batchId: record.id,
          fieldKey,
          value: value == null ? "" : String(value),
          source: "migration",
          lastRecordVersion: 1,
        })),
      });
    }
    if (signatures.length) {
      await tx.productionQcSignature.createMany({
        data: signatures.map((signature) => ({
          batchId: record.id,
          ...signature,
          signedAt,
          signedRecordVersion: 1,
          signedPayloadHash: hash({ legacyFileId: batch.id, fields: batch.fields, signature }),
          authMethod: "legacy_file_import",
        })),
      });
    }
    await tx.productionQcAuditEvent.create({
      data: {
        batchId: record.id,
        batchRecordUid: record.recordUid,
        batchNumber: record.batchNumber,
        eventType: "legacy_imported",
        action: "migrate_qc_json",
        recordVersion: 1,
        payload: jsonValue({ legacyFileId: batch.id, fieldCount: fields.length, signatureCount: signatures.length }),
      },
    });
  });
}

async function main() {
  const execute = process.argv.includes("--execute");
  const parsed = JSON.parse(await readFile(sourcePath(), "utf8")) as { batches?: LegacyBatch[] };
  const batches = (parsed.batches ?? []).filter((batch) => Number.isInteger(batch.id) && batch.id > 0);
  const imported = new Set((await prisma.productionQcBatch.findMany({
    where: { legacyFileId: { in: batches.map((batch) => batch.id) } },
    select: { legacyFileId: true },
  })).flatMap((record) => record.legacyFileId == null ? [] : [record.legacyFileId]));
  const pending = batches.filter((batch) => !imported.has(batch.id));
  console.log(`QC file-state migration: ${batches.length} source, ${imported.size} imported, ${pending.length} pending.`);
  if (!execute) {
    console.log("Dry run only. Re-run with --execute to import pending records.");
    return;
  }
  for (const batch of pending) await migrateBatch(batch);
  console.log(`Imported ${pending.length} QC batch record(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
