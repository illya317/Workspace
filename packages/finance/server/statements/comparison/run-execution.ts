import { createCombinationSolver, type CombinationSolverAdapter } from "@workspace/platform/server/combination-solver";
import { prisma } from "@workspace/platform/server/prisma";
import type {
  AmountOriginQuery,
  AmountOriginResult,
  StatementTargetRef,
} from "@workspace/finance/types/statement-explanation";

import {
  decimalLikeToMinorUnits,
  formatMinorUnits,
  LEDGER_MONEY_SCALE,
  numberToMinorUnits,
} from "../amount-explanation/decimal";
import { canonicalFingerprint } from "../amount-explanation/fingerprint";
import { explainAmountOrigin } from "../amount-explanation/service";
import { generateFinanceReport } from "../report-generator";
import {
  buildComparisonLines,
  type ComparisonRunLineInput,
  type SystemStatementLine,
} from "./comparison-lines";
import {
  completeComparisonRun,
  createComparisonRun,
  failComparisonRun,
} from "./comparison-runs";
import type { DetectedStatementStructure, LineMappingEntry } from "./mapping";
import {
  assertStatementComparisonEnabled,
  invalidateComparisonMapping,
  StatementComparisonStateError,
  type StatementComparisonDb,
} from "./service";
import type { WorkbookAnalysisSnapshot } from "./workbook-dto";

/**
 * 对比 run 执行接线（计划 §7/§9 Package 6）。
 *
 * run 生命周期：解析系统目标行 -> 校验目标指纹（stale 即 CAS 失效映射并拒绝）
 * -> createComparisonRun（冻结 adapter 版本与指纹）-> 逐行调 Package 3
 * explainAmountOrigin -> buildComparisonLines 生成行快照 -> completeComparisonRun
 * 落 immutable run + lines。同步执行；任何未捕获失败落 failed + failureCode。
 *
 * 固定边界：只写 comparison 四表；系统报表/凭证/合并/重分类/FX 事实零写。
 */

export type ComparisonRunExecutionDb = StatementComparisonDb &
  Pick<typeof prisma, "company" | "financeConsolidationOutputSnapshot">;

export type ComparisonLineExplainFn = (query: AmountOriginQuery) => Promise<AmountOriginResult>;

export interface EntityReportLinePayload {
  lineCode: string;
  label: string;
  amount?: unknown;
  currentMonthAmount?: unknown;
}

export type EntityReportLinesLoader = (input: {
  companyCode: string;
  year: number;
  month: number;
  reportType: "balance" | "income" | "cashflow";
}) => Promise<readonly EntityReportLinePayload[]>;

export const FALLBACK_CURRENCY_CODE = "CNY";

// ─── 系统目标解析（entity=确定性报表输入；consolidated=绑定的输出快照）────────

/** 默认 entity 报表加载：复用与页面一致的确定性报表生成器（只读）。 */
export const defaultLoadEntityReportLines: EntityReportLinesLoader = async (input) => {
  const response = await generateFinanceReport({
    companyCode: input.companyCode,
    year: input.year,
    month: input.month,
    periodKind: "month",
    reportType: input.reportType,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new StatementComparisonStateError(payload?.error ?? "系统报表生成失败，无法解析对比目标");
  }
  const payload = (await response.json()) as Record<string, unknown>;
  if (input.reportType === "balance") {
    const sections = [payload.assets, payload.liabilities, payload.equity];
    return sections.flatMap((section) =>
      Array.isArray(section) ? (section as EntityReportLinePayload[]) : [],
    );
  }
  return Array.isArray(payload.lines) ? (payload.lines as EntityReportLinePayload[]) : [];
};

function flowAmountMinor(line: EntityReportLinePayload, periodKind: string | null): bigint | null {
  const raw = periodKind === "monthly" && line.currentMonthAmount !== undefined
    ? line.currentMonthAmount
    : line.amount;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return numberToMinorUnits(raw, LEDGER_MONEY_SCALE);
}

export function entitySystemLines(
  lines: readonly EntityReportLinePayload[],
  reportType: string,
  periodKind: string | null,
): SystemStatementLine[] {
  return lines.map((line, index) => ({
    lineCode: line.lineCode,
    label: line.label,
    sortOrder: index,
    // 资产负债表只有期末余额一列；流量表按 periodKind 选当月/本年累计。
    amountMinor: reportType === "balance"
      ? flowAmountMinor(line, "cumulative")
      : flowAmountMinor(line, periodKind),
  }));
}

/**
 * entity 对比目标指纹：确定性报表输入（公司/年月/periodKind/报表类型 + 解析后行金额）
 * 的 canonical 指纹。mapping 确认与 run 执行必须使用同一函数，指纹才能比对。
 */
export function computeEntityComparisonTargetFingerprint(input: {
  target: Extract<StatementTargetRef, { kind: "entity" }>;
  systemLines: readonly SystemStatementLine[];
}): string {
  const { target } = input;
  return canonicalFingerprint({
    kind: "finance-statement-comparison-entity-target",
    companyId: target.companyId,
    year: target.year,
    month: target.month,
    periodKind: target.periodKind,
    reportType: target.reportType,
    lines: input.systemLines.map((line) => [
      line.lineCode,
      line.amountMinor === null ? null : line.amountMinor.toString(),
    ]),
  });
}

interface ComparisonMappingRecord {
  id: number;
  revision: number;
  status: string;
  targetKind: string;
  targetCompanyId: number | null;
  targetParentCompanyId: number | null;
  targetBatchId: number | null;
  targetOutputSnapshotId: number | null;
  year: number | null;
  month: number | null;
  periodKind: string | null;
  reportType: string;
  targetFingerprint: string;
  structureMapping: unknown;
  lineMapping: unknown;
  package: { sha256: string; workbookSnapshot: unknown };
}

export function comparisonTargetFromMapping(mapping: ComparisonMappingRecord): StatementTargetRef {
  if (mapping.targetKind === "entity") {
    if (!mapping.targetCompanyId || !mapping.year || !mapping.month || !mapping.periodKind) {
      throw new StatementComparisonStateError("映射缺少单体目标字段，无法解析对比目标");
    }
    return {
      kind: "entity",
      companyId: mapping.targetCompanyId,
      year: mapping.year,
      month: mapping.month,
      periodKind: mapping.periodKind === "monthly" ? "monthly" : "cumulative",
      reportType: mapping.reportType as "balance" | "income" | "cashflow",
      targetFingerprint: mapping.targetFingerprint,
    };
  }
  if (!mapping.targetParentCompanyId || !mapping.targetBatchId || !mapping.targetOutputSnapshotId) {
    throw new StatementComparisonStateError("映射缺少合并目标字段，无法解析对比目标");
  }
  return {
    kind: "consolidated",
    parentCompanyId: mapping.targetParentCompanyId,
    batchId: mapping.targetBatchId,
    outputSnapshotId: mapping.targetOutputSnapshotId,
    reportType: mapping.reportType as "balance" | "income" | "cashflow",
    targetFingerprint: mapping.targetFingerprint,
  };
}

export interface ResolvedComparisonTarget {
  systemLines: SystemStatementLine[];
  /** 解析时重算的目标指纹；与 mapping.targetFingerprint 不一致即 stale。 */
  targetFingerprint: string;
  currencyCode: string;
}

async function resolveEntityTarget(
  mapping: ComparisonMappingRecord,
  target: Extract<StatementTargetRef, { kind: "entity" }>,
  db: ComparisonRunExecutionDb,
  loadEntityReportLines: EntityReportLinesLoader,
): Promise<ResolvedComparisonTarget> {
  const company = await db.company.findUnique({
    where: { id: target.companyId },
    select: {
      code: true,
      financeCurrencyPolicy: { select: { currency: { select: { code: true } } } },
    },
  });
  if (!company) throw new StatementComparisonStateError(`对比目标公司 ${target.companyId} 不存在`);
  const lines = await loadEntityReportLines({
    companyCode: company.code,
    year: target.year,
    month: target.month,
    reportType: target.reportType,
  });
  const systemLines = entitySystemLines(lines, target.reportType, target.periodKind);
  return {
    systemLines,
    targetFingerprint: computeEntityComparisonTargetFingerprint({ target, systemLines }),
    currencyCode: company.financeCurrencyPolicy?.currency.code ?? FALLBACK_CURRENCY_CODE,
  };
}

export interface ConsolidatedOutputLinePayload {
  lineCode: string;
  label: string;
  amount?: unknown;
  currentMonthAmount?: unknown;
}

/**
 * 合并输出快照 payload 的 statements[].reportType 使用合并词表
 * （balanceSheet/incomeStatement/cashFlow），对比目标使用对比词表
 * （balance/income/cashflow）。查找时两种都接受，保证 run 解析与目标预览一致。
 */
const CONSOLIDATED_PAYLOAD_REPORT_TYPES: Record<string, string> = {
  balance: "balanceSheet",
  income: "incomeStatement",
  cashflow: "cashFlow",
};

export function findConsolidatedPayloadStatement(
  statements: readonly { reportType: string; lines?: ConsolidatedOutputLinePayload[] }[] | undefined,
  reportType: string,
) {
  const payloadType = CONSOLIDATED_PAYLOAD_REPORT_TYPES[reportType];
  return statements?.find((entry) => entry.reportType === reportType)
    ?? (payloadType ? statements?.find((entry) => entry.reportType === payloadType) : undefined);
}

async function resolveConsolidatedTarget(
  mapping: ComparisonMappingRecord,
  target: Extract<StatementTargetRef, { kind: "consolidated" }>,
  db: ComparisonRunExecutionDb,
): Promise<ResolvedComparisonTarget> {
  const snapshot = await db.financeConsolidationOutputSnapshot.findUnique({
    where: { id: target.outputSnapshotId },
    select: { id: true, batchId: true, outputFingerprint: true, reportPayload: true },
  });
  if (!snapshot) {
    throw new StatementComparisonStateError(`合并输出快照 ${target.outputSnapshotId} 不存在`);
  }
  if (snapshot.batchId !== target.batchId) {
    throw new StatementComparisonStateError("合并输出快照与映射绑定的批次不一致");
  }
  const payload = snapshot.reportPayload as {
    batch?: { presentationCurrency?: string };
    statements?: Array<{
      reportType: string;
      lines?: ConsolidatedOutputLinePayload[];
    }>;
  };
  const statement = findConsolidatedPayloadStatement(payload.statements, target.reportType);
  if (!statement || !Array.isArray(statement.lines)) {
    throw new StatementComparisonStateError("合并输出快照缺少目标报表类型的行数据");
  }
  const systemLines: SystemStatementLine[] = statement.lines.map((line, index) => ({
    lineCode: line.lineCode,
    label: line.label,
    sortOrder: index,
    amountMinor: flowAmountMinor(line, mapping.periodKind),
  }));
  return {
    systemLines,
    targetFingerprint: snapshot.outputFingerprint,
    currencyCode: payload.batch?.presentationCurrency ?? FALLBACK_CURRENCY_CODE,
  };
}

/** 解析系统目标行；供 run 执行与后续目标选择（Package 7）复用。 */
export async function resolveComparisonTarget(
  mapping: ComparisonMappingRecord,
  db: ComparisonRunExecutionDb = prisma,
  loadEntityReportLines: EntityReportLinesLoader = defaultLoadEntityReportLines,
): Promise<ResolvedComparisonTarget> {
  const target = comparisonTargetFromMapping(mapping);
  return target.kind === "entity"
    ? resolveEntityTarget(mapping, target, db, loadEntityReportLines)
    : resolveConsolidatedTarget(mapping, target, db);
}

// ─── 逐行金额来源解释 ─────────────────────────────────────────────

const ZERO_AMOUNT = formatMinorUnits(0n, LEDGER_MONEY_SCALE);

function isZeroAmount(value: string | null): boolean {
  return value !== null && value === ZERO_AMOUNT;
}

function explanationStatusOf(result: AmountOriginResult): string {
  return result.status === "not_found" ? "notFound" : result.status;
}

async function explainComparisonLines(input: {
  baseLines: readonly ComparisonRunLineInput[];
  target: StatementTargetRef;
  currencyCode: string;
  explain: ComparisonLineExplainFn;
}): Promise<ComparisonRunLineInput[]> {
  const lines: ComparisonRunLineInput[] = [];
  // 逐行顺序执行：确定性输出，且每行都受同一有界 solver 合同约束。
  for (const line of input.baseLines) {
    if (line.differenceAmount === null) {
      lines.push(line);
      continue;
    }
    if (isZeroAmount(line.differenceAmount)) {
      lines.push({
        ...line,
        explainedAmount: ZERO_AMOUNT,
        residualAmount: ZERO_AMOUNT,
        explanationStatus: "exact",
      });
      continue;
    }
    const result = await input.explain({
      targetAmount: line.differenceAmount,
      currencyCode: input.currencyCode,
      reportContext: {
        target: input.target,
        lineCode: line.lineCode,
        workbookCell: line.sourceSheet && line.sourceCell
          ? `${line.sourceSheet}!${line.sourceCell}`
          : undefined,
      },
    });
    lines.push({
      ...line,
      explainedAmount: result.explainedAmount,
      residualAmount: result.residualAmount,
      explanationStatus: explanationStatusOf(result),
      explanationMethod: result.method,
      evidence: result.bestExplanation?.evidence ?? [],
      alternatives: result.alternatives,
      diagnostics: {
        accountingTreatment: result.accountingTreatment,
        stopReason: result.stopReason,
        candidatesTruncated: result.candidatesTruncated,
        budgets: result.budgets,
        versions: result.versions,
        fingerprints: result.fingerprints,
        providers: result.diagnostics.providers,
        solver: result.diagnostics.solver,
      },
    });
  }
  return lines;
}

export interface ComparisonRunSummary {
  totalLines: number;
  differingLines: number;
  exact: number;
  near: number;
  ambiguous: number;
  notFound: number;
  truncated: number;
  notEvaluated: number;
  /** 所有行 |residual| 合计（canonical cents 格式化）。 */
  totalAbsoluteResidual: string;
  accountingTreatment: "not_evaluated";
}

function summarizeComparisonLines(lines: readonly ComparisonRunLineInput[]): ComparisonRunSummary {
  const summary: ComparisonRunSummary = {
    totalLines: lines.length,
    differingLines: 0,
    exact: 0,
    near: 0,
    ambiguous: 0,
    notFound: 0,
    truncated: 0,
    notEvaluated: 0,
    totalAbsoluteResidual: ZERO_AMOUNT,
    accountingTreatment: "not_evaluated",
  };
  let totalResidualMinor = 0n;
  for (const line of lines) {
    if (line.differenceAmount !== null && !isZeroAmount(line.differenceAmount)) {
      summary.differingLines += 1;
    }
    if (line.residualAmount !== null) {
      const minor = decimalLikeToMinorUnits(line.residualAmount.replace(/^-/, ""), LEDGER_MONEY_SCALE);
      totalResidualMinor += minor;
    }
    switch (line.explanationStatus) {
      case "exact": summary.exact += 1; break;
      case "near": summary.near += 1; break;
      case "ambiguous": summary.ambiguous += 1; break;
      case "notFound": summary.notFound += 1; break;
      case "truncated": summary.truncated += 1; break;
      default: summary.notEvaluated += 1; break;
    }
  }
  summary.totalAbsoluteResidual = formatMinorUnits(totalResidualMinor, LEDGER_MONEY_SCALE);
  return summary;
}

// ─── run 执行入口 ─────────────────────────────────────────────────

export interface ExecuteComparisonRunInput {
  mappingId: number;
  createdBy: number;
  db?: ComparisonRunExecutionDb;
  /** factory 注入；单测换 fake adapter，默认 bounded reference adapter。 */
  solver?: CombinationSolverAdapter;
  /** 测试注入 fake explain；默认逐行调 Package 3 explainAmountOrigin。 */
  explain?: ComparisonLineExplainFn;
  /** 测试注入；默认复用确定性报表生成器（只读）。 */
  loadEntityReportLines?: EntityReportLinesLoader;
}

export interface ExecutedComparisonRun {
  runId: number;
  status: "completed";
  inputFingerprint: string;
  summary: ComparisonRunSummary;
}

const MAPPING_EXECUTION_SELECT = {
  id: true,
  revision: true,
  status: true,
  targetKind: true,
  targetCompanyId: true,
  targetParentCompanyId: true,
  targetBatchId: true,
  targetOutputSnapshotId: true,
  year: true,
  month: true,
  periodKind: true,
  reportType: true,
  targetFingerprint: true,
  structureMapping: true,
  lineMapping: true,
  package: { select: { sha256: true, workbookSnapshot: true } },
} as const;

/**
 * 创建并同步执行一个不可变对比 run。
 * 目标指纹先于建 run 校验：stale 时显式失效映射（CAS）并拒绝，不留孤儿 running 行。
 */
export async function executeComparisonRun(
  input: ExecuteComparisonRunInput,
): Promise<ExecutedComparisonRun> {
  const db = input.db ?? prisma;
  await assertStatementComparisonEnabled(db);

  const mapping = (await db.financeStatementComparisonMapping.findUnique({
    where: { id: input.mappingId },
    select: MAPPING_EXECUTION_SELECT,
  })) as ComparisonMappingRecord | null;
  if (!mapping) throw new StatementComparisonStateError(`映射 ${input.mappingId} 不存在`);
  if (mapping.status !== "confirmed") {
    throw new StatementComparisonStateError("映射未确认，不能创建对比运行");
  }

  const target = comparisonTargetFromMapping(mapping);
  const resolved = target.kind === "entity"
    ? await resolveEntityTarget(mapping, target, db, input.loadEntityReportLines ?? defaultLoadEntityReportLines)
    : await resolveConsolidatedTarget(mapping, target, db);
  if (resolved.targetFingerprint !== mapping.targetFingerprint) {
    await invalidateComparisonMapping(mapping.id, mapping.revision, db);
    throw new StatementComparisonStateError("系统目标指纹已变化，映射已失效，请重新确认后再运行");
  }

  const solver = input.solver ?? createCombinationSolver();
  const explain = input.explain ?? ((query: AmountOriginQuery) => explainAmountOrigin({ query, solver }));
  const created = await createComparisonRun({
    mappingId: input.mappingId,
    createdBy: input.createdBy,
    db,
    solverAdapterId: solver.id,
    solverAdapterVersion: solver.version,
  });

  try {
    const baseLines = buildComparisonLines({
      analysis: mapping.package.workbookSnapshot as WorkbookAnalysisSnapshot,
      structureMapping: mapping.structureMapping as DetectedStatementStructure,
      lineMapping: mapping.lineMapping as LineMappingEntry[],
      systemLines: resolved.systemLines,
    });
    const lines = await explainComparisonLines({
      baseLines,
      target,
      currencyCode: resolved.currencyCode,
      explain,
    });
    const summary = summarizeComparisonLines(lines);
    await completeComparisonRun({ runId: created.runId, lines, summary, db });
    return {
      runId: created.runId,
      status: "completed",
      inputFingerprint: created.inputFingerprint,
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "对比运行执行失败";
    await failComparisonRun(created.runId, "execution_failed", message, db).catch(() => undefined);
    throw error;
  }
}
