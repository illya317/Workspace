import { PERMISSION_ACTION_KEYS, type PermissionActionKey } from "./permission-actions";
import { getStructuralPermissionResourceActions } from "./permission-resource-structural-actions";
import { activeWorkspacePackages } from "./modules";
import { listWorkflowManagementResourceRegistrations } from "./workflow-management-resources";
import { WORK_OKR_CONTROL_CAPABILITY_KEY } from "./work-reporting-policy";
import {
  SPACE_PARENT_RESOURCE_KEY_BY_SCOPE_TYPE,
  getSpaceChildResourceKeyForTargetType as deriveSpaceChildResourceKeyForTargetType,
  getSpaceChildResourceKeysForTargetType as deriveSpaceChildResourceKeysForTargetType,
  getSpaceParentResourceKeyForTargetType as deriveSpaceParentResourceKeyForTargetType,
  getSpacePermissionTargetTypesFromRegistration,
  getSpaceResourceKindFromEntryKind as deriveSpaceResourceKindFromEntryKind,
  type SpaceParentScopeType,
  type SpaceResourceKind,
} from "./space-resource-model";

export { SPACE_PARENT_RESOURCE_KEY_BY_SCOPE_TYPE };
export type { SpaceParentScopeType, SpaceResourceKind };

export const PERMISSION_SCOPE_TYPE_KEYS = ["personal", "company", "committee", "department", "project", "other"] as const;

export type PermissionScopeTypeKey = (typeof PERMISSION_SCOPE_TYPE_KEYS)[number];
export type PermissionScopeInheritanceMode = "inherit" | "self_only";

export interface PermissionScopeTypeDefinition {
  key: PermissionScopeTypeKey;
  label: string;
}

export const PERMISSION_SCOPE_TYPE_DEFS: Record<PermissionScopeTypeKey, PermissionScopeTypeDefinition> = {
  personal: { key: "personal", label: "个人" },
  company: { key: "company", label: "公司/公共" },
  committee: { key: "committee", label: "委员会" },
  department: { key: "department", label: "部门" },
  project: { key: "project", label: "项目" },
  other: { key: "other", label: "其他" },
};

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
  scopeTypes?: readonly PermissionScopeTypeKey[];
  scopeInheritanceMode?: PermissionScopeInheritanceMode;
  notes?: string;
}

export const DEFAULT_ANCESTOR_INHERITED_ACTIONS = ["entry", "read", "create", "update", "delete"] as const satisfies readonly PermissionActionKey[];
const BASE_PERMISSION_RESOURCE_ACTION_POLICIES = [
  { resourceKey: "work", status: "container", supportedActions: ["entry", "read", "create", "update", "delete"], ancestorInheritedActions: [], explicitOnlyActions: [] },
  { resourceKey: "work.tasks", status: "business", supportedActions: ["entry", "read", "create", "update", "delete", "archive", "revise", "submit", "reverse", "approve", "reject"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: ["archive", "revise", "submit", "reverse", "approve", "reject"], scopeTypes: ["personal", "company", "committee", "department", "project"], scopeInheritanceMode: "self_only", notes: "Work task data uses personal, organization and project space scopes; project execution permissions can be granted directly on the concrete project space." },
  { resourceKey: WORK_OKR_CONTROL_CAPABILITY_KEY, status: "capability", supportedActions: ["configure"], ancestorInheritedActions: [], explicitOnlyActions: ["configure"], notes: "Global cycle, workflow and reporting configuration capability; owner entry is still required and scoped Work grants do not imply configuration access." },
  { resourceKey: "work.projects", status: "business", supportedActions: ["entry", "read", "create", "update", "delete", "revise", "submit", "approve", "reject"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: ["revise", "submit", "approve", "reject"], scopeTypes: ["personal", "company", "committee", "department"], scopeInheritanceMode: "self_only", notes: "Project data uses the standard personal/department/committee/company space scopes; project creation uses submit plus enabling-department owner approve/reject, while active-project actions remain space-scoped." },
  { resourceKey: "work.projects.initiate", status: "capability", supportedActions: ["submit"], ancestorInheritedActions: [], explicitOnlyActions: ["submit"], notes: "Global project initiation capability; owner entry is still required and project workflow/object services enforce target-level rules." },
  { resourceKey: "work.meetings", status: "business", supportedActions: ["entry", "read", "create", "update", "delete", "submit", "approve"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: ["submit", "approve"] },
  { resourceKey: "work.meetings.viewAll", status: "capability", supportedActions: ["read"], ancestorInheritedActions: [], explicitOnlyActions: ["read"], notes: "Allows reading all meetings after the work.meetings owner entry gate; ordinary users remain limited by visibility and participation." },
  { resourceKey: "hr", status: "container", supportedActions: ["entry", "read", "create", "update", "delete"], ancestorInheritedActions: [], explicitOnlyActions: [] },
  { resourceKey: "hr.roster", status: "business", supportedActions: ["entry", "read", "create", "update", "delete", "archive", "revise", "submit", "reverse", "approve", "reject"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: ["archive", "revise", "submit", "reverse", "approve", "reject"] },
  { resourceKey: "hr.performance", status: "business", supportedActions: ["entry", "read", "revise", "submit", "reverse", "approve", "reject"], ancestorInheritedActions: ["entry", "read"], explicitOnlyActions: ["revise", "submit", "reverse", "approve", "reject"] },
  { resourceKey: "hr.analytics", status: "business", supportedActions: ["entry", "read"], ancestorInheritedActions: ["entry", "read"], explicitOnlyActions: [] },
  { resourceKey: "hr.roster.generated", status: "capability", supportedActions: ["entry", "read", "export"], ancestorInheritedActions: [], explicitOnlyActions: ["entry", "read", "export"] },
  { resourceKey: "administration", status: "container", supportedActions: ["entry", "read", "create", "update", "delete"], ancestorInheritedActions: [], explicitOnlyActions: [] },
  { resourceKey: "administration.contracts", status: "business", supportedActions: ["entry", "read", "create", "update", "delete", "archive", "export"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: ["archive", "export"] },
  { resourceKey: "administration.erpDiligence", status: "business", supportedActions: ["entry", "read", "update"], ancestorInheritedActions: ["entry", "read", "update"], explicitOnlyActions: [], notes: "Ordinary users can read and update only their own ERP diligence submission; the service enforces record ownership." },
  { resourceKey: "administration.erpDiligence.viewAll", status: "capability", supportedActions: ["read"], ancestorInheritedActions: [], explicitOnlyActions: ["read"], notes: "Allows reading all ERP diligence submissions after the administration.erpDiligence owner entry gate; ordinary users remain limited to their own submission." },
  { resourceKey: "finance", status: "container", supportedActions: ["entry", "read", "create", "update", "delete"], ancestorInheritedActions: [], explicitOnlyActions: [] },
  { resourceKey: "finance.ledger", status: "business", supportedActions: ["entry", "read", "create", "update", "delete", "revise", "approve", "export"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: ["revise", "approve", "export"] },
  { resourceKey: "finance.assets", status: "business", supportedActions: ["entry", "read", "create", "update", "revise", "export"], ancestorInheritedActions: ["entry", "read", "create", "update"], explicitOnlyActions: ["revise", "export"], notes: "Asset accounting owns asset cards, period depreciation and amortization, impairment and disposal evidence, read-only historical adjustments, and its workbook export independently from the general ledger; source reconciliation is limited to the initial import gate." },
  { resourceKey: "finance.treasury", status: "business", supportedActions: ["entry", "read", "create", "update", "export"], ancestorInheritedActions: ["entry", "read", "create", "update"], explicitOnlyActions: ["export"], notes: "Treasury owns bank-account masters, bank-reconciliation evidence, loan schedules, and interest workpapers. Related vouchers and balances remain in finance.ledger; period close only consumes Treasury status and evidence references." },
  { resourceKey: "finance.tax", status: "business", supportedActions: ["entry", "read", "create", "update", "export"], ancestorInheritedActions: ["entry", "read", "create", "update"], explicitOnlyActions: ["export"], notes: "Tax owns tax-accrual workpapers, filings, payable-versus-paid reconciliation, and tax evidence. Related vouchers and balances remain in finance.ledger; consolidation tax effects remain in finance.statements; period close only consumes Tax status and evidence references." },
  { resourceKey: "finance.statements", status: "business", supportedActions: ["entry", "read", "create", "update", "delete", "submit", "approve", "reject", "export", "lock", "unlock"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: ["submit", "approve", "reject", "export", "lock", "unlock"], notes: "The single financial-statements resource owns individual reports, one-off consolidation scope selections, and consolidation batches. create/update prepare evidence, workpapers, and the selected entities for one report generation; submit/approve/reject separate preparation from review; export downloads the current three-statement workbook; lock/unlock governs the exact consolidated snapshot. Ledger reclassification remains on finance.ledger." },
  { resourceKey: "finance.analysis", status: "business", supportedActions: ["entry", "read"], ancestorInheritedActions: ["entry", "read"], explicitOnlyActions: [] },
  { resourceKey: "finance.operationalAnalytics", status: "business", supportedActions: ["entry", "read", "configure", "export", "apiUse"], ancestorInheritedActions: [], explicitOnlyActions: ["entry", "read", "configure", "export", "apiUse"], scopeTypes: ["personal", "department", "project"], scopeInheritanceMode: "self_only", notes: "Space-scoped operational analytics. read controls interactive queries; configure controls workspace-owned analysis templates; export is the stronger file-extraction grant and structurally includes read; apiUse is orthogonal and must be checked in addition to read for API-key access." },
  { resourceKey: "finance.budget", status: "business", supportedActions: ["entry", "read", "create", "import", "approve"], ancestorInheritedActions: ["entry", "read", "create"], explicitOnlyActions: ["import", "approve"] },
  { resourceKey: "finance.cost", status: "business", supportedActions: ["entry", "read", "delete", "import", "export"], ancestorInheritedActions: ["entry", "read", "delete"], explicitOnlyActions: ["import", "export"], notes: "Current cost APIs are read models plus import history deletion; ingestion is script/import scoped, not general create/update CRUD." },
  { resourceKey: "production", status: "container", supportedActions: ["entry", "read", "create", "update", "delete"], ancestorInheritedActions: [], explicitOnlyActions: [] },
  { resourceKey: "production.products", status: "business", supportedActions: ["entry", "read", "create", "update"], ancestorInheritedActions: ["entry", "read", "create", "update"], explicitOnlyActions: [], notes: "产品与 SKU 的主数据维护入口；来源映射与历史业务引用不允许通过本资源硬删除。" },
  { resourceKey: "production.qc", status: "business", supportedActions: ["entry", "read", "create", "update", "delete", "approve", "export"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: ["approve", "export"], notes: "create=batch creation, update=inspection/precheck saves, approve=review approval, export=QC list export." },
  { resourceKey: "inventory", status: "container", supportedActions: ["entry", "read", "create", "update", "delete"], ancestorInheritedActions: [], explicitOnlyActions: [] },
  { resourceKey: "inventory.operations", status: "business", supportedActions: ["entry", "read", "create", "update", "reverse", "import", "export", "lock", "unlock"], ancestorInheritedActions: ["entry", "read", "create", "update"], explicitOnlyActions: ["reverse", "import", "export", "lock", "unlock"], notes: "产品/SKU 主数据由 production.products 维护；create=库存单据草稿，update=单据过账，reverse=反向流水冲销，lock/unlock=期间结转治理。" },
  { resourceKey: "inventory.receipts", status: "business", supportedActions: ["entry", "read", "create", "update", "delete", "submit", "approve"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: ["submit", "approve"], notes: "车间填写月度投料、产量、产品工分和包装折合；submit=车间确认月度汇总，approve=财务独立复核，折合值由服务端按源字段计算。" },
  { resourceKey: "external", status: "container", supportedActions: ["entry", "read", "create", "update", "delete"], ancestorInheritedActions: [], explicitOnlyActions: [], notes: "External owns customer, supplier, and related-party master views; customer and supplier roles can contain organizations or individuals." },
  { resourceKey: "external.customers", status: "business", supportedActions: ["entry", "read", "create", "update", "delete"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: [] },
  { resourceKey: "external.suppliers", status: "business", supportedActions: ["entry", "read", "create", "update", "delete"], ancestorInheritedActions: ["entry", "read", "create", "update", "delete"], explicitOnlyActions: [] },
  { resourceKey: "external.relatedParties", status: "business", supportedActions: ["entry", "read", "create", "delete"], ancestorInheritedActions: ["entry", "read", "create", "delete"], explicitOnlyActions: [], notes: "Related-party directory derived from ExternalPartyProfile; create classifies an existing readable customer or supplier Party FK. delete only resets manually maintained classifications to unrelated and preserves Party/roles; internal companies and current ownership-derived relationships are protected." },
  { resourceKey: "party.identity", status: "headless", supportedActions: ["read", "update"], ancestorInheritedActions: [], explicitOnlyActions: ["read", "update"], notes: "Restricted shared legal-identity governance capability; ordinary customer, supplier, company, and ownership entry points keep their own business permissions." },
  { resourceKey: "capitalSecurities", status: "container", supportedActions: ["entry", "read", "create", "update", "delete"], ancestorInheritedActions: [], explicitOnlyActions: [], notes: "Capital Securities owns investor relations, legal-company master data, equity/control relationships, and G-line organization governance." },
  { resourceKey: "capitalSecurities.investors", status: "business", supportedActions: ["entry", "read"], ancestorInheritedActions: ["entry", "read"], explicitOnlyActions: [], notes: "Read-only temporal projection over OwnershipInterest; current and historical Captables are generated by issuer and as-of date, while pending changes remain traceable but non-effective." },
  { resourceKey: "capitalSecurities.governance", status: "business", supportedActions: ["entry", "read", "create", "update"], ancestorInheritedActions: ["entry", "read", "create", "update"], explicitOnlyActions: [], notes: "create/update cover G-line organizations, legal-company master data, and the authoritative equity event ledger. OwnershipInterest remains a read-only projection; Finance report-generation scope choices never write this resource. Position, position-description, and employee-assignment writes remain under HR." },
  { resourceKey: "docs", status: "docs", supportedActions: ["entry", "read"], ancestorInheritedActions: [], explicitOnlyActions: [] },
  { resourceKey: "docs.company", status: "docs", supportedActions: ["entry", "read"], ancestorInheritedActions: ["entry", "read"], explicitOnlyActions: [] },
  { resourceKey: "docs.editor", status: "business", supportedActions: ["entry", "read", "create", "update", "delete", "archive", "revise", "submit", "reverse", "approve", "reject", "export"], ancestorInheritedActions: ["entry", "read"], explicitOnlyActions: ["create", "update", "delete", "archive", "revise", "submit", "reverse", "approve", "reject", "export"], scopeTypes: ["personal", "company", "committee", "department"], scopeInheritanceMode: "self_only", notes: "Template create/update/delete/archive/export APIs require matching resource actions, then docs-editor space roles narrow object access; revise/submit/approve drive template workflow for organization spaces." },
  { resourceKey: "library", status: "container", supportedActions: ["entry", "read", "update"], ancestorInheritedActions: [], explicitOnlyActions: [] },
  { resourceKey: "library.basicInfo", status: "business", supportedActions: ["entry", "read", "update", "archive", "import", "export"], ancestorInheritedActions: ["entry", "read", "update"], explicitOnlyActions: ["archive", "import", "export"], notes: "Document removal is soft archive; scan and generated documents are import-like ingestion paths; confidentiality metadata is registered as a business action." },
  { resourceKey: "settings", status: "container", supportedActions: ["entry", "read"], ancestorInheritedActions: [], explicitOnlyActions: [] },
  { resourceKey: "settings.account", status: "business", supportedActions: ["entry", "read", "update", "revise"], ancestorInheritedActions: ["entry", "read"], explicitOnlyActions: ["update", "revise"] },
  { resourceKey: "settings.admin", status: "business", supportedActions: ["entry", "read", "configure", "audit"], ancestorInheritedActions: ["entry", "read"], explicitOnlyActions: ["configure", "audit"] },
  { resourceKey: "settings.api", status: "business", supportedActions: ["entry", "read", "export"], ancestorInheritedActions: ["entry", "read"], explicitOnlyActions: ["export"] },
  { resourceKey: "settings.ui", status: "docs", supportedActions: ["entry", "read"], ancestorInheritedActions: ["entry", "read"], explicitOnlyActions: [] },
  { resourceKey: "settings.account.apiAccess", status: "capability", supportedActions: ["entry", "read", "revise"], ancestorInheritedActions: [], explicitOnlyActions: ["entry", "read", "revise"] },
  { resourceKey: "settings.api.manage", status: "capability", supportedActions: ["entry", "read", "create", "update", "revise"], ancestorInheritedActions: [], explicitOnlyActions: ["entry", "read", "create", "update", "revise"] },
  { resourceKey: "agent", status: "headless", supportedActions: ["entry", "read", "submit"], ancestorInheritedActions: [], explicitOnlyActions: ["submit"] },
  { resourceKey: "agent.assistant", status: "capability", supportedActions: ["entry", "read", "submit"], ancestorInheritedActions: [], explicitOnlyActions: ["entry", "read", "submit"], notes: "Headless toolbar and /api/agent capability; the runtime can only discover and call registered protected /api/modules business APIs." },
] as const satisfies readonly PermissionResourceActionPolicy[];

const WORKFLOW_MANAGEMENT_RESOURCE_ACTION_POLICIES: readonly PermissionResourceActionPolicy[] =
  listWorkflowManagementResourceRegistrations().map((resource) => ({
    resourceKey: resource.key,
    status: "capability",
    supportedActions: ["configure"],
    ancestorInheritedActions: resource.parentKey === "settings.admin" ? [] : ["configure"],
    explicitOnlyActions: ["configure"],
    notes: "Workflow management authorization only; does not grant business submit or process actions.",
  }));

const BASE_POLICY_BY_RESOURCE: ReadonlyMap<string, PermissionResourceActionPolicy> = new Map(
  BASE_PERMISSION_RESOURCE_ACTION_POLICIES.map((policy) => [policy.resourceKey, policy]),
);

type SpaceRegistrationTargets = Parameters<typeof getSpacePermissionTargetTypesFromRegistration>[0];

function orderPermissionActions(actions: Iterable<PermissionActionKey>): PermissionActionKey[] {
  const set = new Set(actions);
  return PERMISSION_ACTION_KEYS.filter((actionKey) => set.has(actionKey));
}

function deriveSpacePermissionResourceActionPolicies(): PermissionResourceActionPolicy[] {
  const parentScopeTypes = new Map<string, PermissionScopeTypeKey>();
  const parentSupportedActions = new Map<string, Set<PermissionActionKey>>();
  const parentExplicitOnlyActions = new Map<string, Set<PermissionActionKey>>();
  const childPolicies: PermissionResourceActionPolicy[] = [];
  const seenChildren = new Set<string>();

  for (const definition of activeWorkspacePackages) {
    for (const registration of definition.spaceRegistrations ?? []) {
      const basePolicy = BASE_POLICY_BY_RESOURCE.get(registration.resourceKey);
      if (!basePolicy) continue;
      const registrationTargets = registration as Partial<SpaceRegistrationTargets>;
      for (const scopeType of getSpacePermissionTargetTypesFromRegistration({
        targetTypes: registrationTargets.targetTypes,
        permissionTargetTypes: registrationTargets.permissionTargetTypes,
      })) {
        const parentKey = SPACE_PARENT_RESOURCE_KEY_BY_SCOPE_TYPE[scopeType];
        parentScopeTypes.set(parentKey, scopeType);
        const supported = parentSupportedActions.get(parentKey) ?? new Set<PermissionActionKey>();
        for (const actionKey of basePolicy.supportedActions) supported.add(actionKey);
        parentSupportedActions.set(parentKey, supported);
        const explicitOnly = parentExplicitOnlyActions.get(parentKey) ?? new Set<PermissionActionKey>();
        for (const actionKey of basePolicy.explicitOnlyActions) explicitOnly.add(actionKey);
        parentExplicitOnlyActions.set(parentKey, explicitOnly);

        const childKey = deriveSpaceChildResourceKeyForTargetType(scopeType, registration.spaceResourceKind);
        if (!childKey || seenChildren.has(childKey)) continue;
        seenChildren.add(childKey);
        childPolicies.push({
          resourceKey: childKey,
          status: basePolicy.status === "planned" ? "planned" : "business",
          supportedActions: basePolicy.supportedActions,
          ancestorInheritedActions: basePolicy.supportedActions,
          explicitOnlyActions: basePolicy.explicitOnlyActions,
          scopeTypes: [scopeType],
          scopeInheritanceMode: "self_only",
          notes: `${scopeType} space projection of ${registration.resourceKey}.`,
        });
      }
    }
  }

  const parentPolicies: PermissionResourceActionPolicy[] = Array.from(parentScopeTypes.entries()).map(([resourceKey, scopeType]) => ({
    resourceKey,
    status: "container",
    supportedActions: orderPermissionActions(parentSupportedActions.get(resourceKey) ?? []),
    ancestorInheritedActions: [],
    explicitOnlyActions: orderPermissionActions(parentExplicitOnlyActions.get(resourceKey) ?? []),
    scopeTypes: [scopeType],
    scopeInheritanceMode: "self_only",
    notes: `L1 parent for ${scopeType} spaces; concrete instance is carried by scopeId.`,
  }));

  return [...parentPolicies, ...childPolicies];
}

function normalizePermissionResourceActionPolicy(policy: PermissionResourceActionPolicy): PermissionResourceActionPolicy {
  return {
    ...policy,
    supportedActions: orderPermissionActions([
      ...policy.supportedActions,
      ...getStructuralPermissionResourceActions(policy.resourceKey).supportedActions,
    ]),
    explicitOnlyActions: orderPermissionActions([
      ...policy.explicitOnlyActions,
      ...getStructuralPermissionResourceActions(policy.resourceKey).explicitOnlyActions,
    ]),
  };
}

export const PERMISSION_RESOURCE_ACTION_POLICIES: readonly PermissionResourceActionPolicy[] = [
  ...deriveSpacePermissionResourceActionPolicies(),
  ...BASE_PERMISSION_RESOURCE_ACTION_POLICIES,
  ...WORKFLOW_MANAGEMENT_RESOURCE_ACTION_POLICIES,
].map(normalizePermissionResourceActionPolicy);

const POLICY_BY_RESOURCE: ReadonlyMap<string, PermissionResourceActionPolicy> = new Map(
  PERMISSION_RESOURCE_ACTION_POLICIES.map((policy) => [policy.resourceKey, policy]),
);

function actionListIncludes(actions: readonly PermissionActionKey[], actionKey: PermissionActionKey) {
  return actions.includes(actionKey);
}

export function getPermissionResourceActionPolicy(resourceKey: string | null | undefined) {
  return resourceKey ? POLICY_BY_RESOURCE.get(resourceKey) ?? null : null;
}

export function serializePermissionScopeTypes(scopeTypes: readonly PermissionScopeTypeKey[] | null | undefined) {
  return scopeTypes?.length ? scopeTypes.join(",") : null;
}

export function getPermissionResourceScopeTypes(resourceKey: string | null | undefined): readonly PermissionScopeTypeKey[] {
  return getPermissionResourceActionPolicy(resourceKey)?.scopeTypes ?? [];
}

export function isPermissionActionSupported(resourceKey: string | null | undefined, actionKey: PermissionActionKey) {
  const policy = getPermissionResourceActionPolicy(resourceKey);
  return policy ? actionListIncludes(policy.supportedActions, actionKey) : false;
}

export function isPermissionActionGrantableForResource(resourceKey: string | null | undefined, actionKey: PermissionActionKey) {
  return isPermissionActionSupported(resourceKey, actionKey);
}

export function isPermissionActionExplicitOnly(resourceKey: string | null | undefined, actionKey: PermissionActionKey) {
  const policy = getPermissionResourceActionPolicy(resourceKey);
  return policy ? actionListIncludes(policy.explicitOnlyActions, actionKey) : false;
}

export function canPermissionActionInheritFromAncestor(resourceKey: string | null | undefined, actionKey: PermissionActionKey) {
  const policy = getPermissionResourceActionPolicy(resourceKey);
  if (!policy) return false;
  return policy.ancestorInheritedActions.includes(actionKey);
}

export function canPermissionResourceInheritGlobalScope(resourceKey: string | null | undefined) {
  const policy = getPermissionResourceActionPolicy(resourceKey);
  return policy?.scopeInheritanceMode !== "self_only";
}

export function getPermissionScopeTypeFromScopeId(scopeId: string | null | undefined): PermissionScopeTypeKey | null {
  if (!scopeId) return null;
  const [scopeType] = scopeId.split(":", 1);
  return (PERMISSION_SCOPE_TYPE_KEYS as readonly string[]).includes(scopeType)
    ? scopeType as PermissionScopeTypeKey
    : null;
}

export function getSpaceParentResourceKeyForScopeId(scopeId: string | null | undefined) {
  const scopeType = getPermissionScopeTypeFromScopeId(scopeId);
  return scopeType ? SPACE_PARENT_RESOURCE_KEY_BY_SCOPE_TYPE[scopeType as SpaceParentScopeType] ?? null : null;
}

export function getSpaceParentResourceKeyForTargetType(targetType: string | null | undefined) {
  return deriveSpaceParentResourceKeyForTargetType(targetType);
}

export function getSpaceChildResourceKeyForTargetType(
  targetType: string | null | undefined,
  kind: SpaceResourceKind,
) {
  const key = deriveSpaceChildResourceKeyForTargetType(targetType, kind);
  return key && getPermissionResourceActionPolicy(key) ? key : null;
}

export function getSpaceChildResourceKeysForTargetType(targetType: string | null | undefined) {
  return deriveSpaceChildResourceKeysForTargetType(activeWorkspacePackages, targetType)
    .filter((key) => Boolean(getPermissionResourceActionPolicy(key)));
}

export function getSpaceResourceKindFromEntryKind(entryKind: string): SpaceResourceKind | null {
  return deriveSpaceResourceKindFromEntryKind(activeWorkspacePackages, entryKind);
}

export function isSpaceParentResourceKey(resourceKey: string | null | undefined) {
  return Object.values(SPACE_PARENT_RESOURCE_KEY_BY_SCOPE_TYPE).includes(resourceKey as typeof SPACE_PARENT_RESOURCE_KEY_BY_SCOPE_TYPE[SpaceParentScopeType]);
}
