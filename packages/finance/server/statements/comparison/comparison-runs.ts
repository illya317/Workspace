import { prisma, Prisma } from "@workspace/platform/server/prisma";

import { canonicalFingerprint } from "../amount-explanation/fingerprint";
import { AMOUNT_EXPLANATION_ORCHESTRATOR_VERSION } from "../amount-explanation/service";
import {
  validateComparisonRunCommand,
  validateComparisonRunFailure,
  validateComparisonRunLines,
} from "../../domain/statement-comparison-validation";
import type { ComparisonRunLineInput } from "./comparison-lines";
import { WORKBOOK_INGEST_VERSION } from "./ingest";
import { defaultWorkbookIngestLimits } from "./limits";
import {
  assertComparisonValid,
  assertStatementComparisonEnabled,
  StatementComparisonStateError,
  type StatementComparisonDb,
} from "./service";
import type { WorkbookAnalysisSnapshot } from "./workbook-dto";

/**
 * 对比 run 生命周期（计划 §6，Package 5）：追加式；完成后不可变；rerun 新建记录。
 * 共享错误/开关/db 类型集中在 ./service；本模块只做 run 的创建与收口。
 */

// ─── Run 生命周期（追加式；完成后不可变；rerun 新建）──────────────────────

export interface CreateComparisonRunInput {
  mappingId: number;
  createdBy: number;
  db?: StatementComparisonDb;
  /** Package 6 run 执行接线注入；创建时冻结 solver adapter 身份与版本。 */
  solverAdapterId?: string | null;
  solverAdapterVersion?: string | null;
}

export interface CreatedComparisonRun {
  runId: number;
  inputFingerprint: string;
  configFingerprint: string;
}

const ORCHESTRATOR_ID = "finance-amount-explanation-orchestrator";

export async function createComparisonRun(input: CreateComparisonRunInput): Promise<CreatedComparisonRun> {
  const db = input.db ?? prisma;
  await assertStatementComparisonEnabled(db);
  assertComparisonValid(validateComparisonRunCommand({
    mappingId: input.mappingId,
    createdBy: input.createdBy,
  }));

  const mapping = await db.financeStatementComparisonMapping.findUnique({
    where: { id: input.mappingId },
    select: {
      id: true,
      revision: true,
      status: true,
      workbookSha256: true,
      targetFingerprint: true,
      package: { select: { sha256: true, workbookSnapshot: true } },
    },
  });
  if (!mapping) throw new StatementComparisonStateError(`映射 ${input.mappingId} 不存在`);
  if (mapping.status !== "confirmed") {
    throw new StatementComparisonStateError("映射未确认，不能创建对比运行");
  }
  if (mapping.package.sha256 !== mapping.workbookSha256) {
    // 证据包指纹漂移：先把映射显式失效（友好错误先于 trigger），再拒绝建 run。
    await db.financeStatementComparisonMapping.updateMany({
      where: { id: mapping.id, revision: mapping.revision },
      data: { status: "invalidated", revision: { increment: 1 } },
    });
    throw new StatementComparisonStateError("证据包指纹已变化，映射已失效，请重新确认后再运行");
  }

  const snapshot = mapping.package.workbookSnapshot as unknown as WorkbookAnalysisSnapshot;
  const configFingerprint = canonicalFingerprint({
    limits: defaultWorkbookIngestLimits(),
    ingestVersion: WORKBOOK_INGEST_VERSION,
  });
  const inputFingerprint = canonicalFingerprint({
    mappingId: mapping.id,
    mappingRevision: mapping.revision,
    workbookSha256: mapping.workbookSha256,
    targetFingerprint: mapping.targetFingerprint,
  });

  const created = await db.financeStatementComparisonRun.create({
    data: {
      mappingId: mapping.id,
      targetFingerprint: mapping.targetFingerprint,
      orchestratorId: ORCHESTRATOR_ID,
      orchestratorVersion: AMOUNT_EXPLANATION_ORCHESTRATOR_VERSION,
      formulaAdapterId: snapshot?.recalculation?.adapterId ?? null,
      formulaAdapterVersion: snapshot?.recalculation?.adapterVersion ?? null,
      solverAdapterId: input.solverAdapterId ?? null,
      solverAdapterVersion: input.solverAdapterVersion ?? null,
      configFingerprint,
      status: "running",
      inputFingerprint,
      createdBy: input.createdBy,
    },
    select: { id: true },
  });
  return { runId: created.id, inputFingerprint, configFingerprint };
}

export interface CompleteComparisonRunInput {
  runId: number;
  lines: ComparisonRunLineInput[];
  summary: unknown;
  db?: StatementComparisonDb;
}

export async function completeComparisonRun(input: CompleteComparisonRunInput): Promise<void> {
  const db = input.db ?? prisma;
  await assertStatementComparisonEnabled(db);
  // 友好错误先于唯一约束：lineCode/sourceCell 在一个 run 内不得重复。
  assertComparisonValid(validateComparisonRunLines(input.lines));

  const run = await db.financeStatementComparisonRun.findUnique({
    where: { id: input.runId },
    select: { id: true, status: true, inputFingerprint: true },
  });
  if (!run) throw new StatementComparisonStateError(`对比运行 ${input.runId} 不存在`);
  if (run.status !== "running") {
    throw new StatementComparisonStateError("对比运行已完成或失败，不能重复写入；请创建新的运行");
  }

  const outputFingerprint = canonicalFingerprint({
    inputFingerprint: run.inputFingerprint,
    lines: input.lines.map((line) => [
      line.lineCode,
      line.externalAmount,
      line.systemAmount,
      line.differenceAmount,
      line.explanationStatus,
    ]),
  });

  await db.$transaction(async (tx) => {
    await tx.financeStatementComparisonLine.createMany({
      data: input.lines.map((line) => ({
        runId: input.runId,
        lineCode: line.lineCode,
        lineLabel: line.lineLabel,
        sortOrder: line.sortOrder,
        sourceSheet: line.sourceSheet,
        sourceCell: line.sourceCell,
        externalAmount: line.externalAmount,
        systemAmount: line.systemAmount,
        differenceAmount: line.differenceAmount,
        explainedAmount: line.explainedAmount,
        residualAmount: line.residualAmount,
        explanationStatus: line.explanationStatus,
        explanationMethod: line.explanationMethod,
        evidence: line.evidence === undefined ? Prisma.JsonNull : (line.evidence as Prisma.InputJsonValue),
        alternatives: line.alternatives === undefined ? Prisma.JsonNull : (line.alternatives as Prisma.InputJsonValue),
        diagnostics: line.diagnostics === undefined ? Prisma.JsonNull : (line.diagnostics as Prisma.InputJsonValue),
      })),
    });
    await tx.financeStatementComparisonRun.update({
      where: { id: input.runId },
      data: {
        status: "completed",
        summary: input.summary as Prisma.InputJsonValue,
        outputFingerprint,
        completedAt: new Date(),
      },
    });
  });
}

export async function failComparisonRun(
  runId: number,
  failureCode: string,
  failureMessage: string,
  db: StatementComparisonDb = prisma,
): Promise<void> {
  await assertStatementComparisonEnabled(db);
  assertComparisonValid(validateComparisonRunFailure({ runId, failureCode }));
  const run = await db.financeStatementComparisonRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });
  if (!run) throw new StatementComparisonStateError(`对比运行 ${runId} 不存在`);
  if (run.status !== "running") {
    throw new StatementComparisonStateError("对比运行已完成或失败，不能重复写入");
  }
  await db.financeStatementComparisonRun.update({
    where: { id: runId },
    data: { status: "failed", failureCode, failureMessage, completedAt: new Date() },
  });
}

