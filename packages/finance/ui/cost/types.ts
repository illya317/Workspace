export interface CostFiltersState {
  year: number | undefined;
  month: number | undefined;
  productName: string;
  customerName: string;
}

export type ShipmentPeriodMode = "week" | "month" | "quarter" | "year";
export type ShipmentGroupBy = "customer" | "salesperson" | "product" | "productSpec";
export type ShipmentMetricKey = "quantity" | "amount" | "receivedAmount";
export type ShipmentDetailSortField = "date" | ShipmentMetricKey;

export type ShipmentQueryScope =
  | { departmentId: number }
  | { scopeType: "personal" | "department"; scopeId: number };

export interface ShipmentWorkspaceState {
  periodMode: ShipmentPeriodMode;
  periodValue: string;
  groupBy: ShipmentGroupBy;
  sortBy: ShipmentMetricKey;
  sortOrder: "asc" | "desc";
  detailSortBy: ShipmentDetailSortField;
  detailSortOrder: "asc" | "desc";
  pageSize: 20 | 50 | 100;
}

export function createDefaultShipmentWorkspaceState(now = new Date()): ShipmentWorkspaceState {
  return {
    periodMode: "year",
    periodValue: String(now.getFullYear()),
    groupBy: "productSpec",
    sortBy: "amount",
    sortOrder: "desc",
    detailSortBy: "date",
    detailSortOrder: "desc",
    pageSize: 50,
  };
}

export interface SourceTraceInfo {
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary?: Record<string, unknown>;
}

export type CostTab =
  | "shipments"
  | "cost-analysis"
  | "cost-structure";
