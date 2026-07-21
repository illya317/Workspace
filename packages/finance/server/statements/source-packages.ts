import { createHash } from "node:crypto";

import type { StatementSourcePackageSnapshot } from "@workspace/finance/types";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { prisma } from "@workspace/platform/server/prisma";

import {
  buildSubmitStatementSourcePackageCommand,
  buildUploadStatementSourcePackageCommand,
  type SubmitStatementSourcePackageCommand,
  type UploadStatementSourcePackageCommand,
} from "../domain/statement-source-validation";
import { matchesStatementSourceCompany } from "./source-company";
import { parseFinancialStatementWorkbook } from "./source-workbook";

const REPORT_TYPES = ["balanceSheet", "incomeStatement", "cashFlow"] as const;

type SourcePackageRow = {
  id: number;
  companyId: number;
  companyCode: string;
  companyName: string;
  year: number;
  month: number;
  revision: number;
  version: number;
  status: string;
  fileName: string;
  fileSize: number;
  fileChecksum: string;
  parsedCompanyName: string;
  note: string | null;
  uploadedBy: number;
  uploadedAt: Date;
  submittedBy: number | null;
  submittedAt: Date | null;
  rejectionReason: string | null;
  sheets: Array<{
    reportType: string;
    previousYear: number;
    currentYear: number;
    lineCount: number;
  }>;
};

function sourcePackageSnapshot(row: SourcePackageRow): StatementSourcePackageSnapshot {
  return {
    id: row.id,
    companyId: row.companyId,
    companyCode: row.companyCode,
    companyName: row.companyName,
    year: row.year,
    month: row.month,
    revision: row.revision,
    version: row.version,
    status: row.status as StatementSourcePackageSnapshot["status"],
    fileName: row.fileName,
    fileSize: row.fileSize,
    fileChecksum: row.fileChecksum,
    parsedCompanyName: row.parsedCompanyName,
    note: row.note,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt.toISOString(),
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    sheets: row.sheets.map((sheet) => ({
      ...sheet,
      reportType: sheet.reportType as StatementSourcePackageSnapshot["sheets"][number]["reportType"],
    })),
  };
}

function validateParsedWorkbook(input: {
  parsedCompanyName: string;
  companyNames: Array<string | null>;
  requestedYear: number;
  sheets: Array<{ reportType: string; currentYear: number; lines: unknown[] }>;
}) {
  if (!matchesStatementSourceCompany(input.parsedCompanyName, input.companyNames)) {
    return `文件编制单位“${input.parsedCompanyName || "未识别"}”与所选公司不一致`;
  }
  const reportTypes = new Set(input.sheets.map((sheet) => sheet.reportType));
  const missing = REPORT_TYPES.filter((reportType) => !reportTypes.has(reportType));
  if (missing.length > 0) return `来源文件缺少报表页：${missing.join("、")}`;
  if (input.sheets.some((sheet) => sheet.currentYear !== input.requestedYear)) {
    return `来源文件年度与所选年度 ${input.requestedYear} 不一致`;
  }
  const empty = input.sheets.filter((sheet) => sheet.lines.length === 0).map((sheet) => sheet.reportType);
  if (empty.length > 0) return `来源文件没有识别到报表项目：${empty.join("、")}`;
  return null;
}

const packageInclude = {
  sheets: {
    select: {
      reportType: true,
      previousYear: true,
      currentYear: true,
      lineCount: true,
    },
    orderBy: { id: "asc" as const },
  },
};

export async function uploadStatementSourcePackage(rawCommand: UploadStatementSourcePackageCommand) {
  const validation = buildUploadStatementSourcePackageCommand(rawCommand, rawCommand.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.statements.sourcePackage.upload",
    actorUserId: command.userId,
    resourceKey: "finance.statements",
    scopeType: "global",
  });
  if (!direct.ok) return direct;

  const company = await prisma.company.findUnique({
    where: { code: command.companyCode },
    select: { id: true, code: true, name: true, fullName: true },
  });
  if (!company) return serviceError("所选公司不存在", 404);
  const bytes = Buffer.from(await command.file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  let parsed;
  try {
    parsed = parseFinancialStatementWorkbook(bytes, command.year);
  } catch (cause) {
    return serviceError(cause instanceof Error ? `三表文件解析失败：${cause.message}` : "三表文件解析失败", 400);
  }
  const parsedError = validateParsedWorkbook({
    parsedCompanyName: parsed.companyText,
    companyNames: [company.name, company.fullName],
    requestedYear: command.year,
    sheets: parsed.sheets,
  });
  if (parsedError) return serviceError(parsedError, 400);

  const duplicate = await prisma.financeStatementSourcePackage.findFirst({
    where: {
      companyId: company.id,
      year: command.year,
      month: command.month,
      fileChecksum: checksum,
    },
    include: packageInclude,
    orderBy: { revision: "desc" },
  });
  if (duplicate) return serviceError(`该文件已上传为来源包 v${duplicate.revision}`, 409);

  const created = await prisma.$transaction(async (tx) => {
    const latest = await tx.financeStatementSourcePackage.findFirst({
      where: { companyId: company.id, year: command.year, month: command.month },
      select: { revision: true },
      orderBy: { revision: "desc" },
    });
    return tx.financeStatementSourcePackage.create({
      data: {
        companyId: company.id,
        companyCode: company.code,
        companyName: company.name,
        year: command.year,
        month: command.month,
        revision: (latest?.revision ?? 0) + 1,
        fileName: command.file.name,
        mimeType: command.file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSize: command.file.size,
        fileChecksum: checksum,
        fileContent: bytes,
        parsedCompanyName: parsed.companyText,
        note: command.note,
        uploadedBy: command.userId,
        sheets: {
          create: parsed.sheets.map((sheet) => ({
            reportType: sheet.reportType,
            previousYear: sheet.previousYear,
            currentYear: sheet.currentYear,
            lineCount: sheet.lines.length,
            lines: {
              create: sheet.lines.map((line) => ({
                lineCode: line.lineCode,
                previousAmount: line.previousAmount,
                currentAmount: line.currentAmount,
                sourceLabel: line.sourceLabel,
                sortOrder: line.sortOrder,
              })),
            },
          })),
        },
      },
      include: packageInclude,
    });
  });
  return serviceOk({ sourcePackage: sourcePackageSnapshot(created) });
}

export async function listStatementSourcePackages(input: {
  companyCode: string;
  year: number;
  month: number;
}) {
  const rows = await prisma.financeStatementSourcePackage.findMany({
    where: { companyCode: input.companyCode, year: input.year, month: input.month },
    include: packageInclude,
    orderBy: { revision: "desc" },
  });
  return serviceOk({ sourcePackages: rows.map(sourcePackageSnapshot) });
}

class SourcePackageVersionConflict extends Error {}

export async function submitStatementSourcePackage(rawCommand: SubmitStatementSourcePackageCommand) {
  const validation = buildSubmitStatementSourcePackageCommand(
    rawCommand.packageId,
    rawCommand,
    rawCommand.userId,
  );
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const command = validation.data;
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "finance.statements.sourcePackage.submit",
    actorUserId: command.userId,
    resourceKey: "finance.statements",
    scopeType: "global",
  });
  if (!direct.ok) return direct;
  const sourcePackage = await prisma.financeStatementSourcePackage.findUnique({
    where: { id: command.packageId },
    include: { sheets: { include: { lines: { orderBy: { sortOrder: "asc" } } } } },
  });
  if (!sourcePackage) return serviceError("来源包不存在", 404);
  if (sourcePackage.status !== "draft") return serviceError("只有草稿来源包可以提交", 409);
  if (sourcePackage.version !== command.expectedVersion) return serviceError("来源包已被其他人处理，请刷新后重试", 409);
  if (sourcePackage.sheets.length !== REPORT_TYPES.length) return serviceError("来源包三表不完整", 400);

  try {
    const submitted = await prisma.$transaction(async (tx) => {
      const claimed = await tx.financeStatementSourcePackage.updateMany({
        where: { id: sourcePackage.id, version: command.expectedVersion, status: "draft" },
        data: {
          status: "submitted",
          version: { increment: 1 },
          submittedBy: command.userId,
          submittedAt: new Date(),
          note: command.note ?? sourcePackage.note,
        },
      });
      if (claimed.count !== 1) throw new SourcePackageVersionConflict();

      for (const sheet of sourcePackage.sheets) {
        for (const year of [sheet.previousYear, sheet.currentYear]) {
          const workpaper = await tx.financeStatementWorkpaper.upsert({
            where: {
              companyCode_year_month_reportType: {
                companyCode: sourcePackage.companyCode,
                year,
                month: sourcePackage.month,
                reportType: sheet.reportType,
              },
            },
            create: {
              companyCode: sourcePackage.companyCode,
              year,
              month: sourcePackage.month,
              reportType: sheet.reportType,
              status: "submitted",
              note: command.note ?? `来源包 v${sourcePackage.revision}：${sourcePackage.fileName}`,
              sourcePackageId: sourcePackage.id,
              sourcePackageRevision: sourcePackage.revision,
              sourceChecksum: sourcePackage.fileChecksum,
              updatedBy: command.userId,
              editedAt: new Date(),
            },
            update: {
              status: "submitted",
              note: command.note ?? `来源包 v${sourcePackage.revision}：${sourcePackage.fileName}`,
              sourcePackageId: sourcePackage.id,
              sourcePackageRevision: sourcePackage.revision,
              sourceChecksum: sourcePackage.fileChecksum,
              updatedBy: command.userId,
              editedAt: new Date(),
              version: { increment: 1 },
            },
          });
          await tx.financeStatementWorkpaperLine.deleteMany({ where: { workpaperId: workpaper.id } });
          await tx.financeStatementWorkpaperLine.createMany({
            data: sheet.lines.map((line) => ({
              workpaperId: workpaper.id,
              lineCode: line.lineCode,
              importedAmount: Number(year === sheet.currentYear ? line.currentAmount : line.previousAmount),
              source: `${sourcePackage.fileName}#${sourcePackage.fileChecksum.slice(0, 12)}`,
              note: line.sourceLabel,
              sortOrder: line.sortOrder,
            })),
          });
        }
      }
      return tx.financeStatementSourcePackage.findUniqueOrThrow({
        where: { id: sourcePackage.id },
        include: packageInclude,
      });
    });
    return serviceOk({ sourcePackage: sourcePackageSnapshot(submitted) });
  } catch (cause) {
    if (cause instanceof SourcePackageVersionConflict) {
      return serviceError("来源包已被其他人处理，请刷新后重试", 409);
    }
    throw cause;
  }
}
