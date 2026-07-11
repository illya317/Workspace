export interface CostFiltersState {
  year: number | undefined;
  month: number | undefined;
  productName: string;
  customerName: string;
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
  | "overview"
  | "shipments"
  | "cost-analysis"
  | "cost-structure"
  | "workshop"
  | "salary"
  | "imports";
