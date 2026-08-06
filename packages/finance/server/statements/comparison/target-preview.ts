import { prisma } from "@workspace/platform/server/prisma";
import type { StatementTargetRef } from "@workspace/finance/types/statement-explanation";

import {
  computeEntityComparisonTargetFingerprint,
  defaultLoadEntityReportLines,
  entitySystemLines,
  FALLBACK_CURRENCY_CODE,
  findConsolidatedPayloadStatement,
  type ComparisonRunExecutionDb,
  type ConsolidatedOutputLinePayload,
  type EntityReportLinesLoader,
} from "./run-execution";
import {
  assertStatementComparisonEnabled,
  StatementComparisonStateError,
} from "./service";

/**
 * 对比目标预览（Package 7 目标选择：可见系统指纹/版本，只读）。
 * 与 mapping 确认/run 执行使用同一指纹函数与同一快照查找（run-execution），
 * 保证可见指纹即绑定指纹。只读：不写任何表。
 */

export type ComparisonTargetPreviewSelection =
  | {
      kind: "entity";
      companyCode: string;
      year: number;
      month: number;
      periodKind: "monthly" | "cumulative";
      reportType: "balance" | "income" | "cashflow";
    }
  | {
      kind: "consolidated";
      batchId: number;
      reportType: "balance" | "income" | "cashflow";
    };

export interface ComparisonTargetPreview {
  target: StatementTargetRef;
  /** 系统目标行数（预览展示；不代表可对比行数）。 */
  lineCount: number;
  currencyCode: string;
  /** 展示用目标描述（公司/批次 + 版本）。 */
  targetLabel: string;
}

export type ComparisonTargetPreviewDb = ComparisonRunExecutionDb &
  Pick<typeof prisma, "financeConsolidationBatch">;

export async function previewStatementComparisonTarget(
  selection: ComparisonTargetPreviewSelection,
  db: ComparisonTargetPreviewDb = prisma,
  loadEntityReportLines: EntityReportLinesLoader = defaultLoadEntityReportLines,
): Promise<ComparisonTargetPreview> {
  await assertStatementComparisonEnabled(db);
  if (selection.kind === "entity") {
    const company = await db.company.findUnique({
      where: { code: selection.companyCode },
      select: {
        id: true,
        code: true,
        party: { select: { name: true } },
        financeCurrencyPolicy: { select: { currency: { select: { code: true } } } },
      },
    });
    if (!company) throw new StatementComparisonStateError(`对比目标公司 ${selection.companyCode} 不存在`);
    const lines = await loadEntityReportLines({
      companyCode: company.code,
      year: selection.year,
      month: selection.month,
      reportType: selection.reportType,
    });
    const systemLines = entitySystemLines(lines, selection.reportType, selection.periodKind);
    const target: StatementTargetRef = {
      kind: "entity",
      companyId: company.id,
      year: selection.year,
      month: selection.month,
      periodKind: selection.periodKind,
      reportType: selection.reportType,
      targetFingerprint: "",
    };
    target.targetFingerprint = computeEntityComparisonTargetFingerprint({ target, systemLines });
    return {
      target,
      lineCount: systemLines.length,
      currencyCode: company.financeCurrencyPolicy?.currency.code ?? FALLBACK_CURRENCY_CODE,
      targetLabel: `${company.party?.name ?? company.code} ${selection.year}年${selection.month}月`,
    };
  }
  const [batch, snapshot] = await Promise.all([
    db.financeConsolidationBatch.findUnique({
      where: { id: selection.batchId },
      select: { id: true, parentCompanyId: true, parentCompanyName: true, year: true, month: true, version: true },
    }),
    db.financeConsolidationOutputSnapshot.findUnique({
      where: { batchId: selection.batchId },
      select: { id: true, batchId: true, outputFingerprint: true, reportPayload: true },
    }),
  ]);
  if (!batch) throw new StatementComparisonStateError(`合并批次 ${selection.batchId} 不存在`);
  if (!snapshot) {
    throw new StatementComparisonStateError("该合并批次尚无锁定输出快照，请先确认锁定或发布");
  }
  const payload = snapshot.reportPayload as {
    batch?: { presentationCurrency?: string };
    statements?: Array<{ reportType: string; lines?: ConsolidatedOutputLinePayload[] }>;
  };
  const statement = findConsolidatedPayloadStatement(payload.statements, selection.reportType);
  if (!statement || !Array.isArray(statement.lines)) {
    throw new StatementComparisonStateError("合并输出快照缺少目标报表类型的行数据");
  }
  return {
    target: {
      kind: "consolidated",
      parentCompanyId: batch.parentCompanyId,
      batchId: batch.id,
      outputSnapshotId: snapshot.id,
      reportType: selection.reportType,
      targetFingerprint: snapshot.outputFingerprint,
    },
    lineCount: statement.lines.length,
    currencyCode: payload.batch?.presentationCurrency ?? FALLBACK_CURRENCY_CODE,
    targetLabel: `${batch.parentCompanyName} 合并批次 #${batch.id}（${batch.year}年${batch.month}月 V${batch.version}）`,
  };
}
