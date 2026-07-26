import type { ApiGuardRegistration } from "@workspace/core";
import {
  isPermissionRegistryActionKey,
  type PermissionRegistryActionKey,
} from "./action-registry";
import {
  getSpaceChildResourceKeyForTargetType,
  type SpaceResourceKind,
} from "./space-resource-model";
import { WORK_OKR_CONTROL_CAPABILITY_KEY } from "./work-reporting-policy";

type ApiMethod = ApiGuardRegistration["method"];

// Central API permission-action registry.
// module-registry owns API/resource coverage. This file records the new semantic
// requiredActions used by API authorization and governance checks.
export interface PermissionApiActionPolicy {
  method: ApiMethod;
  pathPrefix: string;
  authorizationResourceKey?: string;
  requiredActions: readonly PermissionRegistryActionKey[];
  runtimeEnforcement?: "gateway" | "serviceDelegated";
  pathPattern?: RegExp;
  scopeExtractor?: PermissionApiScopeExtractor;
  notes?: string;
}

interface ResolvePermissionApiActionInput {
  method: ApiMethod;
  apiPath: string;
  resourceKey: string | null;
  searchParams?: URLSearchParams;
}

export interface ResolvedPermissionApiActionPolicy {
  resourceKey: string | null;
  requiredActions: readonly PermissionRegistryActionKey[];
  runtimeEnforcement: "gateway" | "serviceDelegated";
  scopeId: string | null;
  projection: "default" | "space";
  notes: string | null;
}

export interface PermissionApiPathMatchContext {
  apiPath: string;
  searchParams: URLSearchParams;
  match: RegExpMatchArray | null;
  groups: Record<string, string>;
}

export interface PermissionApiScope {
  scopeId: string | null;
  projection?: "default" | "space";
}

export type PermissionApiScopeExtractor = (context: PermissionApiPathMatchContext) => PermissionApiScope | null;

const DEFAULT_REQUIRED_ACTION_BY_METHOD = {
  GET: ["read"],
  POST: ["create"],
  PUT: ["update"],
  PATCH: ["update"],
  DELETE: ["delete"],
} as const satisfies Record<ApiMethod, readonly PermissionRegistryActionKey[]>;

export function defaultRequiredApiActionsForMethod(method: ApiMethod): readonly PermissionRegistryActionKey[] {
  return DEFAULT_REQUIRED_ACTION_BY_METHOD[method];
}

const SETTINGS_ADMIN_GRANT_ENFORCEMENT_NOTES = "Admin permission APIs authorize root users or resource-range grant managers in the route/service.";
const SETTINGS_ADMIN_AUDIT_ENFORCEMENT_NOTES = "Admin ledger APIs filter visible records by root, workflow admin, or manageable resource range in the route/service.";
const SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES = "Admin configuration APIs are restricted by root or workflow/resource admin checks in the route/service.";
const SETTINGS_ADMIN_READ_ENFORCEMENT_NOTES = "Admin read APIs are scoped by root or manageable resource filters in the route/service.";

function standardBusinessSpaceScopeId(targetType: string, targetId: string | number) {
  const normalized = targetType === "user" ? "personal" : targetType;
  if (normalized === "company") return "company:company";
  if (normalized === "committee") return "committee:operating-committee";
  return `${normalized}:${targetId}`;
}

function standardBusinessSpaceScopeFromPath({ groups }: PermissionApiPathMatchContext): PermissionApiScope | null {
  const { targetType, targetId } = groups;
  if (!targetType || !targetId) return null;
  if (targetType.startsWith(":") || targetId.startsWith(":")) return null;
  if (!["personal", "user", "department", "committee", "company", "project"].includes(targetType)) return null;
  return {
    scopeId: standardBusinessSpaceScopeId(targetType, targetId),
    projection: targetType === "personal" || targetType === "user" ? "default" : "space",
  };
}

function projectSpaceResourceKey(rootResourceKey: string, scopeId: string | null, projection: "default" | "space") {
  if (projection !== "space" || !scopeId) return rootResourceKey;
  const [scopeType] = scopeId.split(":", 1);
  const kindByRootResourceKey: Partial<Record<string, SpaceResourceKind>> = {
    "work.tasks": "tasks",
    "work.projects": "projects",
    "docs.editor": "templates",
    "finance.operationalAnalytics": "analytics",
  };
  const kind = kindByRootResourceKey[rootResourceKey];
  return kind ? getSpaceChildResourceKeyForTargetType(scopeType, kind) ?? rootResourceKey : rootResourceKey;
}

export const PERMISSION_API_ACTION_POLICIES = [
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/assets", requiredActions: ["create"], pathPattern: /^\/api\/modules\/finance\/ledger\/assets$/ },
  { method: "PUT", pathPrefix: "/api/modules/finance/ledger/assets", requiredActions: ["update"], pathPattern: /^\/api\/modules\/finance\/ledger\/assets$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/asset-adjustments", requiredActions: ["revise"] },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/asset-periods/recalculate", requiredActions: ["revise"] },
  { method: "POST", pathPrefix: "/api/modules/inventory/operations/documents", requiredActions: ["update"], pathPattern: /^\/api\/modules\/inventory\/operations\/documents\/[^/]+\/post$/ },
  { method: "POST", pathPrefix: "/api/modules/inventory/operations/documents", requiredActions: ["reverse"], pathPattern: /^\/api\/modules\/inventory\/operations\/documents\/[^/]+\/reverse$/ },
  { method: "POST", pathPrefix: "/api/modules/inventory/operations/closing/link-voucher", requiredActions: ["lock"] },
  { method: "POST", pathPrefix: "/api/modules/administration/contracts", requiredActions: ["create"], pathPattern: /^\/api\/modules\/administration\/contracts$/ },
  { method: "GET", pathPrefix: "/api/modules/administration/contracts/export", requiredActions: ["export"], pathPattern: /^\/api\/modules\/administration\/contracts\/export$/ },
  { method: "POST", pathPrefix: "/api/modules/administration/erp-diligence", requiredActions: ["update"], notes: "Evidence upload updates the current user's ERP diligence submission." },
  { method: "DELETE", pathPrefix: "/api/modules/administration/erp-diligence", requiredActions: ["update"], notes: "Evidence deletion updates the current user's ERP diligence submission; ownership is rechecked in the service transaction." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor$/, notes: "Template create is enforced by docs-editor service from target template space." },
  { method: "GET", pathPrefix: "/api/modules/docs/editor", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Docs editor read APIs list or load objects through template-space visibility in the docs-editor service." },
  { method: "PUT", pathPrefix: "/api/modules/docs/editor", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", notes: "Docs editor updates are enforced by docs-editor service from the concrete template space." },
  { method: "PATCH", pathPrefix: "/api/modules/docs/editor", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", notes: "Docs editor patch-style updates are enforced by docs-editor service from the concrete template space." },
  { method: "DELETE", pathPrefix: "/api/modules/docs/editor", requiredActions: ["delete"], runtimeEnforcement: "serviceDelegated", notes: "Docs editor deletes are enforced by docs-editor service from the concrete template space." },
  { method: "GET", pathPrefix: "/api/modules/docs/editor/submissions", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Workflow visibility uses the base docs action while the docs template adapter enforces target-space access." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/submissions", requiredActions: ["submit"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/submissions\/[^/]+\/submit$/, notes: "Template submit uses the base docs action; the docs template adapter enforces target-space authorization." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/submissions", requiredActions: ["approve"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/submissions\/[^/]+\/approve$/, notes: "Template approval uses the base docs action; the docs template adapter enforces target-space authorization." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/submissions", requiredActions: ["reject"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/submissions\/[^/]+\/reject$/, notes: "Template rejection uses the base docs action; the docs template adapter enforces target-space authorization." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/submissions", requiredActions: ["reverse"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/submissions\/[^/]+\/(?:withdraw|cancel)$/, notes: "Template withdrawal and cancellation use the base docs action; the docs template adapter enforces target-space authorization." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/submissions", requiredActions: ["approve"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/submissions\/[^/]+\/comment$/, notes: "Workflow comments are attached to approval processing and enforced by the docs template workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/submissions", requiredActions: ["submit"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/submissions$/, notes: "Template draft creation uses the base docs action; the docs template adapter enforces target-space authorization." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/submissions", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Workflow comment/list fallback actions only require workflow visibility at the API gateway; object rules stay in the docs template workflow adapter." },
  { method: "PUT", pathPrefix: "/api/modules/docs/editor/submissions", requiredActions: ["revise"], runtimeEnforcement: "serviceDelegated", notes: "Submitter revise is enforced by the docs template workflow adapter." },
  { method: "GET", pathPrefix: "/api/modules/docs/editor/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/spaces\/[^/]+\/permissions$/, notes: "Permission-table visibility is part of grant management and is enforced by docs-editor space permission service." },
  { method: "PUT", pathPrefix: "/api/modules/docs/editor/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/spaces\/[^/]+\/permissions$/, notes: "Space permission writes mutate scoped grants and are enforced by docs-editor space permission service." },
  { method: "PUT", pathPrefix: "/api/modules/docs/editor/templates", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/templates\/[^/]+$/, notes: "Template update is enforced by docs-editor service from template space." },
  { method: "DELETE", pathPrefix: "/api/modules/docs/editor/templates", requiredActions: ["delete"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/templates\/[^/]+$/, notes: "Template delete is enforced by docs-editor service from template space." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/templates", requiredActions: ["approve"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/templates\/[^/]+\/publish$/, notes: "Template publish is enforced by docs-editor service from template space approve action." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/templates", requiredActions: ["archive"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/templates\/[^/]+\/archive$/, notes: "Template archive is enforced by docs-editor service from template space archive/delete actions." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/templates", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/docs\/editor\/templates\/[^/]+\/copy$/, notes: "Template copy/create is enforced by docs-editor service from target template space." },
  { method: "GET", pathPrefix: "/api/modules/hr/roster/generated/export", requiredActions: ["export"] },
  { method: "GET", pathPrefix: "/api/modules/hr/performance", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Performance dashboard reads HR facts plus OKR snapshots without requiring work.tasks permission." },
  { method: "GET", pathPrefix: "/api/modules/hr/performance/submissions", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Workflow visibility is enforced by the HR performance workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/performance/submissions", requiredActions: ["submit"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/performance\/submissions$/, notes: "Performance self-review draft creation is enforced by the HR performance workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/performance/submissions", requiredActions: ["submit"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/performance\/submissions\/[^/]+\/submit$/, notes: "Performance workflow submit is enforced by the HR performance workflow adapter." },
  { method: "PUT", pathPrefix: "/api/modules/hr/performance/submissions", requiredActions: ["revise"], runtimeEnforcement: "serviceDelegated", notes: "Employee/manager/HR stage edits are enforced by the HR performance workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/performance/submissions", requiredActions: ["reverse"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/performance\/submissions\/[^/]+\/(?:withdraw|cancel)$/, notes: "Performance workflow withdrawal/cancellation is enforced by the HR performance workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/performance/submissions", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/performance\/submissions\/[^/]+\/comment$/, notes: "Workflow comments require performance visibility; participant access is enforced by the HR performance workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/performance/submissions", requiredActions: ["approve"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/performance\/submissions\/[^/]+\/approve$/, notes: "Performance approval and final archive are enforced by the HR performance workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/performance/submissions", requiredActions: ["reject"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/performance\/submissions\/[^/]+\/reject$/, notes: "Performance rejection is enforced by the HR performance workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/audit-log/restore", requiredActions: ["revise"] },
  { method: "GET", pathPrefix: "/api/modules/hr/roster/submissions", requiredActions: ["read"], notes: "Workflow visibility is enforced by the HR department workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/submissions", requiredActions: ["submit"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/roster\/submissions$/, notes: "Department workflow draft creation and flow initiation are enforced by the HR department workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/submissions", requiredActions: ["submit"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/roster\/submissions\/[^/]+\/submit$/, notes: "Department workflow submit is enforced by the HR department workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/submissions", requiredActions: ["approve"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/roster\/submissions\/[^/]+\/approve$/, notes: "Department workflow approval is enforced by the HR department workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/submissions", requiredActions: ["reject"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/roster\/submissions\/[^/]+\/reject$/, notes: "Department workflow rejection is enforced by the HR department workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/submissions", requiredActions: ["reverse"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/roster\/submissions\/[^/]+\/(?:withdraw|cancel)$/, notes: "Department workflow withdrawal/cancellation is enforced by the HR department workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/submissions", requiredActions: ["approve"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/roster\/submissions\/[^/]+\/comment$/, notes: "Workflow comments are attached to approval processing and enforced by the HR department workflow adapter." },
  { method: "PUT", pathPrefix: "/api/modules/hr/roster/submissions", requiredActions: ["revise"], runtimeEnforcement: "serviceDelegated", notes: "Submitter revise is enforced by the HR department workflow adapter." },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/departments", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/roster\/departments$/, notes: "Department create resolves direct create versus workflow submit in the shared business-action executor." },
  { method: "PUT", pathPrefix: "/api/modules/hr/roster/departments", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/hr\/roster\/departments$/, notes: "Department update resolves direct update versus workflow submit in the shared business-action executor." },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/departments", requiredActions: ["archive"], pathPattern: /^\/api\/modules\/hr\/roster\/departments\/[^/]+\/archive$/ },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/positions", requiredActions: ["archive"], pathPattern: /^\/api\/modules\/hr\/roster\/positions\/[^/]+\/archive$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/budget", requiredActions: ["import"], pathPattern: /^\/api\/modules\/finance\/budget$/ },
  { method: "GET", pathPrefix: "/api/modules/finance/cost/operational-analytics/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/finance\/cost\/operational-analytics\/spaces\/(?<targetType>department|project)\/(?<targetId>[^/]+)\/permissions$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "Permission-table visibility is enforced by the operational analytics space permission service." },
  { method: "PUT", pathPrefix: "/api/modules/finance/cost/operational-analytics/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", notes: "Operational analytics permission updates are delegated to the scoped permission service." },
  { method: "PUT", pathPrefix: "/api/modules/finance/cost/operational-analytics/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/finance\/cost\/operational-analytics\/spaces\/(?<targetType>department|project)\/(?<targetId>[^/]+)\/permissions$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "Operational analytics grants are scoped to the concrete department or project." },
  { method: "GET", pathPrefix: "/api/modules/finance/cost/operational-analytics/spaces", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/finance\/cost\/operational-analytics\/spaces\/(?<targetType>personal|department|project)\/(?<targetId>[^/]+)\/templates\/[^/]+\/lifecycle$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "Version history is visible only to users who can configure the concrete analysis space." },
  { method: "POST", pathPrefix: "/api/modules/finance/cost/operational-analytics/spaces", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/finance\/cost\/operational-analytics\/spaces\/(?<targetType>personal|department|project)\/(?<targetId>[^/]+)\/templates\/[^/]+\/(?:lifecycle|preview)$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "Draft preview and lifecycle transitions require configure permission; services also recheck scope, revision CAS and source authorization." },
  { method: "POST", pathPrefix: "/api/modules/finance/cost/operational-analytics/spaces", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/finance\/cost\/operational-analytics\/spaces\/(?<targetType>personal|department|project)\/(?<targetId>[^/]+)\/templates\/[^/]+\/runtime$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "This POST is a non-mutating v3 analysis read: Finance verifies the exact template revision and target space, while every source owner rechecks its original business read and object-visibility rules." },
  { method: "POST", pathPrefix: "/api/modules/finance/cost/operational-analytics/spaces", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: "Operational analytics space commands resolve their concrete target and operation in the Finance service; specific runtime reads are narrowed by the route policy above." },
  { method: "GET", pathPrefix: "/api/modules/finance/cost/operational-analytics", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "The Finance service resolves self-only personal access or the concrete department analytics scope before querying shipment facts." },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/accounts", requiredActions: ["create"], pathPattern: /^\/api\/modules\/finance\/ledger\/accounts$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/vouchers", requiredActions: ["create"], pathPattern: /^\/api\/modules\/finance\/ledger\/vouchers$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/periods", requiredActions: ["create"], pathPattern: /^\/api\/modules\/finance\/ledger\/periods$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/init", requiredActions: ["create"] },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/balances", requiredActions: ["revise"] },
  { method: "GET", pathPrefix: "/api/modules/finance/ledger/export", requiredActions: ["export"], pathPattern: /^\/api\/modules\/finance\/ledger\/export$/ },
  { method: "PUT", pathPrefix: "/api/modules/finance/ledger/reclass-rules", requiredActions: ["revise"], pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-rules$/ },
  { method: "PUT", pathPrefix: "/api/modules/finance/ledger/reclass-adjustments", requiredActions: ["revise"], pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-adjustments$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/reclass-results", requiredActions: ["revise"], pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-results$/ },
  { method: "PATCH", pathPrefix: "/api/modules/finance/ledger/reclass-results", requiredActions: ["revise"], pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-results\/[^/]+$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/budget/versions", requiredActions: ["create"], pathPattern: /^\/api\/modules\/finance\/budget\/versions$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/budget/versions", requiredActions: ["approve"], pathPattern: /^\/api\/modules\/finance\/budget\/versions\/[^/]+\/activate$/ },
  { method: "GET", pathPrefix: "/api/modules/finance/statements/reports/export", requiredActions: ["export"], pathPattern: /^\/api\/modules\/finance\/statements\/reports\/export$/ },
  { method: "GET", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["export"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/report\/export$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statements/consolidation/exchange-rates", requiredActions: ["approve"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/exchange-rates\/[^/]+\/review$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["create"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches$/ },
  { method: "DELETE", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["delete"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+$/ },
  { method: "PUT", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["update"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/(?:sources|control-decisions)$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["update"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/entries$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["update"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/entries\/generate$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["approve"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/entries\/[^/]+\/approve$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["reject"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/entries\/[^/]+\/return$/ },
  { method: "PUT", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["update"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/entries\/[^/]+\/tax-effects$/ },
  { method: "DELETE", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["delete"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/entries\/[^/]+$/ },
  { method: "DELETE", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["delete"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/entries\/[^/]+\/tax-effects\/[^/]+$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["submit"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/submit$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["reject"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/return$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["approve"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/(?:review|publish)$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statements/consolidation/batches", requiredActions: ["lock"], pathPattern: /^\/api\/modules\/finance\/statements\/consolidation\/batches\/[^/]+\/lock$/ },
  { method: "POST", pathPrefix: "/api/modules/production/qc", requiredActions: ["create"], pathPattern: /^\/api\/modules\/production\/qc$/ },
  { method: "POST", pathPrefix: "/api/modules/production/qc", requiredActions: ["approve"], pathPattern: /^\/api\/modules\/production\/qc\/[^/]+\/approve-review$/ },
  { method: "POST", pathPrefix: "/api/modules/inventory/receipts", requiredActions: ["submit"], pathPattern: /^\/api\/modules\/inventory\/receipts\/reports\/[^/]+\/confirm$/ },
  { method: "POST", pathPrefix: "/api/modules/inventory/receipts", requiredActions: ["approve"], pathPattern: /^\/api\/modules\/inventory\/receipts\/reports\/[^/]+\/review$/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", requiredActions: ["create"], pathPattern: /^\/api\/modules\/work\/meetings$/ },
  { method: "GET", pathPrefix: "/api/modules/work/projects", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Work project reads are filtered by project visibility and project-space service rules." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", notes: "Work project mutations are enforced by project service guards from project id or target space." },
  { method: "DELETE", pathPrefix: "/api/modules/work/projects", requiredActions: ["delete"], runtimeEnforcement: "serviceDelegated", notes: "Work project deletes are enforced by project service guards from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/projects", authorizationResourceKey: "work.projects.initiate", requiredActions: ["submit"], runtimeEnforcement: "gateway", pathPattern: /^\/api\/modules\/work\/projects$/, notes: "Project initiation requires the work.projects.initiate submit capability; Work rechecks the exact action and active-employee eligibility before an approval draft can be created." },
  { method: "POST", pathPrefix: "/api/modules/work/projects/submissions", requiredActions: ["approve"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/submissions\/[^/]+\/approve$/, notes: "Project confirmation approval is restricted to the current request's unresolved enabling-department owners by the Work approval adapter." },
  { method: "POST", pathPrefix: "/api/modules/work/projects/submissions", requiredActions: ["reject"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/submissions\/[^/]+\/reject$/, notes: "Project confirmation rejection is restricted to the current request's unresolved enabling-department owners by the Work approval adapter." },
  { method: "POST", pathPrefix: "/api/modules/work/projects/submissions", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/submissions\/[^/]+\/comment$/, notes: "Project confirmation comments are restricted by the Work approval adapter to the submitter or a current request handler." },
  { method: "GET", pathPrefix: "/api/modules/work/projects/spaces", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Project-space listing is filtered by project space visibility." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", notes: "Project-space permission updates mutate scoped grants and are enforced by project space permission service." },
  { method: "GET", pathPrefix: "/api/modules/work/projects/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/spaces\/(?<targetType>[^/]+)\/(?<targetId>[^/]+)\/permissions$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "Permission-table visibility is part of grant management and is enforced by project space permission service." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/spaces\/(?<targetType>[^/]+)\/(?<targetId>[^/]+)\/permissions$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "Space permission updates mutate scoped grants and are enforced by project space permission service." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/(?!gantt$|members$|reference-options$|spaces$)[^/]+$/, notes: "Scoped update is enforced by project field command guard from project id." },
  { method: "DELETE", pathPrefix: "/api/modules/work/projects", requiredActions: ["delete"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/(?!gantt$|members$|reference-options$|spaces$)[^/]+$/, notes: "Scoped delete is enforced by project delete command guard from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/projects", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-baselines$/, notes: "Scoped baseline create is enforced by project baseline service from project id." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-dependencies$/, notes: "Scoped dependency update is enforced by project plan service from project id." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-gantt$/, notes: "Scoped plan save is enforced by project plan service from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/projects", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-phases$/, notes: "Scoped phase create is enforced by project plan service from project id." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-phases\/[^/]+$/, notes: "Scoped phase update is enforced by project plan service from project id." },
  { method: "DELETE", pathPrefix: "/api/modules/work/projects", requiredActions: ["delete"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-phases\/[^/]+$/, notes: "Scoped phase delete is enforced by project plan service from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/projects", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/tasks$/, notes: "Scoped project task create is enforced by project task service from project id." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/tasks\/[^/]+$/, notes: "Scoped project task update is enforced by project task service from project id." },
  { method: "DELETE", pathPrefix: "/api/modules/work/projects", requiredActions: ["delete"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/tasks\/[^/]+$/, notes: "Scoped project task delete is enforced by project task service from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/projects/members", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/members$/, notes: "Project-member creation is a child operation of the owning project and is enforced by project member service from body projectId." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects/members", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/members\/[^/]+$/, notes: "Project-member update is a child operation of the owning project and is enforced by project member service from existing member project." },
  { method: "DELETE", pathPrefix: "/api/modules/work/projects/members", requiredActions: ["delete"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/members\/[^/]+$/, notes: "Project-member deletion is a child operation of the owning project and is enforced by project member service from existing member project." },
  { method: "GET", pathPrefix: "/api/modules/work/tasks/okr-control", authorizationResourceKey: WORK_OKR_CONTROL_CAPABILITY_KEY, requiredActions: ["configure"], runtimeEnforcement: "gateway", pathPattern: /^\/api\/modules\/work\/tasks\/okr-control$/, notes: "Cycle, workflow and reporting configuration reads require the dedicated configure capability." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks/okr-control", authorizationResourceKey: WORK_OKR_CONTROL_CAPABILITY_KEY, requiredActions: ["configure"], runtimeEnforcement: "gateway", pathPattern: /^\/api\/modules\/work\/tasks\/okr-control$/, notes: "Cycle, workflow and reporting configuration writes require the dedicated configure capability; Work rechecks it before persistence." },
  { method: "GET", pathPrefix: "/api/modules/work/tasks", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Work task reads are filtered by task-space visibility and object service rules." },
  { method: "GET", pathPrefix: "/api/modules/work/tasks/collaborations", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/collaborations$/, notes: "Department collaboration reads are scoped by the requested department space." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/collaborations", requiredActions: ["submit"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/collaborations$/, notes: "Department collaboration creation always enters the submit contract; zero default nodes auto-commit." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/collaborations", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/collaborations\/[^/]+\/respond$/, notes: "The enabling department update permission and pending response state are enforced by the collaboration domain validator." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", notes: "Work task mutations are enforced by work task service guards from item id or target space." },
  { method: "DELETE", pathPrefix: "/api/modules/work/tasks", requiredActions: ["delete"], runtimeEnforcement: "serviceDelegated", notes: "Work task deletes are enforced by work task service guards from existing item target." },
  { method: "GET", pathPrefix: "/api/modules/work/tasks/period-collection", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/period-collection$/, notes: "Period collection reads are scoped by the Work task target command guard from targetType/targetId." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/period-schedule", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/period-schedule$/, notes: "Period schedule creation is scoped by the Work task create guard from the root plan target." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks$/, notes: "Scoped create is enforced by work task command guard from targetType/targetId." },
  { method: "GET", pathPrefix: "/api/modules/work/tasks/spaces", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Work task-space listing is filtered by task-space visibility." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", notes: "Work task-space permission updates mutate scoped grants and are enforced by work task space permission service." },
  { method: "GET", pathPrefix: "/api/modules/work/tasks/reports", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Work report reads are filtered by task-space visibility." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks/reports", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/reports$/, notes: "Scoped report save is enforced by work report command guard from targetType/targetId." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/kpi/definitions", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/kpi\/definitions$/, notes: "KPI definition ownership and department scope are enforced by the Work KPI service." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks/kpi/definitions", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/kpi\/definitions\/[^/]+$/, notes: "KPI definition revision is enforced by existing definition ownership and Work department scope." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks/plans", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/plans\/[^/]+\/kpi-scorecard$/, notes: "KPI scorecard direct finalization is guarded by the plan-bound objective ActionRuntime." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks/plans", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/plans\/[^/]+\/kpi-measurements$/, notes: "KPI measurement updates are scoped by the existing plan target and execution stage." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/(?!plans$|reference-options$|reports$|spaces$|submissions$)[^/]+$/, notes: "Scoped update is enforced by work task command guard from the existing item target; archive intent is narrowed by service guard." },
  { method: "DELETE", pathPrefix: "/api/modules/work/tasks", requiredActions: ["delete"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/(?!plans$|reference-options$|reports$|spaces$|submissions$)[^/]+$/, notes: "Scoped delete is enforced by work task command guard from the existing item target." },
  { method: "GET", pathPrefix: "/api/modules/work/tasks/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/spaces\/(?<targetType>[^/]+)\/(?<targetId>[^/]+)\/permissions$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "Permission-table visibility is part of grant management and is enforced by work task space permission service." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/spaces\/(?<targetType>[^/]+)\/(?<targetId>[^/]+)\/permissions$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "Space permission updates mutate scoped grants and are enforced by work task space permission service." },
  { method: "GET", pathPrefix: "/api/modules/work/tasks/submissions", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: "Scoped approval visibility is enforced by the Work approval adapter from targetType/targetId." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/submissions", requiredActions: ["submit"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/submissions$/, notes: "Work approval draft creation and flow initiation are enforced by the Work approval adapter on derived space resources." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/submissions", requiredActions: ["submit"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/submissions\/[^/]+\/submit$/, notes: "Work approval submit is enforced by the Work approval adapter on derived space resources." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/submissions", requiredActions: ["approve"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/submissions\/[^/]+\/approve$/, notes: "Work approval processing is enforced by the Work approval adapter on derived space resources." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/submissions", requiredActions: ["reject"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/submissions\/[^/]+\/reject$/, notes: "Work approval rejection is enforced by the Work approval adapter on derived space resources." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/submissions", requiredActions: ["reverse"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/submissions\/[^/]+\/(?:withdraw|cancel)$/, notes: "Work approval withdrawal/cancellation is enforced by the Work approval adapter on derived space resources." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/submissions", requiredActions: ["approve"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/submissions\/[^/]+\/comment$/, notes: "Workflow comments are attached to approval processing and enforced by the Work approval adapter." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks/submissions", requiredActions: ["revise"], runtimeEnforcement: "serviceDelegated", notes: "Scoped submitter revise is enforced by the Work approval adapter on derived space resources." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/plans", requiredActions: ["create"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/plans$/, notes: "Scoped plan create is enforced by work plan command guard from targetType/targetId." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks/plans", requiredActions: ["update"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/plans\/[^/]+$/, notes: "Scoped plan update is enforced by work plan command guard from the existing plan target." },
  { method: "DELETE", pathPrefix: "/api/modules/work/tasks/plans", requiredActions: ["archive"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/plans\/[^/]+$/, notes: "Scoped archive is enforced by work plan command guard from the existing plan target." },
  { method: "DELETE", pathPrefix: "/api/modules/work/tasks/plans", requiredActions: ["delete"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/tasks\/plans\/[^/]+\/delete$/, notes: "Scoped hard delete is enforced by work plan command guard from the existing plan target." },
  { method: "POST", pathPrefix: "/api/modules/work/projects", requiredActions: ["revise"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-baselines\/[^/]+\/activate$/, notes: "Scoped baseline activation is enforced by project baseline service from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", requiredActions: ["update"], pathPattern: /^\/api\/modules\/work\/meetings\/(?![^/]+\/votes\/[^/]+\/(?:cast|close)$).+/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", requiredActions: ["update"], pathPattern: /^\/api\/modules\/work\/meetings\/[^/]+\/proposals$/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", requiredActions: ["submit"], pathPattern: /^\/api\/modules\/work\/meetings\/[^/]+\/votes\/[^/]+\/cast$/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", requiredActions: ["approve"], pathPattern: /^\/api\/modules\/work\/meetings\/[^/]+\/votes\/[^/]+\/close$/ },
  { method: "GET", pathPrefix: "/api/modules/library/basic-info", requiredActions: ["export"], pathPattern: /^\/api\/modules\/library\/basic-info\/(?!(?:categories|directories|documents|generated-sources|scan|search)(?:\/|$)).+$/ },
  { method: "GET", pathPrefix: "/api/modules/library/basic-info/documents", requiredActions: ["export"], pathPattern: /^\/api\/modules\/library\/basic-info\/documents\/[^/]+\/download$/ },
  { method: "GET", pathPrefix: "/api/modules/library/basic-info/documents", requiredActions: ["export"], pathPattern: /^\/api\/modules\/library\/basic-info\/documents\/[^/]+\/versions\/[^/]+\/download$/ },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/exports", requiredActions: ["export"], notes: "Creating a classified package is an export operation; the Library service rechecks every selected version and requester." },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/directories", requiredActions: ["configure"], pathPattern: /^\/api\/modules\/library\/basic-info\/directories$/, notes: "Folder creation changes the shared Library classification structure." },
  { method: "PATCH", pathPrefix: "/api/modules/library/basic-info/directories", requiredActions: ["configure"], pathPattern: /^\/api\/modules\/library\/basic-info\/directories$/, notes: "Folder rename cascades the logical placement path for contained documents." },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/directories/delete", requiredActions: ["configure"], pathPattern: /^\/api\/modules\/library\/basic-info\/directories\/delete$/, notes: "Folder deletion is limited to empty leaf logical directories." },
  { method: "PATCH", pathPrefix: "/api/modules/library/basic-info/documents", requiredActions: ["update", "configure"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/modules\/library\/basic-info\/documents\/[^/]+$/, notes: "Document metadata updates are field-sensitive: ordinary metadata requires update and confidentiality changes require configure; lifecycle changes use the archive command." },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/documents", requiredActions: ["configure"], pathPattern: /^\/api\/modules\/library\/basic-info\/documents\/[^/]+\/delete$/, notes: "Permanent deletion is distinct from archive and removes managed runtime storage." },
  { method: "DELETE", pathPrefix: "/api/modules/library/basic-info/documents", requiredActions: ["archive"], notes: "Document DELETE is the archive lifecycle command; permanent deletion uses the explicit configure-authorized POST /delete route." },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/documents", requiredActions: ["import"], notes: "Document POST routes are import operations; uploading a file creates an immutable version and advances the document current-version pointer." },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/scan", requiredActions: ["import"] },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/generated-sources", requiredActions: ["import"], notes: "Generated-document creation requires import; overriding source confidentiality is additionally checked as configure in the library command builder." },
  { method: "POST", pathPrefix: "/api/settings/api/open/clients", requiredActions: ["create"], pathPattern: /^\/api\/settings\/api\/open\/clients$/ },
  { method: "PUT", pathPrefix: "/api/settings/api/open/clients", requiredActions: ["update"] },
  { method: "POST", pathPrefix: "/api/settings/api/open/clients", requiredActions: ["revise"], pathPattern: /^\/api\/settings\/api\/open\/clients\/[^/]+\/secret$/ },
  { method: "PUT", pathPrefix: "/api/settings/api/open/clients", requiredActions: ["grant"], pathPattern: /^\/api\/settings\/api\/open\/clients\/[^/]+\/scopes$/ },
  { method: "GET", pathPrefix: "/api/settings/account/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/settings\/account\/spaces\/(?<targetType>[^/]+)\/(?<targetId>[^/]+)\/permissions$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "Space permission-table visibility is enforced by scoped space parent grant checks." },
  { method: "PUT", pathPrefix: "/api/settings/account/spaces", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", pathPattern: /^\/api\/settings\/account\/spaces\/(?<targetType>[^/]+)\/(?<targetId>[^/]+)\/permissions$/, scopeExtractor: standardBusinessSpaceScopeFromPath, notes: "Space permission writes mutate scoped grants and are enforced by scoped space parent grant checks." },
  { method: "GET", pathPrefix: "/api/settings/account", requiredActions: ["read"], notes: "Self-service account APIs are scoped to the current session; default settings.account entry access admits logged-in users." },
  { method: "POST", pathPrefix: "/api/settings/account", requiredActions: ["read"], notes: "Self-service account writes mutate only the current user's preferences/profile; service code owns the current-user scope." },
  { method: "PUT", pathPrefix: "/api/settings/account", requiredActions: ["read"], notes: "Self-service account writes mutate only the current user's preferences/profile; service code owns the current-user scope." },
  { method: "PATCH", pathPrefix: "/api/settings/account", requiredActions: ["read"], notes: "Self-service account writes mutate only the current user's preferences/profile; service code owns the current-user scope." },
  { method: "DELETE", pathPrefix: "/api/settings/account", requiredActions: ["read"], notes: "Self-service account cleanup mutates only the current user's notification/preference state." },
  { method: "POST", pathPrefix: "/api/settings/account/api-key", requiredActions: ["revise"] },
  { method: "GET", pathPrefix: "/api/agent/profiles", requiredActions: ["read"], notes: "Virtual-employee profile discovery uses agent.assistant and only returns profiles with at least one registered tool currently usable by both requester and actor." },
  { method: "GET", pathPrefix: "/api/agent/capabilities", requiredActions: ["read"], notes: "Agent capability listing is filtered by each tool adapter's domain permission." },
  { method: "GET", pathPrefix: "/api/agent/proposals", requiredActions: ["read"], pathPattern: /^\/api\/agent\/proposals\/[^/]+$/, notes: "Proposal detail reads are restricted to the authenticated owner's safe view; execution payload and result are never returned." },
  { method: "POST", pathPrefix: "/api/agent/proposals", requiredActions: ["submit"], pathPattern: /^\/api\/agent\/proposals\/[^/]+\/(?:confirm|cancel)$/, notes: "Agent proposal settlement is a submit-cycle action; source.submitCnbPullRequest confirmation rechecks both identities against agent.source.submit and the fixed profile before the remote effect." },
  { method: "POST", pathPrefix: "/api/agent", requiredActions: ["submit"], pathPattern: /^\/api\/agent$/, notes: "Agent message submission may create proposals but domain writes are executor-checked after user confirmation." },
  { method: "GET", pathPrefix: "/api/settings/admin/permission-grant-ledger", requiredActions: ["audit"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_AUDIT_ENFORCEMENT_NOTES },
  { method: "GET", pathPrefix: "/api/settings/admin/workflow-ledger", requiredActions: ["audit"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_AUDIT_ENFORCEMENT_NOTES },
  { method: "GET", pathPrefix: "/api/settings/admin/permissions", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_GRANT_ENFORCEMENT_NOTES },
  { method: "GET", pathPrefix: "/api/settings/admin/permission-grants", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_GRANT_ENFORCEMENT_NOTES },
  { method: "PUT", pathPrefix: "/api/settings/admin/permission-grants", requiredActions: ["grant"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_GRANT_ENFORCEMENT_NOTES },
  { method: "GET", pathPrefix: "/api/settings/admin/workflow-policies", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
  { method: "PUT", pathPrefix: "/api/settings/admin/workflow-policies", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
  { method: "DELETE", pathPrefix: "/api/settings/admin/workflow-policies", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
  { method: "GET", pathPrefix: "/api/settings/admin/data-quality", requiredActions: ["audit"], runtimeEnforcement: "serviceDelegated", notes: "Data-quality workbench is restricted to root administrators by the route." },
  { method: "POST", pathPrefix: "/api/settings/admin/data-quality", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: "Manual evaluation and WeCom channel tests are restricted to root administrators by the route." },
  { method: "PUT", pathPrefix: "/api/settings/admin/data-quality", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: "Data-quality trigger and delivery policy updates are restricted to root administrators by the route." },
  { method: "GET", pathPrefix: "/api/settings/admin/system-config", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
  { method: "PUT", pathPrefix: "/api/settings/admin/system-config", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
  { method: "GET", pathPrefix: "/api/settings/admin/modules", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
  { method: "PATCH", pathPrefix: "/api/settings/admin/modules", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
  { method: "GET", pathPrefix: "/api/settings/admin", requiredActions: ["read"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_READ_ENFORCEMENT_NOTES },
  { method: "POST", pathPrefix: "/api/settings/admin", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
  { method: "PUT", pathPrefix: "/api/settings/admin", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
  { method: "PATCH", pathPrefix: "/api/settings/admin", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
  { method: "DELETE", pathPrefix: "/api/settings/admin", requiredActions: ["configure"], runtimeEnforcement: "serviceDelegated", notes: SETTINGS_ADMIN_CONFIG_ENFORCEMENT_NOTES },
] as const satisfies readonly PermissionApiActionPolicy[];

export const PERMISSION_API_ACTION_POLICY_LIST: readonly PermissionApiActionPolicy[] = PERMISSION_API_ACTION_POLICIES;

function normalizeApiPath(apiPath: string) {
  return apiPath.length > 1 ? apiPath.replace(/\/+$/g, "") : apiPath;
}

function pathMatchesPrefix(apiPath: string, pathPrefix: string) {
  return apiPath === pathPrefix || apiPath.startsWith(`${pathPrefix}/`);
}

function matchPolicyPath(policy: PermissionApiActionPolicy, apiPath: string) {
  if (policy.pathPattern) {
    policy.pathPattern.lastIndex = 0;
    return policy.pathPattern.exec(apiPath) ?? undefined;
  }
  return pathMatchesPrefix(apiPath, policy.pathPrefix) ? null : undefined;
}

function policyMatches(policy: PermissionApiActionPolicy, input: ResolvePermissionApiActionInput) {
  if (policy.method !== input.method) return false;
  return matchPolicyPath(policy, input.apiPath) !== undefined;
}

function findPermissionApiActionPolicy(input: ResolvePermissionApiActionInput) {
  if (!input.resourceKey) return null;
  const normalizedInput = { ...input, apiPath: normalizeApiPath(input.apiPath) };
  return PERMISSION_API_ACTION_POLICY_LIST
    .filter((policy) => policyMatches(policy, normalizedInput))
    .sort((left, right) => {
      const patternDelta = Number(Boolean(right.pathPattern)) - Number(Boolean(left.pathPattern));
      if (patternDelta !== 0) return patternDelta;
      return right.pathPrefix.length - left.pathPrefix.length;
    })[0];
}

function pathMatchContext(
  policy: PermissionApiActionPolicy | null,
  apiPath: string,
  searchParams?: URLSearchParams,
): PermissionApiPathMatchContext {
  const match = policy ? matchPolicyPath(policy, apiPath) ?? null : null;
  return {
    apiPath,
    searchParams: searchParams ?? new URLSearchParams(),
    match,
    groups: match?.groups ? { ...match.groups } : {},
  };
}

export function resolvePermissionApiActionPolicy(input: ResolvePermissionApiActionInput): ResolvedPermissionApiActionPolicy {
  if (!input.resourceKey) {
    return { resourceKey: null, requiredActions: [], runtimeEnforcement: "gateway", scopeId: null, projection: "default", notes: null };
  }
  const normalizedInput = { ...input, apiPath: normalizeApiPath(input.apiPath) };
  const matched = findPermissionApiActionPolicy(normalizedInput);
  const context = pathMatchContext(matched ?? null, normalizedInput.apiPath, input.searchParams);
  const scope = matched?.scopeExtractor?.(context) ?? null;
  const projection = scope?.projection ?? "default";
  const scopeId = scope?.scopeId ?? null;
  const policyResourceKey = matched?.authorizationResourceKey ?? input.resourceKey;
  const resourceKey = projectSpaceResourceKey(policyResourceKey, scopeId, projection);
  return {
    resourceKey,
    requiredActions: matched?.requiredActions ?? defaultRequiredApiActionsForMethod(input.method),
    runtimeEnforcement: matched?.runtimeEnforcement ?? "gateway",
    scopeId,
    projection,
    notes: matched?.notes ?? null,
  };
}

export function assertPermissionApiActionPolicySupported(input: ResolvePermissionApiActionInput) {
  const matched = findPermissionApiActionPolicy(input);
  if (!matched || !input.resourceKey) return;

  for (const actionKey of matched.requiredActions) {
    if (!isPermissionRegistryActionKey(actionKey)) {
      throw new Error(`API required action is not registered: ${input.method} ${input.apiPath} -> ${actionKey}`);
    }
  }

  if (matched.runtimeEnforcement === "serviceDelegated" && !matched.notes) {
    throw new Error(`API service-delegated required action must explain runtime enforcement: ${input.method} ${input.apiPath}`);
  }

  if (matched.runtimeEnforcement === "serviceDelegated") return;
}
