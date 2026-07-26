import type {
  WorkspaceAnalysisReadModelChild,
  WorkspaceAnalysisReadModelField,
  WorkspaceAnalysisReadModelOmission,
} from "@workspace/platform/server/workspace-analysis-read-model";

export const field = (
  input: Omit<WorkspaceAnalysisReadModelField, "classification" | "exportPolicy"> & {
    exportPolicy?: WorkspaceAnalysisReadModelField["exportPolicy"];
  },
): WorkspaceAnalysisReadModelField => ({
  classification: "field",
  exportPolicy: input.exportPolicy ?? "allowed",
  ...input,
});

export const child = (
  sourceKey: string,
  description: string,
): WorkspaceAnalysisReadModelChild => ({ classification: "childSource", sourceKey, description });

export const omit = (
  reason: WorkspaceAnalysisReadModelOmission["reason"],
  description: string,
): WorkspaceAnalysisReadModelOmission => ({ classification: "omit", reason, description });

export const workspaceScopes = {
  personal: {
    mode: "workspace",
    description: "该主数据没有个人外键；在个人空间中明确展示当前账号按 HR 权限可见的全公司数据。",
  },
  department: {
    mode: "workspace",
    description: "该主数据没有可信目标部门筛选；在部门空间中明确展示当前账号按 HR 权限可见的全公司数据。",
  },
  project: {
    mode: "workspace",
    description: "该主数据没有项目外键；在项目空间中明确展示当前账号按 HR 权限可见的全公司数据。",
  },
} as const;

export const mixedEmploymentScopes = {
  personal: {
    mode: "workspace",
    description: "雇佣记录没有当前查看者外键；个人空间中展示当前账号按 HR 权限可见的全公司雇佣记录。",
  },
  department: {
    mode: "target",
    description: "系统按查询当日有效的员工部门或岗位关系强制绑定目标部门。",
    query: { departmentId: "scopeId" },
  },
  project: {
    mode: "workspace",
    description: "雇佣记录没有项目外键；项目空间中展示当前账号按 HR 权限可见的全公司雇佣记录。",
  },
} as const;

export const defaultLimits = {
  maxRows: 5_000,
  maxGroups: 500,
  maxPageSize: 500,
  maxPages: 10,
  maxBytes: 5 * 1024 * 1024,
  timeoutMs: 10_000,
} as const;

export const defaultPagination = {
  pageParam: "page",
  pageSizeParam: "pageSize",
  pageSize: 500,
  maxPages: 10,
} as const;

export const nestedValuePagination = {
  pageParam: "page",
  pageSizeParam: "pageSize",
  pageSize: 500,
  maxPages: 20,
} as const;

export const nestedValueLimits = {
  ...defaultLimits,
  maxRows: 10_000,
  maxPages: 20,
  maxBytes: 10 * 1024 * 1024,
} as const;
