import type { TabConfig } from "@workspace/hr/types";

export interface GenericTabSaveChange {
  id: number;
  field: string;
  value: unknown;
  expectedVersion?: number;
}

export interface GenericTabSaveRequest {
  path: string;
  body: { changes: GenericTabSaveChange[] };
}

export function buildGenericTabSaveRequests(
  config: Pick<TabConfig, "apiPath" | "rowPath">,
  changes: GenericTabSaveChange[],
): GenericTabSaveRequest[] {
  return [{ path: config.apiPath, body: { changes } }];
}
