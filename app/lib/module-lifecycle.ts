export type ModuleLifecycleStatus =
  | "workspace-owned"
  | "erpnext-owned"
  | "hybrid-analysis"
  | "legacy-fallback"
  | "deprecated";

export const MODULE_LIFECYCLE_LABELS: Record<ModuleLifecycleStatus, string> = {
  "workspace-owned": "Workspace 自有",
  "erpnext-owned": "ERPNext 负责",
  "hybrid-analysis": "ERPNext 数据 + Workspace 分析",
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
  finance: "hybrid-analysis",
  "finance.ledger": "legacy-fallback",
  "finance.statement": "hybrid-analysis",
  "finance.analysis": "hybrid-analysis",
  "finance.budget": "hybrid-analysis",
  "finance.cost": "hybrid-analysis",
  "finance.tax": "erpnext-owned",
  "finance.treasury": "erpnext-owned",
  "finance.import": "legacy-fallback",
  production: "workspace-owned",
  "production.qc": "workspace-owned",
  "production.qc.batches": "workspace-owned",
  "production.qc.templates": "workspace-owned",
  external: "hybrid-analysis",
  "external.investor": "workspace-owned",
  "external.customer": "hybrid-analysis",
  "external.supplier": "hybrid-analysis",
  docs: "workspace-owned",
  "docs.positions": "workspace-owned",
  "docs.company": "workspace-owned",
  "docs.expense": "workspace-owned",
  "system.api": "workspace-owned",
  library: "workspace-owned",
  "system.agent": "workspace-owned",
  "system.erpnext": "erpnext-owned",
};
