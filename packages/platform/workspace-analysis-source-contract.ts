import type { PermissionRegistryActionKey } from "./action-registry";

export type WorkspaceApiQueryBinding = {
  binding: "scopeId" | "scopeType";
};

export type WorkspaceApiQueryValue = string | number | boolean | WorkspaceApiQueryBinding;

export type WorkspaceApiSource = {
  key: string;
  label?: string;
  path: string;
  rowsPath: string;
  query?: Record<string, WorkspaceApiQueryValue>;
  pagination?: {
    pageParam?: string;
    pageSizeParam?: string;
    pageSize?: number;
    totalPath: string;
    maxPages?: number;
  };
};

export type WorkspaceApiFilter = {
  key: string;
  label: string;
  source: string;
  field: string;
  kind: "search" | "select" | "year" | "month";
  defaultValue?: string;
  options?: Array<{ label: string; value: string }>;
};

export type WorkspaceApiValueFormat = "text" | "number" | "integer" | "currency" | "percent" | "date";

export type WorkspaceAnalysisSourceScopeType = "personal" | "department" | "project";

export type WorkspaceAnalysisSourceScopeBinding = {
  /**
   * `target` means the adapter must constrain rows to the target scope received
   * out-of-band. `viewer` means the adapter constrains rows to the requester.
   * `workspace` is an explicit declaration that the source has no narrower FK.
   * All three modes are trusted owner declarations. They describe row scope;
   * they never grant access beyond the owning business read contract.
   */
  readonly mode: "target" | "viewer" | "workspace";
  readonly description: string;
};

export type WorkspaceAnalysisSourceSensitivity = "internal" | "confidential" | "restricted";
export type WorkspaceAnalysisSourceExportPolicy = "allowed" | "masked" | "forbidden";
export type WorkspaceAnalysisSourceFieldKind = WorkspaceApiValueFormat | "boolean";
export type WorkspaceAnalysisSourceFilterOperator = "equals" | "contains" | "in" | "range" | "year" | "month";
export type WorkspaceAnalysisSourceAggregateOperation = WorkspaceApiMetric["operation"];

export type WorkspaceAnalysisSourceFieldDefinition = {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly kind: WorkspaceAnalysisSourceFieldKind;
  readonly sensitivity: WorkspaceAnalysisSourceSensitivity;
  readonly exportPolicy: WorkspaceAnalysisSourceExportPolicy;
  readonly capabilities: {
    readonly displayable: boolean;
    readonly filterOperators: readonly WorkspaceAnalysisSourceFilterOperator[];
    readonly groupable: boolean;
    readonly aggregateOperations: readonly WorkspaceAnalysisSourceAggregateOperation[];
  };
};

export type WorkspaceAnalysisSourceParameterDefinition = {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly kind: "text" | "integer" | "number" | "boolean" | "date";
  readonly required?: boolean;
  readonly requiredWith?: readonly string[];
};

export type WorkspaceAnalysisSourceParameterConstraint = {
  readonly kind: "orderedDates";
  readonly from: string;
  readonly to: string;
  readonly description: string;
};

export type WorkspaceAnalysisSourceDefinition = {
  readonly sourceKey: string;
  readonly version: number;
  readonly label: string;
  readonly description: string;
  readonly ownerModuleKey: string;
  readonly authorization: {
    readonly resourceKey: string;
    /**
     * Exact actions inherited from the protected business GET contract. Analysis
     * never invents a second permission or weakens the owning API's policy.
     */
    readonly requiredActions: readonly PermissionRegistryActionKey[];
    readonly projection: "default" | "space";
    readonly enforcement: "gateway" | "serviceDelegated";
  };
  readonly scopeBindings: Readonly<Partial<Record<WorkspaceAnalysisSourceScopeType, WorkspaceAnalysisSourceScopeBinding>>>;
  readonly parameters: readonly WorkspaceAnalysisSourceParameterDefinition[];
  readonly parameterConstraints?: readonly WorkspaceAnalysisSourceParameterConstraint[];
  readonly fields: readonly WorkspaceAnalysisSourceFieldDefinition[];
  readonly limits: {
    readonly maxRows: number;
    readonly maxGroups: number;
    readonly maxPageSize: number;
    readonly maxPages: number;
    readonly maxBytes: number;
    readonly timeoutMs: number;
  };
};

export type WorkspaceAnalysisParameterValue = string | number | boolean;

export type WorkspaceAnalysisSourceReference = {
  readonly key: string;
  readonly label?: string;
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly parameters?: Readonly<Record<string, WorkspaceAnalysisParameterValue>>;
};

export type WorkspaceSourcesFilter = {
  readonly key: string;
  readonly label: string;
  readonly source: string;
  readonly field: string;
  readonly kind: "search" | "select" | "year" | "month";
  readonly defaultValue?: string;
  readonly options?: readonly { readonly label: string; readonly value: string }[];
};

export type WorkspaceSourcesMetric = {
  readonly key: string;
  readonly label: string;
  readonly operation: WorkspaceAnalysisSourceAggregateOperation;
  readonly field?: string;
  readonly format?: Exclude<WorkspaceApiValueFormat, "text" | "date">;
};

export type WorkspaceSourcesTableColumn = {
  readonly key: string;
  readonly label: string;
  readonly field: string;
  readonly format?: WorkspaceApiValueFormat;
};

export type WorkspaceSourcesBlock =
  | { readonly key: string; readonly kind: "metrics"; readonly source: string; readonly metrics: readonly WorkspaceSourcesMetric[] }
  | {
      readonly key: string;
      readonly kind: "chart";
      readonly source: string;
      readonly title: string;
      readonly dimension: { readonly field: string; readonly label?: string; readonly bucket?: "year" | "quarter" | "month" };
      readonly metrics: readonly WorkspaceSourcesMetric[];
      readonly comparison?: "none" | "periodOverPeriod" | "yearOverYear" | "both";
      readonly sort?: "dimensionAsc" | "dimensionDesc" | "valueAsc" | "valueDesc";
      readonly limit?: number;
    }
  | { readonly key: string; readonly kind: "table"; readonly source: string; readonly title: string; readonly columns: readonly WorkspaceSourcesTableColumn[]; readonly limit?: number }
  | { readonly key: string; readonly kind: "note"; readonly title?: string; readonly content: string };

export type WorkspaceSourcesOperationalAnalysisDefinition = {
  readonly schemaVersion: 3;
  readonly dataset: "workspace.sources";
  readonly layout?: "stack" | "grid";
  readonly sources: readonly WorkspaceAnalysisSourceReference[];
  readonly filters: readonly WorkspaceSourcesFilter[];
  readonly blocks: readonly WorkspaceSourcesBlock[];
};

export type WorkspaceAnalysisRuntimeValue = string | number | boolean | null;

export type WorkspaceAnalysisRuntimeFilter = {
  readonly key: string;
  readonly label: string;
  readonly kind: WorkspaceSourcesFilter["kind"];
  readonly value: string;
  readonly options?: readonly { readonly label: string; readonly value: string }[];
};

export type WorkspaceAnalysisRuntimeMetric = {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly format: Exclude<WorkspaceApiValueFormat, "text" | "date">;
};

export type WorkspaceAnalysisRuntimeChartMetric = {
  readonly key: string;
  readonly label: string;
  readonly format: Exclude<WorkspaceApiValueFormat, "text" | "date">;
};

export type WorkspaceAnalysisRuntimeChartValue = {
  readonly metricKey: string;
  readonly current: number;
  readonly previousPeriod?: number;
  readonly previousYear?: number;
};

export type WorkspaceAnalysisRuntimeBlock =
  | {
      readonly key: string;
      readonly kind: "metrics";
      readonly metrics: readonly WorkspaceAnalysisRuntimeMetric[];
    }
  | {
      readonly key: string;
      readonly kind: "chart";
      readonly title: string;
      readonly dimensionLabel: string;
      readonly comparison: "none" | "periodOverPeriod" | "yearOverYear" | "both";
      readonly metrics: readonly WorkspaceAnalysisRuntimeChartMetric[];
      readonly groups: readonly {
        readonly key: string;
        readonly label: string;
        readonly values: readonly WorkspaceAnalysisRuntimeChartValue[];
      }[];
    }
  | {
      readonly key: string;
      readonly kind: "table";
      readonly title: string;
      readonly totalRows: number;
      readonly columns: readonly {
        readonly key: string;
        readonly label: string;
        readonly format: WorkspaceApiValueFormat;
      }[];
      readonly rows: readonly {
        readonly key: string;
        readonly cells: Readonly<Record<string, WorkspaceAnalysisRuntimeValue>>;
      }[];
    }
  | {
      readonly key: string;
      readonly kind: "note";
      readonly title?: string;
      readonly content: string;
    };

export type WorkspaceAnalysisRuntimeSourceMeta = {
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly rowCount: number;
  readonly pageCount: number;
  readonly byteCount: number;
  readonly durationMs: number;
};

export type WorkspaceAnalysisRuntimeDTO = {
  readonly schemaVersion: 1;
  readonly layout: "stack" | "grid";
  readonly filters: readonly WorkspaceAnalysisRuntimeFilter[];
  readonly blocks: readonly WorkspaceAnalysisRuntimeBlock[];
  readonly execution: {
    readonly rowCount: number;
    readonly pageCount: number;
    readonly byteCount: number;
    readonly durationMs: number;
    readonly sources: readonly WorkspaceAnalysisRuntimeSourceMeta[];
  };
};

export type WorkspaceApiMetric = {
  key: string;
  label: string;
  operation: "count" | "distinctCount" | "sum" | "average" | "min" | "max";
  field?: string;
  format?: Exclude<WorkspaceApiValueFormat, "text" | "date">;
};

export type WorkspaceApiTableColumn = {
  key: string;
  label: string;
  field: string;
  format?: WorkspaceApiValueFormat;
};

export type WorkspaceApiBlock =
  | { kind: "apiMetrics"; source: string; metrics: WorkspaceApiMetric[] }
  | {
      kind: "apiChart";
      source: string;
      title: string;
      dimension: { field: string; label?: string; bucket?: "year" | "quarter" | "month" };
      metrics: WorkspaceApiMetric[];
      comparison?: "none" | "periodOverPeriod" | "yearOverYear" | "both";
      sort?: "dimensionAsc" | "dimensionDesc" | "valueAsc" | "valueDesc";
      limit?: number;
    }
  | { kind: "apiTable"; source: string; title: string; columns: WorkspaceApiTableColumn[]; limit?: number }
  | { kind: "note"; title?: string; content: string };

export type WorkspaceApiOperationalAnalysisDefinition = {
  schemaVersion: 2;
  dataset: "workspace.api";
  layout?: "stack" | "grid";
  sources: WorkspaceApiSource[];
  filters: WorkspaceApiFilter[];
  blocks: WorkspaceApiBlock[];
};

export const WORKSPACE_ANALYSIS_SOURCE_HELP = [
  "HR 雇佣记录接口的准确 path 是 /api/modules/hr/roster/employments，rowsPath 是 items；不要改写成 /api/modules/hr/employees。工号字段是 employeeCode，岗位字段是 positionNames；employeeId 只是内部关联 ID，title 是职称，不能冒充工号或岗位。其他字段包括 employeeName、isActive、currentCompany、joinDate、leaveDate、officeLocation、personnelType、rank。",
  "部门空间可把 query.departmentId 绑定 scopeId；分页响应的总数字段是 total。",
].join("\n");

export const WORKSPACE_ANALYSIS_HR_JOIN_DEFINITION_EXAMPLE = {
  schemaVersion: 2,
  dataset: "workspace.api",
  layout: "stack",
  sources: [{
    key: "employments",
    label: "本部门雇佣记录",
    path: "/api/modules/hr/roster/employments",
    rowsPath: "items",
    query: { departmentId: { binding: "scopeId" } },
    pagination: { totalPath: "total", pageSize: 500, maxPages: 20 },
  }],
  filters: [
    { key: "joinYear", label: "入职年份", source: "employments", field: "joinDate", kind: "year" },
    { key: "employee", label: "员工姓名", source: "employments", field: "employeeName", kind: "search" },
  ],
  blocks: [
    { kind: "apiMetrics", source: "employments", metrics: [{ key: "joinCount", label: "入职人数", operation: "count", field: "joinDate", format: "integer" }] },
    { kind: "apiChart", source: "employments", title: "入职人数同比与环比", dimension: { field: "joinDate", label: "入职月份", bucket: "month" }, metrics: [{ key: "joinCount", label: "入职人数", operation: "count", field: "joinDate", format: "integer" }], comparison: "both", sort: "dimensionAsc" },
    { kind: "apiTable", source: "employments", title: "入职明细", columns: [{ key: "employeeName", label: "姓名", field: "employeeName" }, { key: "employeeCode", label: "工号", field: "employeeCode" }, { key: "positionNames", label: "岗位", field: "positionNames" }, { key: "joinDate", label: "入职日期", field: "joinDate", format: "date" }, { key: "personnelType", label: "人员类型", field: "personnelType" }], limit: 100 },
  ],
} as const;
