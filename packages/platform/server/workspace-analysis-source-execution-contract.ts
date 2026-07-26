import "server-only";

import type {
  WorkspaceAnalysisParameterValue,
  WorkspaceAnalysisSourceScopeType,
} from "../workspace-analysis-source-contract";

export type WorkspaceAnalysisSourceExecutionLimits = {
  readonly maxRows: number;
  readonly maxGroups: number;
  readonly pageSize: number;
  readonly maxPages: number;
  readonly maxBytes: number;
  readonly timeoutMs: number;
};

export type WorkspaceAnalysisSourceLoadRequest = {
  readonly requesterId: number;
  readonly targetType: WorkspaceAnalysisSourceScopeType;
  readonly targetId: number;
  readonly ownerUnitId: string;
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly parameters: Readonly<Record<string, WorkspaceAnalysisParameterValue>>;
  readonly fields: readonly string[];
  readonly limits: WorkspaceAnalysisSourceExecutionLimits;
  readonly signal: AbortSignal;
};

export type WorkspaceAnalysisLoadedSource = {
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly pageCount: number;
  readonly byteCount: number;
};

export type WorkspaceAnalysisSourceLoader = (
  request: WorkspaceAnalysisSourceLoadRequest,
) => Promise<WorkspaceAnalysisLoadedSource>;
