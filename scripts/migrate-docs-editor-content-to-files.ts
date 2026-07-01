import "dotenv/config";

import { createHash } from "crypto";
import os from "os";
import path from "path";
import { mkdir, rename, writeFile } from "fs/promises";
import { prisma } from "@workspace/platform/server/prisma";

const CONTENT_ROOT_REF = "data/docs-editor/templates";
const EMPTY_JSON = "{}";

type TemplateRow = {
  id: number;
  documentJson: string;
  fieldModelJson: string;
  documentContentRef: string | null;
  fieldModelContentRef: string | null;
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = await prisma.documentTemplate.findMany({
    select: {
      id: true,
      documentJson: true,
      fieldModelJson: true,
      documentContentRef: true,
      fieldModelContentRef: true,
    },
    orderBy: { id: "asc" },
  }) as TemplateRow[];

  let migrated = 0;
  let skipped = 0;
  let totalBytes = 0;

  for (const row of rows) {
    const hasRefs = Boolean(row.documentContentRef && row.fieldModelContentRef);
    const alreadySlim = row.documentJson === EMPTY_JSON && row.fieldModelJson === EMPTY_JSON;
    if (hasRefs && alreadySlim) {
      skipped += 1;
      continue;
    }
    const documentJson = row.documentJson || EMPTY_JSON;
    const fieldModelJson = row.fieldModelJson || EMPTY_JSON;
    const documentRef = templateContentRef(row.id, "document.json");
    const fieldModelRef = templateContentRef(row.id, "field-model.json");
    const documentMeta = contentMetadata(documentJson);
    const fieldModelMeta = contentMetadata(fieldModelJson);
    totalBytes += documentMeta.bytes + fieldModelMeta.bytes;

    if (!dryRun) {
      await Promise.all([
        writeContentRef(documentRef, documentJson),
        writeContentRef(fieldModelRef, fieldModelJson),
      ]);
      await prisma.documentTemplate.update({
        where: { id: row.id },
        data: {
          documentContentRef: documentRef,
          documentContentHash: documentMeta.hash,
          documentContentBytes: documentMeta.bytes,
          fieldModelContentRef: fieldModelRef,
          fieldModelContentHash: fieldModelMeta.hash,
          fieldModelContentBytes: fieldModelMeta.bytes,
          documentJson: EMPTY_JSON,
          fieldModelJson: EMPTY_JSON,
        },
      });
    }
    migrated += 1;
  }

  console.log(JSON.stringify({
    dryRun,
    migrated,
    skipped,
    totalBytes,
    contentRoot: path.join(workspaceConfigDir(), CONTENT_ROOT_REF),
  }, null, 2));
}

function templateContentRef(templateId: number, fileName: "document.json" | "field-model.json") {
  return `${CONTENT_ROOT_REF}/${templateId}/${fileName}`;
}

async function writeContentRef(ref: string, content: string) {
  const filePath = path.join(workspaceConfigDir(), ref);
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

function contentMetadata(content: string) {
  return {
    bytes: Buffer.byteLength(content, "utf8"),
    hash: createHash("sha256").update(content).digest("hex"),
  };
}

function workspaceConfigDir() {
  const configured = process.env.WORKSPACE_CONFIG_DIR?.trim();
  return expandTilde(configured || path.resolve(process.cwd(), "..", ".workspace"));
}

function expandTilde(input: string) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
