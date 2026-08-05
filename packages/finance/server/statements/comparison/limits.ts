/**
 * 上传包线与解析限额（计划 §5.2 表逐条落地）。
 *
 * 这些值是安全不变量，不是可调配置：调整必须同步 ADR / 计划与安全测试。
 * 顺序固定：原始字节 → ZIP magic → archive 元数据 → 不安全内容 → SheetJS parse。
 */

/** 原始请求/文件字节上限：20 MiB。route 层在 arrayBuffer() 之前强制，service 层再次断言。 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** OOXML ZIP central directory entry 上限。 */
export const MAX_ARCHIVE_ENTRIES = 2_000;

/** 声明解压总量上限：100 MiB（按 central directory 声明值，不解压）。 */
export const MAX_DECLARED_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

/** 单 entry 压缩比上限（zip-bomb 启发式）。 */
export const MAX_ENTRY_COMPRESSION_RATIO = 100;

/** 压缩比检查只作用于声明解压大小超过该值的 entry（小文件天然高比率，误报无意义）。 */
export const ENTRY_RATIO_MIN_UNCOMPRESSED_BYTES = 1024 * 1024;

/** worksheet 上限。 */
export const MAX_WORKSHEETS = 64;

/** parsed cells 上限。 */
export const MAX_PARSED_CELLS = 500_000;

/** formula cells 上限。 */
export const MAX_FORMULA_CELLS = 100_000;

/** 单公式字符上限。 */
export const MAX_FORMULA_LENGTH = 8_192;

/** 公式图深度上限（root depth = 0）。 */
export const MAX_FORMULA_GRAPH_DEPTH = 128;

/** 公式图 visited nodes 上限。 */
export const MAX_FORMULA_GRAPH_NODES = 50_000;

/** 隔离 worker wall-time 上限。 */
export const WORKER_WALL_TIME_MS = 30_000;

/** 隔离 worker old-generation heap 上限（MiB），经 worker_threads resourceLimits 强制。 */
export const WORKER_HEAP_MB = 512;

/** DTO 中保留的 merge range 上限（映射检测只需判断 header 是否合并）。 */
export const MAX_RECORDED_MERGES = 1_000;

/** v1 接受的扩展名与 MIME（必要不充分：OOXML ZIP magic + [Content_Types].xml 才是放行依据）。 */
export const ACCEPTED_FILE_EXTENSION = ".xlsx";
export const ACCEPTED_MIME_TYPES: readonly string[] = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // 部分客户端/代理会丢掉具体 MIME；空与 octet-stream 放行到 magic 校验兜底。
  "application/octet-stream",
  "",
];

export interface WorkbookIngestLimits {
  maxUploadBytes: number;
  maxArchiveEntries: number;
  maxDeclaredUncompressedBytes: number;
  maxEntryCompressionRatio: number;
  entryRatioMinUncompressedBytes: number;
  maxWorksheets: number;
  maxParsedCells: number;
  maxFormulaCells: number;
  maxFormulaLength: number;
  maxFormulaGraphDepth: number;
  maxFormulaGraphNodes: number;
  workerWallTimeMs: number;
  workerHeapMb: number;
  maxRecordedMerges: number;
}

export function defaultWorkbookIngestLimits(): WorkbookIngestLimits {
  return {
    maxUploadBytes: MAX_UPLOAD_BYTES,
    maxArchiveEntries: MAX_ARCHIVE_ENTRIES,
    maxDeclaredUncompressedBytes: MAX_DECLARED_UNCOMPRESSED_BYTES,
    maxEntryCompressionRatio: MAX_ENTRY_COMPRESSION_RATIO,
    entryRatioMinUncompressedBytes: ENTRY_RATIO_MIN_UNCOMPRESSED_BYTES,
    maxWorksheets: MAX_WORKSHEETS,
    maxParsedCells: MAX_PARSED_CELLS,
    maxFormulaCells: MAX_FORMULA_CELLS,
    maxFormulaLength: MAX_FORMULA_LENGTH,
    maxFormulaGraphDepth: MAX_FORMULA_GRAPH_DEPTH,
    maxFormulaGraphNodes: MAX_FORMULA_GRAPH_NODES,
    workerWallTimeMs: WORKER_WALL_TIME_MS,
    workerHeapMb: WORKER_HEAP_MB,
    maxRecordedMerges: MAX_RECORDED_MERGES,
  };
}
