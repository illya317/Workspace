import { type PermissionActionKey } from "./permission-actions";

export type PermissionResourcePolicyStatus =
  | "container"
  | "business"
  | "capability"
  | "headless"
  | "docs"
  | "planned";

export interface PermissionResourceActionPolicy {
  resourceKey: string;
  status: PermissionResourcePolicyStatus;
  supportedActions: readonly PermissionActionKey[];
  ancestorInheritedActions: readonly PermissionActionKey[];
  explicitOnlyActions: readonly PermissionActionKey[];
  notes?: string;
}

export const DEFAULT_ANCESTOR_INHERITED_ACTIONS = ["access", "create", "write", "delete"] as const satisfies readonly PermissionActionKey[];

export const PERMISSION_RESOURCE_ACTION_POLICIES = [
  { resourceKey: "work", status: "container", supportedActions: ["access", "create", "write", "delete", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["admin"] },
  { resourceKey: "work.tasks", status: "business", supportedActions: ["access", "create", "write", "delete", "archive", "export", "admin"], ancestorInheritedActions: ["access", "create", "write", "delete"], explicitOnlyActions: ["archive", "export", "admin"], notes: "Work task data still uses personal/department/project space rules in services." },
  { resourceKey: "work.projects", status: "business", supportedActions: ["access", "create", "write", "delete", "archive", "revise", "export", "admin"], ancestorInheritedActions: ["access", "create", "write", "delete"], explicitOnlyActions: ["archive", "revise", "export", "admin"], notes: "Project visibility/edit/manage/delete remains object-level; organization project creation is a separate capability." },
  { resourceKey: "work.meetings", status: "business", supportedActions: ["access", "create", "write", "delete", "submit", "approve", "admin"], ancestorInheritedActions: ["access", "create", "write", "delete"], explicitOnlyActions: ["submit", "approve", "admin"] },
  { resourceKey: "work.projects.createOrg", status: "capability", supportedActions: ["access", "create", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["access", "create", "admin"] },
  { resourceKey: "work.projects.viewAll", status: "capability", supportedActions: ["access", "export", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["access", "export", "admin"] },
  { resourceKey: "work.meetings.viewAll", status: "capability", supportedActions: ["access", "export", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["access", "export", "admin"] },
  { resourceKey: "hr", status: "container", supportedActions: ["access", "create", "write", "delete", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["admin"] },
  { resourceKey: "hr.roster", status: "business", supportedActions: ["access", "create", "write", "delete", "archive", "revise", "admin"], ancestorInheritedActions: ["access", "create", "write", "delete"], explicitOnlyActions: ["archive", "revise", "admin"] },
  { resourceKey: "hr.performance", status: "business", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "hr.analytics", status: "business", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "hr.roster.generated", status: "capability", supportedActions: ["access", "export", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["access", "export", "admin"] },
  { resourceKey: "administration", status: "container", supportedActions: ["access", "create", "write", "delete", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["admin"] },
  { resourceKey: "administration.contracts", status: "business", supportedActions: ["access", "create", "write", "delete", "admin"], ancestorInheritedActions: ["access", "create", "write", "delete"], explicitOnlyActions: ["admin"] },
  { resourceKey: "finance", status: "container", supportedActions: ["access", "create", "write", "delete", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["admin"] },
  { resourceKey: "finance.ledger", status: "business", supportedActions: ["access", "create", "write", "delete", "revise", "import", "export", "admin"], ancestorInheritedActions: ["access", "create", "write", "delete"], explicitOnlyActions: ["revise", "import", "export", "admin"] },
  { resourceKey: "finance.statementConfig", status: "business", supportedActions: ["access", "create", "write", "delete", "admin"], ancestorInheritedActions: ["access", "create", "write", "delete"], explicitOnlyActions: ["admin"], notes: "Current routes only edit statement line and mapping configuration; reclass/import/export stay on ledger/import/report resources." },
  { resourceKey: "finance.statementReview", status: "business", supportedActions: ["access", "create", "write", "approve", "admin"], ancestorInheritedActions: ["access", "create", "write"], explicitOnlyActions: ["approve", "admin"] },
  { resourceKey: "finance.statements", status: "business", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "finance.analysis", status: "business", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "finance.budget", status: "business", supportedActions: ["access", "create", "import", "approve", "admin"], ancestorInheritedActions: ["access", "create"], explicitOnlyActions: ["import", "approve", "admin"] },
  { resourceKey: "finance.cost", status: "business", supportedActions: ["access", "delete", "import", "export", "admin"], ancestorInheritedActions: ["access", "delete"], explicitOnlyActions: ["import", "export", "admin"], notes: "Current cost APIs are read models plus import history deletion; ingestion is script/import scoped, not general create/write CRUD." },
  { resourceKey: "finance.tax", status: "planned", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "finance.treasury", status: "planned", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "finance.import", status: "business", supportedActions: ["access", "import", "export", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["import", "export", "admin"] },
  { resourceKey: "production", status: "container", supportedActions: ["access", "create", "write", "delete", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["admin"] },
  { resourceKey: "production.qc", status: "business", supportedActions: ["access", "create", "write", "delete", "submit", "approve", "export", "admin"], ancestorInheritedActions: ["access", "create", "write", "delete"], explicitOnlyActions: ["submit", "approve", "export", "admin"], notes: "create=batch creation, write=inspection/precheck saves, submit=batch submission, approve=review approval, export=QC list export." },
  { resourceKey: "external", status: "container", supportedActions: ["access", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["admin"], notes: "External pages are navigation/analysis placeholders until business APIs land." },
  { resourceKey: "external.investors", status: "planned", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "external.customers", status: "planned", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "external.suppliers", status: "planned", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "docs", status: "docs", supportedActions: ["access", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["admin"] },
  { resourceKey: "docs.company", status: "docs", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "docs.expense", status: "docs", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "docs.editor", status: "business", supportedActions: ["access", "create", "write", "delete", "submit", "withdraw", "approve", "reject", "archive", "revise", "import", "export", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["create", "write", "delete", "submit", "withdraw", "approve", "reject", "archive", "revise", "import", "export", "admin"] },
  { resourceKey: "library", status: "container", supportedActions: ["access", "write", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["admin"] },
  { resourceKey: "library.basicInfo", status: "business", supportedActions: ["access", "write", "archive", "import", "export", "admin"], ancestorInheritedActions: ["access", "write"], explicitOnlyActions: ["archive", "import", "export", "admin"], notes: "Document removal is soft archive; scan and generated documents are import-like ingestion paths." },
  { resourceKey: "settings", status: "container", supportedActions: ["access", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["admin"] },
  { resourceKey: "settings.account", status: "business", supportedActions: ["access", "write", "revise", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["write", "revise", "admin"] },
  { resourceKey: "settings.admin", status: "business", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "settings.api", status: "business", supportedActions: ["access", "export", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["export", "admin"] },
  { resourceKey: "settings.ui", status: "docs", supportedActions: ["access", "admin"], ancestorInheritedActions: ["access"], explicitOnlyActions: ["admin"] },
  { resourceKey: "settings.account.apiAccess", status: "capability", supportedActions: ["access", "revise", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["access", "revise", "admin"] },
  { resourceKey: "settings.api.manage", status: "capability", supportedActions: ["access", "create", "write", "delete", "revise", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["access", "create", "write", "delete", "revise", "admin"] },
  { resourceKey: "agent", status: "headless", supportedActions: ["access", "submit", "admin"], ancestorInheritedActions: [], explicitOnlyActions: ["submit", "admin"] },
] as const satisfies readonly PermissionResourceActionPolicy[];

const POLICY_BY_RESOURCE: ReadonlyMap<string, PermissionResourceActionPolicy> = new Map(
  PERMISSION_RESOURCE_ACTION_POLICIES.map((policy) => [policy.resourceKey, policy]),
);

export function getPermissionResourceActionPolicy(resourceKey: string | null | undefined) {
  return resourceKey ? POLICY_BY_RESOURCE.get(resourceKey) ?? null : null;
}

export function isPermissionActionSupported(resourceKey: string | null | undefined, actionKey: PermissionActionKey) {
  const policy = getPermissionResourceActionPolicy(resourceKey);
  return policy ? policy.supportedActions.includes(actionKey) : false;
}

export function isPermissionActionGrantableForResource(resourceKey: string | null | undefined, actionKey: PermissionActionKey) {
  return Boolean(resourceKey && actionKey);
}

export function isPermissionActionExplicitOnly(resourceKey: string | null | undefined, actionKey: PermissionActionKey) {
  const policy = getPermissionResourceActionPolicy(resourceKey);
  return policy ? policy.explicitOnlyActions.includes(actionKey) : false;
}

export function canPermissionActionInheritFromAncestor(resourceKey: string | null | undefined, actionKey: PermissionActionKey) {
  const policy = getPermissionResourceActionPolicy(resourceKey);
  return policy ? policy.ancestorInheritedActions.includes(actionKey) : false;
}
