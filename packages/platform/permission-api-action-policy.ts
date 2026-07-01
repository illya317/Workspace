import type { ApiGuardRegistration } from "@workspace/core";
import type { PermissionActionKey } from "./permission-actions";
import { isPermissionActionSupported } from "./permission-resource-policy";

type ApiMethod = ApiGuardRegistration["method"];

export interface PermissionApiActionPolicy {
  method: ApiMethod;
  pathPrefix: string;
  resourceKey: string;
  action: PermissionActionKey;
  pathPattern?: RegExp;
  notes?: string;
}

interface ResolvePermissionApiActionInput {
  method: ApiMethod;
  apiPath: string;
  resourceKey: string | null;
  legacyAction: ApiGuardRegistration["action"] | null;
}

const DEFAULT_API_ACTION_BY_METHOD = {
  GET: "access",
  POST: "create",
  PUT: "write",
  PATCH: "write",
  DELETE: "delete",
} satisfies Record<ApiMethod, PermissionActionKey>;

export const PERMISSION_API_ACTION_POLICIES = [
  { method: "POST", pathPrefix: "/api/modules/finance/import/preview", resourceKey: "finance.import", action: "access" },
  { method: "POST", pathPrefix: "/api/modules/finance/import/confirm", resourceKey: "finance.import", action: "import" },
  { method: "POST", pathPrefix: "/api/modules/finance/import", resourceKey: "finance.import", action: "import" },
  { method: "GET", pathPrefix: "/api/modules/hr/roster/generated/export", resourceKey: "hr.roster.generated", action: "export" },
  { method: "POST", pathPrefix: "/api/modules/hr/roster/audit-log/restore", resourceKey: "hr.roster", action: "revise" },
  { method: "POST", pathPrefix: "/api/modules/production/qc", resourceKey: "production.qc", action: "submit", pathPattern: /^\/api\/modules\/production\/qc\/[^/]+\/submit$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/statement-review/reviews", resourceKey: "finance.statementReview", action: "approve", pathPattern: /^\/api\/modules\/finance\/statement-review\/reviews\/[^/]+\/confirm$/ },
  { method: "POST", pathPrefix: "/api/modules/finance/budget/versions", resourceKey: "finance.budget", action: "approve", pathPattern: /^\/api\/modules\/finance\/budget\/versions\/[^/]+\/activate$/ },
  { method: "GET", pathPrefix: "/api/modules/library/basic-info/documents", resourceKey: "library.basicInfo", action: "export", pathPattern: /^\/api\/modules\/library\/basic-info\/documents\/[^/]+\/download$/ },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/scan", resourceKey: "library.basicInfo", action: "import" },
  { method: "POST", pathPrefix: "/api/modules/library/basic-info/generated-sources", resourceKey: "library.basicInfo", action: "import", pathPattern: /^\/api\/modules\/library\/basic-info\/generated-sources\/[^/]+\/generate$/ },
  { method: "POST", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", action: "create" },
  { method: "PUT", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", action: "write" },
  { method: "POST", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", action: "revise", pathPattern: /^\/api\/settings\/api\/open\/clients\/[^/]+\/secret$/ },
  { method: "PUT", pathPrefix: "/api/settings/api/open/clients", resourceKey: "settings.api.manage", action: "write", pathPattern: /^\/api\/settings\/api\/open\/clients\/[^/]+\/scopes$/ },
  { method: "POST", pathPrefix: "/api/settings/account/api-key", resourceKey: "settings.account.apiAccess", action: "revise" },
  { method: "POST", pathPrefix: "/api/agent", resourceKey: "agent", action: "submit" },
  { method: "GET", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", action: "access" },
  { method: "POST", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", action: "admin" },
  { method: "PUT", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", action: "admin" },
  { method: "PATCH", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", action: "admin" },
  { method: "DELETE", pathPrefix: "/api/settings/admin", resourceKey: "settings.admin", action: "admin" },
  { method: "POST", pathPrefix: "/api/settings/account", resourceKey: "settings.account", action: "write" },
  { method: "PUT", pathPrefix: "/api/settings/account", resourceKey: "settings.account", action: "write" },
  { method: "PATCH", pathPrefix: "/api/settings/account", resourceKey: "settings.account", action: "write" },
  { method: "DELETE", pathPrefix: "/api/settings/account", resourceKey: "settings.account", action: "write" },
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

function legacyActionToPermissionAction(action: ApiGuardRegistration["action"] | null): PermissionActionKey | null {
  if (!action) return null;
  return action;
}

export function defaultPermissionApiActionForMethod(method: ApiMethod) {
  return DEFAULT_API_ACTION_BY_METHOD[method];
}

export function resolvePermissionApiAction(input: ResolvePermissionApiActionInput): PermissionActionKey | null {
  if (!input.resourceKey) return null;
  const normalizedInput = { ...input, apiPath: normalizeApiPath(input.apiPath) };
  const matched = PERMISSION_API_ACTION_POLICY_LIST
    .filter((policy) => policyMatches(policy, normalizedInput))
    .sort((left, right) => {
      const patternDelta = Number(Boolean(right.pathPattern)) - Number(Boolean(left.pathPattern));
      if (patternDelta !== 0) return patternDelta;
      return right.pathPrefix.length - left.pathPrefix.length;
    })[0];
  const candidate = matched?.action ?? defaultPermissionApiActionForMethod(input.method);
  if (isPermissionActionSupported(input.resourceKey, candidate)) return candidate;
  const legacyCandidate = legacyActionToPermissionAction(input.legacyAction);
  return legacyCandidate && isPermissionActionSupported(input.resourceKey, legacyCandidate)
    ? legacyCandidate
    : null;
}

export function assertPermissionApiActionSupported(input: ResolvePermissionApiActionInput) {
  const action = resolvePermissionApiAction(input);
  if (input.resourceKey && !action) {
    throw new Error(`API permission action not supported: ${input.method} ${input.apiPath} -> ${input.resourceKey}`);
  }
  return action;
}
