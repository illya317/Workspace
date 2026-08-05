/**
 * comparison capability 出口（Package 5：.xlsx 证据导入生命周期）。
 * 固定边界：上传的 workbook 只是不可变对比证据；不创建/更新任何会计事实，
 * 不覆盖系统报表，不用 LLM 映射，不回退到请求线程解析不可信文件。
 */

export {
  ACCEPTED_MIME_TYPES,
  defaultWorkbookIngestLimits,
  MAX_UPLOAD_BYTES,
  type WorkbookIngestLimits,
} from "./limits";
export { readZipMetadata, ZipMetadataError } from "./zip-metadata";
export {
  preflightWorkbookUpload,
  type WorkbookPreflightFailureCode,
  type WorkbookPreflightOutcome,
  type WorkbookScanSummary,
} from "./preflight";
export {
  WORKBOOK_DTO_VERSION,
  buildNormalizedWorkbookDto,
  buildRecalculationChannel,
  cellChannelKey,
  validateParsedWorkbookPayload,
  WorkbookDtoValidationError,
  type NormalizedWorkbookDto,
  type ParsedWorkbookPayload,
  type WorkbookAnalysisSnapshot,
  type WorkbookCellDto,
  type WorkbookRecalculationChannel,
  type WorkbookSheetDto,
} from "./workbook-dto";
export {
  INGEST_WORKER_SOURCE,
  INGEST_WORKER_SOURCE_MARKER,
} from "./ingest-worker-source";
export {
  parseWorkbookInWorker,
  type WorkbookWorkerFailureCode,
  type WorkbookWorkerOutcome,
} from "./worker-host";
export {
  ingestWorkbookEvidence,
  WORKBOOK_INGEST_VERSION,
  type WorkbookIngestFailureCode,
  type WorkbookIngestOutcome,
} from "./ingest";
export {
  normalizeStatementLabel,
  canonicalLinesForReportType,
  STATEMENT_REPORT_TYPES,
  type CanonicalStatementLine,
  type StatementReportType,
} from "./statement-lines";
export {
  detectStatementMapping,
  MIN_LABEL_HITS,
  type DetectedStatementStructure,
  type LineMappingEntry,
  type LineMappingStatus,
  type StatementMappingDetection,
  type StatementMappingProposal,
} from "./mapping";
export {
  archiveComparisonPackage,
  assertStatementComparisonEnabled,
  confirmComparisonMapping,
  detectComparisonMapping,
  importComparisonWorkbook,
  invalidateComparisonMapping,
  isStatementComparisonEnabled,
  remapComparisonMapping,
  STATEMENT_COMPARISON_CONFIG_KEY,
  StatementComparisonConflictError,
  StatementComparisonDisabledError,
  StatementComparisonStateError,
  StatementComparisonValidationError,
  WorkbookUploadRejectedError,
  type ArchiveComparisonPackageInput,
  type StatementComparisonDb,
} from "./service";
export {
  completeComparisonRun,
  createComparisonRun,
  failComparisonRun,
  type CompleteComparisonRunInput,
  type CreateComparisonRunInput,
  type CreatedComparisonRun,
} from "./comparison-runs";
export {
  buildComparisonLines,
  type ComparisonRunLineInput,
  type SystemStatementLine,
} from "./comparison-lines";
