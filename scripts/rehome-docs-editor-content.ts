import "dotenv/config";

import fs from "fs/promises";
import path from "path";

import { prisma } from "@workspace/platform/server/prisma";
import {
  deleteTemplateContentFiles,
  isStructuredTemplateContentRef,
  planTemplateContentRefs,
  readTemplateContentJson,
  templateContentFilesStatus,
  writeTemplateContentJson,
} from "../packages/platform/server/docs-editor/content-store";

type TemplateWithSpace = Awaited<ReturnType<typeof loadTemplates>>[number];

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const counters = {
  migrated: 0,
  skipped: 0,
  missing: 0,
  deletedDraft: 0,
  errors: 0,
};

let backupCreated = false;

async function main() {
  const templates = await loadTemplates();

  for (const template of templates) {
    try {
      await processTemplate(template);
    } catch (error) {
      counters.errors += 1;
      log("error", template, error instanceof Error ? error.message : String(error));
    }
  }

  printSummary();
  if (counters.errors > 0) process.exitCode = 1;
}

async function loadTemplates() {
  return prisma.documentTemplate.findMany({
    where: { deletedAt: null },
    include: { space: true },
    orderBy: { id: "asc" },
  });
}

async function processTemplate(template: TemplateWithSpace) {
  if (await isDiscardedAdminDraft(template)) {
    counters.deletedDraft += 1;
    log("deletedDraft", template, dryRun ? "would delete invalid admin draft" : "deleted invalid admin draft");
    if (!dryRun) {
      await ensureBackup();
      await prisma.documentTemplate.delete({ where: { id: template.id } });
      await deleteTemplateContentFiles(template);
    }
    return;
  }

  const documentStructured = isStructuredTemplateContentRef(template.documentContentRef);
  const fieldModelStructured = isStructuredTemplateContentRef(template.fieldModelContentRef);
  if (documentStructured && fieldModelStructured) {
    counters.skipped += 1;
    log("skipped", template, "already structured");
    return;
  }
  if (documentStructured !== fieldModelStructured) {
    counters.errors += 1;
    log("error", template, "only one content ref is already structured");
    return;
  }

  const status = await templateContentFilesStatus(template);
  if (!status.documentExists || !status.fieldModelExists) {
    counters.missing += 1;
    log("missing", template, `document=${status.documentExists} fieldModel=${status.fieldModelExists}`);
    return;
  }

  const mode = template.status === "published" ? "version" : "draft";
  const refs = await planTemplateContentRefs({ template, space: template.space, mode });
  log("migrated", template, `${mode} -> ${refs.documentContentRef}`);

  if (!dryRun) {
    await ensureBackup();
    const content = await readTemplateContentJson(template);
    const metadata = await writeTemplateContentJson({
      template,
      space: template.space,
      ...content,
      mode,
    });
    await prisma.documentTemplate.update({
      where: { id: template.id },
      data: metadata,
    });
  }
  counters.migrated += 1;
}

async function isDiscardedAdminDraft(template: TemplateWithSpace) {
  if (template.id !== 18 || template.title !== "y" || template.status !== "draft") return false;
  if (!template.ownerUserId) return false;
  const owner = await prisma.user.findUnique({
    where: { id: template.ownerUserId },
    select: { username: true, nickname: true },
  });
  return owner?.username === "admin" || owner?.nickname === "admin";
}

async function ensureBackup() {
  if (backupCreated) return;
  const dbPath = databasePath();
  const stamp = timestamp();
  const backupPath = `${dbPath}.before-docs-editor-rehome-${stamp}.db`;
  await fs.copyFile(dbPath, backupPath);
  backupCreated = true;
  process.stdout.write(`backup: ${backupPath}\n`);
}

function databasePath() {
  const url = process.env["DATABASE_URL"] || "";
  if (!url.startsWith("file:")) {
    throw new Error("DATABASE_URL must use file: for docs editor content rehome");
  }
  const rawPath = url.slice("file:".length).replace(/^\/\/(?=\/)/, "");
  if (!path.isAbsolute(rawPath)) {
    throw new Error("DATABASE_URL must be an absolute file: path");
  }
  return rawPath;
}

function timestamp() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}${byType.get("month")}${byType.get("day")}-${byType.get("hour")}${byType.get("minute")}${byType.get("second")}`;
}

function log(kind: keyof typeof counters | "error", template: TemplateWithSpace, message: string) {
  process.stdout.write(`${kind}: #${template.id} ${template.title} :: ${message}\n`);
}

function printSummary() {
  process.stdout.write([
    "",
    `Docs editor content rehome ${dryRun ? "dry-run" : "result"}`,
    `migrated=${counters.migrated}`,
    `skipped=${counters.skipped}`,
    `missing=${counters.missing}`,
    `deletedDraft=${counters.deletedDraft}`,
    `errors=${counters.errors}`,
    "",
  ].join("\n"));
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
