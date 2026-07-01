import type { ApiGuardRegistration } from "@workspace/core";
import type { PermissionActionKey } from "./permission-actions";
import { isPermissionActionSupported } from "./permission-resource-policy";

type ApiMethod = ApiGuardRegistration["method"];
type BaseApiAction = ApiGuardRegistration["action"];

// Central API permission-action registry.
// module-registry owns API/resource/base guard coverage; this file only refines
// API endpoints that need an action beyond the HTTP-method default.
export interface PermissionApiActionPolicy {
  method: ApiMethod;
  pathPrefix: string;
  resourceKey: string;
  baseAction?: BaseApiAction;
  additionalAction?: PermissionActionKey;
  pathPattern?: RegExp;
  notes?: string;
}

interface ResolvePermissionApiActionInput {
  method: ApiMethod;
  apiPath: string;
  resourceKey: string | null;
}

export interface ResolvedPermissionApiActionPolicy {
  baseAction: BaseApiAction | null;
  additionalAction: PermissionActionKey | null;
}

export const PERMISSION_API_ACTION_POLICIES = [
  { method: "POST", pathPrefix: "/api/modules/finance/import/preview", resourceKey: "finance.import", baseAction: "access" },
  { method: "POST", pathPrefix: "/api/modules/finance/import/confirm", resourceKey: "finance.import", baseAction: "access", additionalAction: "import" },
  { method: "POST", pathPrefix: "/api/modules/finance/import", resourceKey: "finance.import", baseAction: "access", additionalAction: "import" },
  { method: "POST", pathPrefix: "/api/modules/administration/contracts", resourceKey: "administration.contracts", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/modules\/administration\/contracts$/ },
  { method: "POST", pathPrefix: "/api/modules/docs/editor", resourceKey: "docs.editor", baseAction: "access", pathPattern: /^\/api\/modules\/docs\/editor$/, notes: "Scoped create is enforced by docs-editor service from target template space." },
  { method: "PUT", pathPrefix: "/api/modules/docs/editor/templates", resourceKey: "docs.editor", baseAction: "access", pathPattern: /^\/api\/modules\/docs\/editor\/templates\/[^/]+$/, notes: "Scoped write is enforced by docs-editor service from template space." },
  { method: "DELETE", pathPrefix: "/api/modules/docs/editor/templates", resourceKey: "docs.editor", baseAction: "access", pathPattern: /^\/api\/modules\/docs\/editor\/templates\/[^/]+$/, notes: "Scoped delete is enforced by docs-editor service from template space." },
  { method: "POST", pathPrefix: "/api/modules/docs/editor/templates", resourceKey: "docs.editor", baseAction: "access", pathPattern: /^\/api\/modules\/docs\/editor\/templates\/[^/]+\/copy$/, notes: "Scoped create is enforced by docs-editor service from target template space." },
  { method: "GET", pathPrefix: "/api/modules/hr/roster/generated/export", resourceKey: "hr.roster.generated", baseAction: "access", additionalAction: "export" },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/audit-log/restore", resourceKey: "hr.roster", baseAction: "access", additionalAction: "revise" },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/departments", resourceKey: "hr.roster", baseAction: "access", additionalAction: "archive", pathPattern: /^\/api\/modules\/hr\/roster\/departments\/[^/]+\/archive$/ },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/positions", resourceKey: "hr.roster", baseAction: "access", additionalAction: "archive", pathPattern: /^\/api\/modules\/hr\/roster\/positions\/[^/]+\/archive$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/budget", resourceKey: "finance.budget", baseAction: "access", additionalAction: "import", pathPattern: /^\/api\/modules\/finance\/budget$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/balances/reconcile", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "import" },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/accounts", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/modules\/finance\/ledger\/accounts$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/vouchers", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/modules\/finance\/ledger\/vouchers$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/periods", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/modules\/finance\/ledger\/periods$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/init", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "create" },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/balances", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "revise" },
  { method: "PUT", pathPrefix: "/api/modules/finance/ledger/reclass-rules", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "revise", pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-rules$/ },
  { method: "DELETE", pathPrefix: "/api/modules/finance/ledger/reclass-rules", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "revise", pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-rules\/[^/]+$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/reclass-results", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "revise", pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-results$/ },
  { method: "PATCH", pathPrefix: "/api/modules/finance/ledger/reclass-results", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "revise", pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-results\/[^/]+$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/budget/versions", resourceKey: "finance.budget", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/modules\/finance\/budget\/versions$/ },
  { method: "POST", pathPrefix: "/api/modules/production/qc", resourceKey: "production.qc", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/modules\/production\/qc$/ },
  { method: "POST", pathPrefix: "/api/modules/production/qc", resourceKey: "production.qc", baseAction: "access", additionalAction: "submit", pathPattern: /^\/api\/modules\/production\/qc\/[^/]+\/submit$/ },
  { method: "POST", pathPrefix: "/api/modules/production/qc", resourceKey: "production.qc", baseAction: "access", additionalAction: "approve", pathPattern: /^\/api\/modules\/production\/qc\/[^/]+\/approve-review$/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", resourceKey: "work.meetings", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/modules\/work\/meetings$/ },
  { method: "POST", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects$/, notes: "Scoped project-space create is enforced by Work service from project type and target space." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects/spaces", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/spaces\/[^/]+\/[^/]+\/permissions$/, notes: "Scoped project-space permission management is enforced by project space manager role." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+$/, notes: "Scoped write/delete is enforced by project field command guard from project id." },
  { method: "DELETE", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+$/, notes: "Scoped delete is enforced by project delete command guard from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-baselines$/, notes: "Scoped create is enforced by project baseline service from project id." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/permissions$/, notes: "Scoped permission management is enforced by project permission route from project id." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-dependencies$/, notes: "Scoped write is enforced by project plan service from project id." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-gantt$/, notes: "Scoped plan save is enforced by project plan service from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-phases$/, notes: "Scoped create is enforced by project plan service from project id." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-phases\/[^/]+$/, notes: "Scoped write is enforced by project plan service from project id." },
  { method: "DELETE", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-phases\/[^/]+$/, notes: "Scoped delete is enforced by project plan service from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/tasks$/, notes: "Scoped create is enforced by project task service from project id." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/tasks\/[^/]+$/, notes: "Scoped write is enforced by project task service from project id." },
  { method: "DELETE", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/tasks\/[^/]+$/, notes: "Scoped delete is enforced by project task service from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/projects/members", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/members$/, notes: "Scoped member management is enforced by project member service from body projectId." },
  { method: "PUT", pathPrefix: "/api/modules/work/projects/members", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/members\/[^/]+$/, notes: "Scoped member management is enforced by project member service from existing member project." },
  { method: "DELETE", pathPrefix: "/api/modules/work/projects/members", resourceKey: "work.projects", baseAction: "access", pathPattern: /^\/api\/modules\/work\/projects\/members\/[^/]+$/, notes: "Scoped member management is enforced by project member service from existing member project." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks", resourceKey: "work.tasks", baseAction: "access", pathPattern: /^\/api\/modules\/work\/tasks$/, notes: "Scoped create is enforced by work task command guard from targetType/targetId." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks", resourceKey: "work.tasks", baseAction: "access", pathPattern: /^\/api\/modules\/work\/tasks\/[^/]+$/, notes: "Scoped write is enforced by work task command guard from the existing item target." },
  { method: "DELETE", pathPrefix: "/api/modules/work/tasks", resourceKey: "work.tasks", baseAction: "access", pathPattern: /^\/api\/modules\/work\/tasks\/[^/]+$/, notes: "Scoped delete is enforced by work task command guard from the existing item target." },
  { method: "POST", pathPrefix: "/api/modules/work/tasks/plans", resourceKey: "work.tasks", baseAction: "access", pathPattern: /^\/api\/modules\/work\/tasks\/plans$/, notes: "Scoped create is enforced by work plan command guard from targetType/targetId." },
  { method: "PUT", pathPrefix: "/api/modules/work/tasks/plans", resourceKey: "work.tasks", baseAction: "access", pathPattern: /^\/api\/modules\/work\/tasks\/plans\/[^/]+$/, notes: "Scoped write is enforced by work plan command guard from the existing plan target." },
  { method: "DELETE", pathPrefix: "/api/modules/work/tasks/plans", resourceKey: "work.tasks", baseAction: "access", pathPattern: /^\/api\/modules\/work\/tasks\/plans\/[^/]+$/, notes: "Scoped archive is enforced by work plan command guard from the existing plan target." },
  { method: "DELETE", pathPrefix: "/api/modules/work/tasks/plans", resourceKey: "work.tasks", baseAction: "access", pathPattern: /^\/api\/modules\/work\/tasks\/plans\/[^/]+\/delete$/, notes: "Scoped hard delete is enforced by work plan command guard from the existing plan target." },
  { method: "POST", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", baseAction: "access", additionalAction: "revise", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-baselines\/[^/]+\/activate$/, notes: "Scoped revise is enforced by project baseline service from project id." },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", resourceKey: "work.meetings", baseAction: "write", pathPattern: /^\/api\/modules\/work\/meetings\/(?![^/]+\/votes\/[^/]+\/(?:cast|close)$).+/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", resourceKey: "work.meetings", baseAction: "write", pathPattern: /^\/api\/modules\/work\/meetings\/[^/]+\/proposals$/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", resourceKey: "work.meetings", baseAction: "access", additionalAction: "submit", pathPattern: /^\/api\/modules\/work\/meetings\/[^/]+\/votes\/[^/]+\/cast$/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", resourceKey: "work.meetings", baseAction: "access", additionalAction: "approve", pathPattern: /^\/api\/modules\/work\/meetings\/[^/]+\/votes\/[^/]+\/close$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statement-config/mappings", resourceKey: "finance.statementConfig", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/modules\/finance\/statement-config\/mappings$/ },
  { method: "PATCH", pathPrefix: "/api/modules/finance/statement-config/mappings", resourceKey: "finance.statementConfig", baseAction: "write", pathPattern: /^\/api\/modules\/finance\/statement-config\/mappings$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statement-review/reviews", resourceKey: "finance.statementReview", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/modules\/finance\/statement-review\/reviews$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statement-review/reviews", resourceKey: "finance.statementReview", baseAction: "access", additionalAction: "approve", pathPattern: /^\/api\/modules\/finance\/statement-review\/reviews\/[^/]+\/confirm$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/budget/versions", resourceKey: "finance.budget", baseAction: "access", additionalAction: "approve", pathPattern: /^\/api\/modules\/finance\/budget\/versions\/[^/]+\/activate$/ },
  { method: "GET", pathPrefix: "/api/modules/library/basic-info", resourceKey: "library.basicInfo", baseAction: "access", additionalAction: "export", pathPattern: /^\/api\/modules\/library\/basic-info\/(?!(?:categories|directories|documents|generated-sources|scan)(?:\/|$)).+$/ },
  { method: "GET", pathPrefix: "/api/modules/library/basic-info/documents", resourceKey: "library.basicInfo", baseAction: "access", additionalAction: "export", pathPattern: /^\/api\/modules\/library\/basic-info\/documents\/[^/]+\/download$/ },
  { method: "DELETE", pathPrefix: "/api/modules/library/basic-info/documents", resourceKey: "library.basicInfo", baseAction: "access", additionalAction: "archive", pathPattern: /^\/api\/modules\/library\/basic-info\/documents\/[^/]+$/ },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/scan", resourceKey: "library.basicInfo", baseAction: "access", additionalAction: "import" },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/generated-sources", resourceKey: "library.basicInfo", baseAction: "access", additionalAction: "import", pathPattern: /^\/api\/modules\/library\/basic-info\/generated-sources\/[^/]+\/generate$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/cost/imports", resourceKey: "finance.cost", baseAction: "access", additionalAction: "import", pathPattern: /^\/api\/modules\/finance\/cost\/imports$/ },
  { method: "POST", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/settings\/api\/open\/clients$/ },
  { method: "PUT", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", baseAction: "write" },
  { method: "POST", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", baseAction: "access", additionalAction: "revise", pathPattern: /^\/api\/settings\/api\/open\/clients\/[^/]+\/secret$/ },
  { method: "PUT", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", baseAction: "write", pathPattern: /^\/api\/settings\/api\/open\/clients\/[^/]+\/scopes$/ },
  { method: "POST", pathPrefix: "/api/settings/account/api-key", resourceKey: "settings.account.apiAccess", baseAction: "access", additionalAction: "revise" },
  { method: "POST", pathPrefix: "/api/agent", resourceKey: "agent", baseAction: "access", additionalAction: "submit" },
  { method: "GET", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", baseAction: "access" },
  { method: "POST", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", baseAction: "admin" },
  { method: "PUT", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", baseAction: "admin" },
  { method: "PATCH", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", baseAction: "admin" },
  { method: "DELETE", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", baseAction: "admin" },
  { method: "POST", pathPrefix: "/api/settings/account", resourceKey: "settings.account", baseAction: "access" },
  { method: "PUT", pathPrefix: "/api/settings/account", resourceKey: "settings.account", baseAction: "access" },
  { method: "PATCH", pathPrefix: "/api/settings/account", resourceKey: "settings.account", baseAction: "access" },
  { method: "DELETE", pathPrefix: "/api/settings/account", resourceKey: "settings.account", baseAction: "access" },
] as const satisfies readonly PermissionApiActionPolicy[];

export const PERMISSION_API_ACTION_POLICY_LIST: readonly PermissionApiActionPolicy[] = PERMISSION_API_ACTION_POLICIES;

function normalizeApiPath(apiPath: string) {
  return apiPath.length > 1 ? apiPath.replace(/\/+$/g, "") : apiPath;
}

function pathMatchesPrefix(apiPath: string, pathPrefix: string) {
  return apiPath === pathPrefix || apiPath.startsWith(`${pathPrefix}/`);
}

function policyMatches(policy: PermissionApiActionPolicy, input: ResolvePermissionApiActionInput) {
  if (policy.method !== input.method) return false;
  if (policy.resourceKey !== input.resourceKey) return false;
  if (policy.pathPattern) return policy.pathPattern.test(input.apiPath);
  return pathMatchesPrefix(input.apiPath, policy.pathPrefix);
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

export function resolvePermissionApiActionPolicy(
  input: ResolvePermissionApiActionInput & { defaultBaseAction: BaseApiAction | null },
): ResolvedPermissionApiActionPolicy {
  const matched = findPermissionApiActionPolicy(input);
  return {
    baseAction: matched?.baseAction ?? input.defaultBaseAction,
    additionalAction: matched?.additionalAction ?? null,
  };
}

export function assertPermissionApiActionPolicySupported(input: ResolvePermissionApiActionInput) {
  const matched = findPermissionApiActionPolicy(input);
  if (!matched?.additionalAction || !input.resourceKey) return;
  if (!isPermissionActionSupported(input.resourceKey, matched.additionalAction)) {
    throw new Error(`API additional permission action not supported: ${input.method} ${input.apiPath} -> ${input.resourceKey}.${matched.additionalAction}`);
  }
}
