export type ModuleLifecycleStatus =
  | "workspace-owned"
  | "external-system"
  | "workspace-analysis"
  | "legacy-fallback"
  | "deprecated";

export const MODULE_LIFECYCLE_LABELS: Record<ModuleLifecycleStatus, string> = {
  "workspace-owned": "Workspace 自有",
  "external-system": "外部系统负责",
  "workspace-analysis": "外部数据 + Workspace 分析",
  "legacy-fallback": "历史 fallback",
  deprecated: "准备下线",
};

export const MODULE_LIFECYCLE_BY_RESOURCE: Partial<Record<string, ModuleLifecycleStatus>> = {
  work: "workspace-owned",
  people: "workspace-owned",
  "people.roster": "workspace-owned",
  "people.performance": "workspace-owned",
  "people.analytics": "workspace-owned",
  administration: "workspace-owned",
  "administration.contract": "workspace-owned",
  finance: "workspace-analysis",
  "finance.ledger": "legacy-fallback",
  "finance.statement": "workspace-analysis",
  "finance.analysis": "workspace-analysis",
  "finance.budget": "workspace-analysis",
  "finance.cost": "workspace-analysis",
  "finance.tax": "external-system",
  "finance.treasury": "external-system",
  "finance.import": "legacy-fallback",
  production: "workspace-owned",
  "production.qc": "workspace-owned",
  "production.qc.batches": "workspace-owned",
  "production.qc.templates": "workspace-owned",
  external: "workspace-analysis",
  "external.investor": "workspace-owned",
  "external.customer": "workspace-analysis",
  "external.supplier": "workspace-analysis",
  docs: "workspace-owned",
  "docs.positions": "workspace-owned",
  "docs.company": "workspace-owned",
  "docs.expense": "workspace-owned",
  "system.api": "workspace-owned",
  library: "workspace-owned",
  "system.agent": "workspace-owned",
};
