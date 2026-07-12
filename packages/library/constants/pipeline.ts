export const LIBRARY_PIPELINE_VERSION = "v1.0.1";
export const LIBRARY_PREVIEW_VERSION = "v2-compressed";
export const LIBRARY_LOCATOR_SCHEMA_VERSION = "v1";
export const LIBRARY_TAXONOMY_VERSION = "v1";
export const LIBRARY_AGENT_PROVIDER = "workspace-agent";

export const LIBRARY_PROCESSING_JOB_KINDS = [
  "extract",
  "ocr",
  "markdown",
  "preview",
  "compress",
  "enrich",
  "chunk",
  "index",
] as const;

export const LIBRARY_PROCESSING_JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "warning",
  "failed",
  "cancelled",
] as const;

export const LIBRARY_ARTIFACT_KINDS = [
  "extracted-text",
  "ocr-text",
  "markdown",
  "preview-pdf",
  "compressed-pdf",
  "thumbnail",
  "layout-json",
] as const;

export const LIBRARY_REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "superseded",
] as const;

export const LIBRARY_INDEX_STATUSES = ["building", "ready", "failed", "retired"] as const;
export const LIBRARY_EXPORT_STATUSES = ["queued", "running", "ready", "failed", "expired", "cancelled"] as const;
export const LIBRARY_EVALUATION_STATUSES = ["draft", "approved", "retired"] as const;
export const LIBRARY_TAG_DIMENSIONS = ["theme", "doctype", "event"] as const;
export const LIBRARY_ENTITY_TYPES = ["person", "organization", "project", "location", "time"] as const;

export const LIBRARY_PIPELINE_ERROR_CODES = [
  "source_missing",
  "checksum_mismatch",
  "unsupported_type",
  "parse_failed",
  "ocr_failed",
  "artifact_invalid",
  "insufficient_text",
  "agent_unavailable",
  "agent_invalid_output",
  "taxonomy_violation",
  "locator_invalid",
  "index_failed",
  "permission_denied",
  "export_failed",
] as const;

export const LIBRARY_RETRYABLE_ERROR_CODES = new Set<string>([
  "parse_failed",
  "ocr_failed",
  "agent_unavailable",
  "index_failed",
  "export_failed",
]);

export type LibraryProcessingJobKind = typeof LIBRARY_PROCESSING_JOB_KINDS[number];
export type LibraryProcessingJobStatus = typeof LIBRARY_PROCESSING_JOB_STATUSES[number];
export type LibraryPipelineErrorCode = typeof LIBRARY_PIPELINE_ERROR_CODES[number];
