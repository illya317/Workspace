export type WorkspaceAnalysisRuntimeErrorCode =
  | "cancelled"
  | "source_forbidden"
  | "source_unavailable"
  | "source_response_invalid"
  | "source_limit_exceeded"
  | "run_limit_exceeded"
  | "timeout";

export class WorkspaceAnalysisRuntimeError extends Error {
  constructor(
    readonly code: WorkspaceAnalysisRuntimeErrorCode,
    message: string,
    readonly sourceKey?: string,
  ) {
    super(message);
    this.name = "WorkspaceAnalysisRuntimeError";
  }
}
