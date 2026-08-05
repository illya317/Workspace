import type {
  ConsolidationBatchSnapshot,
  ConsolidationPriorLineReference,
  ConsolidationPriorReference,
  ConsolidationPriorReferences,
  StatementReportType,
} from "@workspace/finance/types";
import { prisma } from "@workspace/platform/server/prisma";

const PRIOR_BATCH_STATUSES = ["locked", "published"] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown) {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceRows(reportType: StatementReportType, reportPayload: unknown): Record<string, unknown>[] {
  const envelope = record(reportPayload);
  const payload = record(envelope?.payload) ?? envelope;
  if (!payload) return [];
  if (reportType === "balanceSheet") {
    return [payload.assets, payload.liabilities, payload.equity]
      .flatMap((value) => Array.isArray(value) ? value : [])
      .flatMap((value) => {
        const row = record(value);
        return row ? [row] : [];
      });
  }
  return Array.isArray(payload.lines)
    ? payload.lines.flatMap((value) => {
      const row = record(value);
      return row ? [row] : [];
    })
    : [];
}

interface PriorSourceAmounts {
  sourceAmount?: number;
  currentMonthSourceAmount?: number;
}

function extractPriorReference(input: {
  batchId: number;
  year: number;
  month: number;
  entities: { id: number; companyId: number }[];
  sources: { entitySnapshotId: number; reportType: string; reportPayload: unknown }[];
  reportPayload: unknown;
}): ConsolidationPriorReference | null {
  const report = record(input.reportPayload);
  const statements = Array.isArray(report?.statements) ? report.statements : null;
  if (!statements) return null;
  const companyIdBySnapshotId = new Map(input.entities.map((entity) => [entity.id, entity.companyId]));
  const sourceAmounts = new Map<string, PriorSourceAmounts>();
  for (const source of input.sources) {
    const companyId = companyIdBySnapshotId.get(source.entitySnapshotId);
    if (companyId === undefined) continue;
    for (const row of sourceRows(source.reportType as StatementReportType, source.reportPayload)) {
      const lineCode = typeof row.lineCode === "string" ? row.lineCode.trim() : "";
      if (!lineCode) continue;
      const amount = finiteNumber(row.amount);
      const currentMonthAmount = finiteNumber(row.currentMonthAmount);
      sourceAmounts.set(`${companyId}:${source.reportType}:${lineCode}`, {
        ...(amount === null ? {} : { sourceAmount: amount }),
        ...(currentMonthAmount === null ? {} : { currentMonthSourceAmount: currentMonthAmount }),
      });
    }
  }
  const companies: ConsolidationPriorReference["companies"] = {};
  const groupStatements: NonNullable<ConsolidationPriorReference["groupStatements"]> = {};
  for (const statementValue of statements) {
    const statement = record(statementValue);
    if (!statement) continue;
    const reportType = statement.reportType;
    if (reportType !== "balanceSheet" && reportType !== "incomeStatement" && reportType !== "cashFlow") continue;
    const lines = Array.isArray(statement.lines) ? statement.lines : [];
    for (const lineValue of lines) {
      const line = record(lineValue);
      if (!line) continue;
      const lineCode = typeof line.lineCode === "string" ? line.lineCode : "";
      if (!lineCode) continue;
      const groupAmount = finiteNumber(line.amount);
      const groupCurrentMonthAmount = finiteNumber(line.currentMonthAmount);
      if (groupAmount !== null) {
        groupStatements[reportType] = [...(groupStatements[reportType] ?? []), {
          lineCode,
          cnyAmount: groupAmount,
          ...(groupCurrentMonthAmount === null ? {} : { currentMonthCnyAmount: groupCurrentMonthAmount }),
        }];
      }
      const entityAmounts = Array.isArray(line.entityAmounts) ? line.entityAmounts : [];
      for (const entityValue of entityAmounts) {
        const entity = record(entityValue);
        const entitySnapshotId = finiteNumber(entity?.entitySnapshotId);
        const cnyAmount = finiteNumber(entity?.amount);
        if (entitySnapshotId === null || cnyAmount === null) continue;
        const companyId = companyIdBySnapshotId.get(entitySnapshotId);
        if (companyId === undefined) continue;
        const currentMonthCnyAmount = finiteNumber(entity?.currentMonthAmount);
        const source = sourceAmounts.get(`${companyId}:${reportType}:${lineCode}`) ?? {};
        const reference: ConsolidationPriorLineReference = {
          lineCode,
          cnyAmount,
          ...(currentMonthCnyAmount === null ? {} : { currentMonthCnyAmount }),
          ...source,
        };
        const company = companies[companyId] ?? {};
        company[reportType] = [...(company[reportType] ?? []), reference];
        companies[companyId] = company;
      }
    }
  }
  return { batchId: input.batchId, year: input.year, month: input.month, companies, groupStatements };
}

async function loadPriorReference(
  batch: ConsolidationBatchSnapshot,
  year: number,
  month: number,
): Promise<ConsolidationPriorReference | null> {
  const row = await prisma.financeConsolidationBatch.findFirst({
    where: {
      parentCompanyId: batch.parentCompanyId,
      year,
      month,
      periodKind: batch.periodKind,
      status: { in: [...PRIOR_BATCH_STATUSES] },
    },
    orderBy: { version: "desc" },
    include: { entities: true, sources: true, outputSnapshot: true },
  });
  if (!row?.outputSnapshot) return null;
  return extractPriorReference({
    batchId: row.id,
    year: row.year,
    month: row.month,
    entities: row.entities.map((entity) => ({ id: entity.id, companyId: entity.companyId })),
    sources: row.sources.map((source) => ({
      entitySnapshotId: source.entitySnapshotId,
      reportType: source.reportType,
      reportPayload: source.reportPayload,
    })),
    reportPayload: row.outputSnapshot.reportPayload,
  });
}

export async function loadConsolidationPriorReferences(
  batch: ConsolidationBatchSnapshot,
): Promise<ConsolidationPriorReferences> {
  const [yearOpening, comparativePeriod, monthOpening] = await Promise.all([
    loadPriorReference(batch, batch.year - 1, 12),
    loadPriorReference(batch, batch.year - 1, batch.month),
    batch.month > 1
      ? loadPriorReference(batch, batch.year, batch.month - 1)
      : Promise.resolve(null),
  ]);
  return { yearOpening, comparativePeriod, monthOpening };
}

export interface ConsolidationPriorReferenceCoverage {
  entitySnapshotId: number;
  yearOpening: boolean;
  comparativePeriod: boolean;
  monthOpening: boolean;
}

export function consolidationPriorReferenceCoverage(
  entities: readonly { id: number; companyId: number }[],
  priorReferences: ConsolidationPriorReferences | null | undefined,
): ConsolidationPriorReferenceCoverage[] | undefined {
  if (!priorReferences) return undefined;
  return entities.map((entity) => ({
    entitySnapshotId: entity.id,
    yearOpening: Boolean(
      priorReferences.yearOpening?.companies[entity.companyId]?.balanceSheet
      && priorReferences.yearOpening?.companies[entity.companyId]?.cashFlow,
    ),
    comparativePeriod: Boolean(
      priorReferences.comparativePeriod?.companies[entity.companyId]?.incomeStatement
      && priorReferences.comparativePeriod?.companies[entity.companyId]?.cashFlow,
    ),
    monthOpening: Boolean(priorReferences.monthOpening?.companies[entity.companyId]?.cashFlow),
  }));
}
