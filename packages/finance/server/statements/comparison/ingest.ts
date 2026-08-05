import {
  WorkbookHyperFormulaAdapter,
  type WorkbookCellAddress,
  type WorkbookFormulaEngineAdapter,
  type WorkbookTraceRequest,
} from "@workspace/platform/formula";

import { canonicalFingerprint } from "../amount-explanation/fingerprint";
import {
  ACCEPTED_FILE_EXTENSION,
  ACCEPTED_MIME_TYPES,
  defaultWorkbookIngestLimits,
  type WorkbookIngestLimits,
} from "./limits";
import {
  preflightWorkbookUpload,
  type WorkbookPreflightFailureCode,
  type WorkbookScanSummary,
} from "./preflight";
import {
  buildNormalizedWorkbookDto,
  buildRecalculationChannel,
  failedRecalculationChannel,
  type WorkbookAnalysisSnapshot,
} from "./workbook-dto";
import { parseWorkbookInWorker, type WorkbookWorkerFailureCode } from "./worker-host";

/**
 * 证据导入管线（计划 §5.2/§5.3）：
 * envelope 校验 → archive preflight → 隔离 worker parse → 归一化 DTO →
 * Platform 公式适配器重算通道。任何阶段失败都 fail closed 并带明确 failureCode；
 * 绝不回退到请求线程解析不可信文件。
 */

export const WORKBOOK_INGEST_VERSION = "finance-workbook-ingest-v1";

export type WorkbookIngestFailureCode =
  | "unsupported_type"
  | WorkbookPreflightFailureCode
  | WorkbookWorkerFailureCode;

export interface WorkbookIngestFailure {
  ok: false;
  /** preflight 失败不得入库原始字节；parse 失败发生在 preflight 之后，允许入库 failed 证据行。 */
  stage: "envelope" | "preflight" | "parse";
  failureCode: WorkbookIngestFailureCode;
  message: string;
}

export interface WorkbookIngestSuccess {
  ok: true;
  analysis: WorkbookAnalysisSnapshot;
  scanSummary: WorkbookScanSummary;
  /** 归一化快照（dto + recalculation）指纹；service 持久化为可复现身份。 */
  snapshotFingerprint: string;
  parserVersion: string;
}

export type WorkbookIngestOutcome = WorkbookIngestSuccess | WorkbookIngestFailure;

export interface IngestWorkbookInput {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
  limits?: WorkbookIngestLimits;
  /** factory 注入；单测换 fake，默认 HyperFormula workbook 适配器（许可依据见 ADR 决策 5）。 */
  formulaAdapter?: WorkbookFormulaEngineAdapter;
  /** 测试可收紧 worker 预算。 */
  workerTimeoutMs?: number;
  workerHeapMb?: number;
}

function failure(
  stage: WorkbookIngestFailure["stage"],
  failureCode: WorkbookIngestFailureCode,
  message: string,
): WorkbookIngestFailure {
  return { ok: false, stage, failureCode, message };
}

/**
 * HyperFormula 只接受带引号的非 ASCII sheet 引用（'=明细'!B2'），
 * 而 Excel 经常存储裸引用（'明细!B2'）。只在传入适配器前做确定性的
 * 引用加引号归一化：DTO 中的原公式文本与 cached 通道原样保留。
 */
function quoteSheetReferences(formula: string): string {
  return formula.replace(/'[^']+'!|[\p{L}_][\p{L}\p{N}_.]*!/gu, (match) =>
    match.startsWith("'") ? match : `'${match.slice(0, -1)}'!`,
  );
}

function traceRequestFromDto(
  analysis: WorkbookAnalysisSnapshot,
  limits: WorkbookIngestLimits,
): WorkbookTraceRequest {
  const { dto } = analysis;
  const sheets = dto.sheets.map((sheet) => ({
    name: sheet.name,
    cells: sheet.cells.map((cell) => ({
      address: { sheet: sheet.name, row: cell.row, col: cell.col },
      value: cell.formula !== null ? (cell.cachedValue ?? null) : cell.value,
      formula: cell.formula === null ? null : quoteSheetReferences(cell.formula),
      cachedValue: cell.formula !== null ? cell.cachedValue : undefined,
      numberFormat: cell.numberFormat,
    })),
  }));
  const namedExpressions = dto.namedRanges
    // HyperFormula 命名表达式要求绝对地址；相对/表达式形态的命名区域交由适配器
    // named_expression_rejected 诊断显式记录，不静默丢弃。
    .map((named) => ({ name: named.name, expression: named.ref }));
  // 公式单元格按确定性顺序作为 trace roots；超出图预算时截断并在 scan 中显式记录。
  const roots: WorkbookCellAddress[] = [];
  for (const sheet of dto.sheets) {
    for (const cell of sheet.cells) {
      if (cell.formula === null) continue;
      if (roots.length >= limits.maxFormulaGraphNodes) break;
      roots.push({ sheet: sheet.name, row: cell.row, col: cell.col });
    }
    if (roots.length >= limits.maxFormulaGraphNodes) break;
  }
  return {
    sheets,
    namedExpressions,
    calculation: {
      mode: dto.calculation.mode ?? undefined,
      fullCalcOnLoad: dto.calculation.fullCalcOnLoad ?? undefined,
    },
    roots,
    maxDepth: limits.maxFormulaGraphDepth,
    maxNodes: limits.maxFormulaGraphNodes,
  };
}

/**
 * 执行完整导入管线。纯函数式：不做任何持久化（入库归 service.ts），
 * 不改变任何会计事实（整个 capability 的固定边界）。
 */
export async function ingestWorkbookEvidence(input: IngestWorkbookInput): Promise<WorkbookIngestOutcome> {
  const limits = input.limits ?? defaultWorkbookIngestLimits();

  // 0. envelope：扩展名/MIME 是必要不充分条件（magic 校验才是真正的类型门）。
  const lowerName = input.fileName.toLowerCase();
  const mime = input.mimeType.trim().toLowerCase();
  if (!lowerName.endsWith(ACCEPTED_FILE_EXTENSION) || !ACCEPTED_MIME_TYPES.includes(mime)) {
    return failure("envelope", "unsupported_type", "v1 仅接受 .xlsx（OOXML）工作簿");
  }

  // 1. archive preflight（字节 → magic → central directory → 不安全内容）。
  const preflight = preflightWorkbookUpload(input.bytes, limits);
  if (!preflight.ok) {
    return failure("preflight", preflight.failureCode, preflight.message);
  }

  // 2. 隔离 worker parse（超时/崩溃/heap 超限 fail closed，无请求线程回退）。
  const parsed = await parseWorkbookInWorker({
    bytes: input.bytes,
    limits,
    timeoutMs: input.workerTimeoutMs,
    heapMb: input.workerHeapMb,
  });
  if (!parsed.ok) {
    return failure("parse", parsed.failureCode, parsed.message);
  }

  // 3. 版本化归一化 DTO。
  const dto = buildNormalizedWorkbookDto(
    {
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.bytes.byteLength,
      sha256: preflight.scan.sha256,
    },
    parsed.result,
  );
  const analysis: WorkbookAnalysisSnapshot = {
    dto,
    recalculation: failedRecalculationChannel("none", "none", "formula trace not executed"),
  };

  // 4. 公式重算通道（Platform 适配器单独产出；cached/recalculated 双通道并存，
  //    mismatch 是证据。适配器失败记录为显式 adapterError，不静默缺失）。
  const adapter = input.formulaAdapter ?? new WorkbookHyperFormulaAdapter();
  try {
    const trace = await adapter.trace(traceRequestFromDto(analysis, limits));
    analysis.recalculation = buildRecalculationChannel(trace);
  } catch (error) {
    analysis.recalculation = failedRecalculationChannel(
      adapter.id,
      adapter.version,
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    ok: true,
    analysis,
    scanSummary: preflight.scan,
    snapshotFingerprint: canonicalFingerprint(analysis),
    parserVersion: `${WORKBOOK_INGEST_VERSION}+${dto.parser.id}@${dto.parser.version}`,
  };
}
