import type { AuthoritativeLibraryArtifact } from "@workspace/platform/server/authoritative-library-source-contract";
import { encodeAuthoritativeLibraryContent } from "@workspace/platform/server/authoritative-library-source-contract";
import { prisma } from "@workspace/platform/server/prisma";

import type { ConsolidatedReportOutputPackage, StatementReportType } from "../../types";
import {
  type StatementPageData,
  type StatementPageLine,
  type StatementPageStatement,
} from "./statement-page-data";
import { consolidationFingerprint } from "./consolidation-fingerprints";
import { buildStatementWorkbook } from "./statement-workbook";

const SOURCE_KEY = "finance-report";
const OWNER_UNIT_ID = "finance";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const REPORT_TYPES: StatementReportType[] = ["balanceSheet", "incomeStatement", "cashFlow"];

type SourceReportLine = Partial<StatementPageLine> & {
  lineCode?: string;
  label?: string;
  amount?: number;
};

type SourceReportPayload = {
  type?: "balance" | "income" | "cashflow";
  source?: "system" | "empty";
  diagnostics?: Array<string | { message?: string }>;
  assets?: SourceReportLine[];
  liabilities?: SourceReportLine[];
  equity?: SourceReportLine[];
  lines?: SourceReportLine[];
  totalLiabilitiesAndEquity?: number;
  previousTotalLiabilitiesAndEquity?: number;
};

function periodEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function unwrapSourcePayload(value: unknown): SourceReportPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("单体报表冻结快照格式无效");
  }
  const wrapper = value as Record<string, unknown>;
  const payload = wrapper.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("单体报表冻结快照缺少报表正文");
  }
  return payload as SourceReportPayload;
}

function money(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round((value + Number.EPSILON) * 100) / 100
    : 0;
}

function normalizeLine(line: SourceReportLine): StatementPageLine {
  if (!line.lineCode?.trim() || !line.label?.trim()) throw new Error("单体报表冻结快照存在无效行");
  return {
    lineCode: line.lineCode,
    code: line.code?.trim() || null,
    label: line.label,
    amount: money(line.amount),
    ...(line.currentMonthAmount === undefined ? {} : { currentMonthAmount: money(line.currentMonthAmount) }),
    previousAmount: money(line.previousAmount),
    section: line.section?.trim() || "other",
    side: line.side === "credit" ? "credit" : "debit",
    direction: line.direction === "in" || line.direction === "out" || line.direction === "net"
      ? line.direction
      : null,
    subtract: line.subtract === true,
    isHeader: line.isHeader === true,
    isTotal: line.isTotal === true,
    isGrandTotal: line.isGrandTotal === true,
  };
}

function statementFromSnapshot(reportType: StatementReportType, value: unknown): StatementPageStatement {
  const payload = unwrapSourcePayload(value);
  const rawLines = reportType === "balanceSheet"
    ? [...(payload.assets ?? []), ...(payload.liabilities ?? []), ...(payload.equity ?? [])]
    : payload.lines ?? [];
  const lines = rawLines.map(normalizeLine);
  const totals = Object.fromEntries(
    lines.filter((line) => line.isTotal || line.isGrandTotal).map((line) => [line.lineCode, line.amount]),
  );
  if (reportType === "balanceSheet") {
    totals.totalLiabilitiesAndEquity = money(payload.totalLiabilitiesAndEquity);
    totals.previousTotalLiabilitiesAndEquity = money(payload.previousTotalLiabilitiesAndEquity);
  }
  return {
    reportType,
    label: reportType === "balanceSheet" ? "资产负债表" : reportType === "incomeStatement" ? "利润表" : "现金流量表",
    source: payload.source ?? "system",
    diagnostics: (payload.diagnostics ?? []).map((item) => (
      typeof item === "string" ? item : item.message?.trim() || "报表存在未说明的诊断事项"
    )),
    lines,
    totals,
  };
}

function consolidatedDataFromVerifiedOutput(input: {
  batch: {
    id: number;
    parentCompanyCode: string;
    parentCompanyName: string;
    year: number;
    month: number;
    periodKind: string;
    status: string;
  };
  outputFingerprint: string;
  generatedAt: Date;
  reportPayload: unknown;
}): StatementPageData {
  if (!input.reportPayload || typeof input.reportPayload !== "object" || Array.isArray(input.reportPayload)) {
    throw new Error("合并报表正式输出快照格式无效");
  }
  const report = input.reportPayload as ConsolidatedReportOutputPackage;
  if (report.batch?.id !== input.batch.id || !Array.isArray(report.statements)) {
    throw new Error("合并报表正式输出快照与批次不匹配");
  }
  if (report.generatedAt !== input.generatedAt.toISOString()) {
    throw new Error("合并报表正式输出快照生成时间不一致");
  }
  if (consolidationFingerprint(report) !== input.outputFingerprint) {
    throw new Error("合并报表正式输出快照正文指纹不一致");
  }
  return {
    mode: "consolidated",
    scope: {
      companyCode: input.batch.parentCompanyCode,
      companyName: input.batch.parentCompanyName,
      year: input.batch.year,
      month: input.batch.month,
      periodKind: input.batch.periodKind as StatementPageData["scope"]["periodKind"],
      batchId: input.batch.id,
      batchStatus: input.batch.status as StatementPageData["scope"]["batchStatus"],
    },
    statements: report.statements.map((statement) => ({
      reportType: statement.reportType,
      label: statement.label,
      source: "consolidated",
      diagnostics: [],
      lines: statement.lines.map((line) => ({
        lineCode: line.lineCode,
        code: line.code,
        label: line.label,
        amount: money(line.amount),
        ...(line.currentMonthAmount === undefined ? {} : { currentMonthAmount: money(line.currentMonthAmount) }),
        previousAmount: money(line.previousAmount),
        section: line.section,
        side: line.side,
        direction: line.direction,
        subtract: line.subtract,
        isHeader: line.isHeader,
        isTotal: line.isTotal,
        isGrandTotal: line.isGrandTotal,
      })),
      totals: { ...statement.totals },
    })),
  };
}

export async function loadFinanceLibrarySource(sourceKey: string): Promise<AuthoritativeLibraryArtifact[]> {
  if (sourceKey !== SOURCE_KEY) throw new Error("不支持的财务资料来源");
  const batch = await prisma.financeConsolidationBatch.findFirst({
    where: { status: { in: ["locked", "published"] } },
    include: {
      entities: { orderBy: { companyCode: "asc" } },
      sources: { orderBy: [{ entitySnapshotId: "asc" }, { reportType: "asc" }] },
      outputSnapshot: true,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }, { version: "desc" }],
  });
  if (!batch) throw new Error("Workspace 中没有已锁定或已发布的合并报表");
  if (!batch.outputSnapshot) throw new Error("合并报表尚未生成正式输出快照");
  const verifiedAt = batch.publishedAt ?? batch.lockedAt;
  if (!verifiedAt) throw new Error("合并报表缺少锁定或发布时间");

  const period = `${batch.year}.${String(batch.month).padStart(2, "0")}`;
  const asOfDate = periodEndDate(batch.year, batch.month);
  const batchEvidence = [
    `FinanceConsolidationBatch#${batch.id}:${batch.status}:v${batch.version}`,
    `output-sha256:${batch.outputSnapshot.outputFingerprint}`,
  ];
  const artifacts: AuthoritativeLibraryArtifact[] = [];
  const sourceByEntityAndType = new Map(batch.sources.map((source) => (
    [`${source.entitySnapshotId}:${source.reportType}`, source] as const
  )));
  for (const entity of batch.entities) {
    const statements = REPORT_TYPES.map((reportType) => {
      const source = sourceByEntityAndType.get(`${entity.id}:${reportType}`);
      if (!source || source.sourceStatus !== "submitted" || source.sourcePackageStatus !== "submitted") {
        throw new Error(`${entity.companyName} 的${reportType}不是已提交来源，不能进入资料库`);
      }
      return statementFromSnapshot(reportType, source.reportPayload);
    });
    const standalone: StatementPageData = {
      mode: "standalone",
      scope: {
        companyCode: entity.companyCode,
        companyName: entity.companyName,
        year: batch.year,
        month: batch.month,
        periodKind: batch.periodKind as StatementPageData["scope"]["periodKind"],
        batchId: null,
        batchStatus: null,
      },
      statements,
    };
    artifacts.push({
      sourceKey,
      ownerUnitId: OWNER_UNIT_ID,
      identityKey: `latest-verified-standalone-${entity.companyCode}`,
      title: `${period} ${entity.companyName} 单体财务报表`,
      summary: `${period} ${entity.companyName} 单体财务报表。`,
      fileName: `${entity.companyName.replace(/[\\/:*?"<>|]/g, "_")}-${period}-单体财务报表.xlsx`,
      mimeType: XLSX_MIME,
      extension: "xlsx",
      contentBase64: encodeAuthoritativeLibraryContent(buildStatementWorkbook(standalone)),
      asOfDate,
      verifiedAt: verifiedAt.toISOString(),
      evidence: [...batchEvidence, `${entity.companyCode}:${entity.companyName}:submitted`],
    });
  }

  const consolidated = consolidatedDataFromVerifiedOutput({
    batch,
    outputFingerprint: batch.outputSnapshot.outputFingerprint,
    generatedAt: batch.outputSnapshot.generatedAt,
    reportPayload: batch.outputSnapshot.reportPayload,
  });
  artifacts.push({
    sourceKey,
    ownerUnitId: OWNER_UNIT_ID,
    // Reuse the original stable identity so the former combined workbook is
    // replaced by the consolidated-only workbook instead of lingering beside it.
    identityKey: "latest-verified-financial-statements",
    title: `${period} ${batch.parentCompanyName} 合并财务报表`,
    summary: `${period} ${batch.parentCompanyName} 合并财务报表。`,
    fileName: `${batch.parentCompanyName.replace(/[\\/:*?"<>|]/g, "_")}-${period}-合并财务报表.xlsx`,
    mimeType: XLSX_MIME,
    extension: "xlsx",
    contentBase64: encodeAuthoritativeLibraryContent(buildStatementWorkbook(consolidated)),
    asOfDate,
    verifiedAt: verifiedAt.toISOString(),
    evidence: [
      ...batchEvidence,
      ...batch.entities.map((entity) => `${entity.companyCode}:${entity.companyName}:submitted`),
    ],
  });
  return artifacts;
}
