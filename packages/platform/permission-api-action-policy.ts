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
  { method: "GET", pathPrefix: "/api/modules/hr/roster/generated/export", resourceKey: "hr.roster.generated", additionalAction: "export" },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/audit-log/restore", resourceKey: "hr.roster", additionalAction: "revise" },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/departments", resourceKey: "hr.roster", additionalAction: "archive", pathPattern: /^\/api\/modules\/hr\/roster\/departments\/[^/]+\/archive$/ },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/positions", resourceKey: "hr.roster", additionalAction: "archive", pathPattern: /^\/api\/modules\/hr\/roster\/positions\/[^/]+\/archive$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/budget", resourceKey: "finance.budget", additionalAction: "import", pathPattern: /^\/api\/modules\/finance\/budget$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/balances/reconcile", resourceKey: "finance.ledger", additionalAction: "import" },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/balances", resourceKey: "finance.ledger", additionalAction: "revise" },
  { method: "PUT", pathPrefix: "/api/modules/finance/ledger/reclass-rules", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "revise", pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-rules$/ },
  { method: "DELETE", pathPrefix: "/api/modules/finance/ledger/reclass-rules", resourceKey: "finance.ledger", baseAction: "access", additionalAction: "revise", pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-rules\/[^/]+$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/ledger/reclass-results", resourceKey: "finance.ledger", additionalAction: "revise", pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-results$/ },
  { method: "PATCH", pathPrefix: "/api/modules/finance/ledger/reclass-results", resourceKey: "finance.ledger", additionalAction: "revise", pathPattern: /^\/api\/modules\/finance\/ledger\/reclass-results\/[^/]+$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/budget/versions", resourceKey: "finance.budget", additionalAction: "create", pathPattern: /^\/api\/modules\/finance\/budget\/versions$/ },
  { method: "POST", pathPrefix: "/api/modules/production/qc", resourceKey: "production.qc", additionalAction: "submit", pathPattern: /^\/api\/modules\/production\/qc\/[^/]+\/submit$/ },
  { method: "POST", pathPrefix: "/api/modules/production/qc", resourceKey: "production.qc", additionalAction: "approve", pathPattern: /^\/api\/modules\/production\/qc\/[^/]+\/approve-review$/ },
  { method: "DELETE", pathPrefix: "/api/modules/work/tasks/plans", resourceKey: "work.tasks", additionalAction: "archive", pathPattern: /^\/api\/modules\/work\/tasks\/plans\/[^/]+$/ },
  { method: "POST", pathPrefix: "/api/modules/work/projects", resourceKey: "work.projects", additionalAction: "revise", pathPattern: /^\/api\/modules\/work\/projects\/[^/]+\/plan-baselines\/[^/]+\/activate$/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", resourceKey: "work.meetings", baseAction: "write", pathPattern: /^\/api\/modules\/work\/meetings\/[^/]+\/proposals$/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", resourceKey: "work.meetings", additionalAction: "submit", pathPattern: /^\/api\/modules\/work\/meetings\/[^/]+\/votes\/[^/]+\/cast$/ },
  { method: "POST", pathPrefix: "/api/modules/work/meetings", resourceKey: "work.meetings", additionalAction: "approve", pathPattern: /^\/api\/modules\/work\/meetings\/[^/]+\/votes\/[^/]+\/close$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statement-review/reviews", resourceKey: "finance.statementReview", additionalAction: "approve", pathPattern: /^\/api\/modules\/finance\/statement-review\/reviews\/[^/]+\/confirm$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/budget/versions", resourceKey: "finance.budget", additionalAction: "approve", pathPattern: /^\/api\/modules\/finance\/budget\/versions\/[^/]+\/activate$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statement-config/mappings", resourceKey: "finance.statementConfig", baseAction: "access", additionalAction: "create", pathPattern: /^\/api\/modules\/finance\/statement-config\/mappings$/ },
  { method: "PATCH", pathPrefix: "/api/modules/finance/statement-config/mappings", resourceKey: "finance.statementConfig", baseAction: "write", pathPattern: /^\/api\/modules\/finance\/statement-config\/mappings$/ },
  { method: "GET", pathPrefix: "/api/modules/library/basic-info", resourceKey: "library.basicInfo", baseAction: "access", additionalAction: "export", pathPattern: /^\/api\/modules\/library\/basic-info\/(?!(?:categories|directories|documents|generated-sources|scan)(?:\/|$)).+$/ },
  { method: "GET", pathPrefix: "/api/modules/library/basic-info/documents", resourceKey: "library.basicInfo", baseAction: "access", additionalAction: "export", pathPattern: /^\/api\/modules\/library\/basic-info\/documents\/[^/]+\/download$/ },
  { method: "DELETE", pathPrefix: "/api/modules/library/basic-info/documents", resourceKey: "library.basicInfo", baseAction: "access", additionalAction: "archive", pathPattern: /^\/api\/modules\/library\/basic-info\/documents\/[^/]+$/ },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/scan", resourceKey: "library.basicInfo", baseAction: "access", additionalAction: "import" },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/generated-sources", resourceKey: "library.basicInfo", baseAction: "access", additionalAction: "import", pathPattern: /^\/api\/modules\/library\/basic-info\/generated-sources\/[^/]+\/generate$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/cost/imports", resourceKey: "finance.cost", baseAction: "access", additionalAction: "import", pathPattern: /^\/api\/modules\/finance\/cost\/imports$/ },
  { method: "POST", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", additionalAction: "create" },
  { method: "PUT", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", baseAction: "write" },
  { method: "POST", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", additionalAction: "revise", pathPattern: /^\/api\/settings\/api\/open\/clients\/[^/]+\/secret$/ },
  { method: "PUT", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", baseAction: "write", pathPattern: /^\/api\/settings\/api\/open\/clients\/[^/]+\/scopes$/ },
  { method: "POST", pathPrefix: "/api/settings/account/api-key", resourceKey: "settings.account.apiAccess", additionalAction: "revise" },
  { method: "POST", pathPrefix: "/api/agent", resourceKey: "agent", additionalAction: "submit" },
  { method: "GET", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", baseAction: "access" },
  { method: "POST", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", baseAction: "admin" },
  { method: "PUT", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", baseAction: "admin" },
  { method: "PATCH", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", baseAction: "admin" },
  { method: "DELETE", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", baseAction: "admin" },
  { method: "POST", pathPrefix: "/api/settings/account", resourceKey: "settings.account", baseAction: "write" },
  { method: "PUT", pathPrefix: "/api/settings/account", resourceKey: "settings.account", baseAction: "write" },
  { method: "PATCH", pathPrefix: "/api/settings/account", resourceKey: "settings.account", baseAction: "write" },
  { method: "DELETE", pathPrefix: "/api/settings/account", resourceKey: "settings.account", baseAction: "write" },
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
