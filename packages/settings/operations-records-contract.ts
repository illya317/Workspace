export type OperationsRecordSource = "sql-settings" | "relation-policy";

export type OperationsRecordStatus = "pending" | "running" | "succeeded" | "failed" | "attention";

export interface OperationsRecord {
  id: string;
  source: OperationsRecordSource;
  sourceLabel: string;
  provenance: string;
  action: string;
  actionLabel: string;
  status: OperationsRecordStatus;
  target: string;
  actorUserId: number | null;
  actorLabel: string;
  reason: string | null;
  result: string | null;
  occurredAt: string;
  completedAt: string | null;
}

export interface OperationsRecordProviderCoverage {
  source: OperationsRecordSource;
  label: string;
  provenance: string;
  maximumRecords: number;
}

export interface OperationsRecordsResponse {
  records: OperationsRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  generatedAt: string;
  coverage: {
    windowDays: number;
    providers: OperationsRecordProviderCoverage[];
  };
}

export type OperationsRecordSourceFilter = "all" | OperationsRecordSource;
export type OperationsRecordStatusFilter = "all" | OperationsRecordStatus;

export interface OperationsRecordsQuery {
  page: number;
  pageSize: number;
  query?: string;
  source: OperationsRecordSourceFilter;
  status: OperationsRecordStatusFilter;
}

export interface RelationPolicyOperationsRecordSource {
  id: number;
  policyKey: string;
  version: number;
  changeKind: string;
  reason: string | null;
  actorUserId: number | null;
  createdAt: Date;
  actor: { username: string; alias: string | null } | null;
}
