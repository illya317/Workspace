import type {
  ApiGuardRegistration,
  ApiRouteAccessMode,
  ApiRouteRegistration,
  WorkspacePackageRegistration,
} from "@workspace/core";

import { effectiveModuleDefinitions, isApiGuardEnabled } from "./effective-module-registry";
import { defaultApiActionForMethod } from "./module-registry-utils";
import { resolvePermissionApiActionPolicy, assertPermissionApiActionPolicySupported } from "./permission-api-action-policy";
import type { PermissionActionKey } from "./permission-actions";

export type ApiMethod = ApiGuardRegistration["method"];
export type ApiAction = ApiGuardRegistration["action"];
export type ApiContractSource = "module-registry.apiGuards" | "module-registry.apiRoutes";
export type { ApiRouteAccessMode };

export interface ApiContract {
  key: string;
  method: ApiMethod;
  pathPrefix: string;
  access: ApiRouteAccessMode;
  resourceKey: string | null;
  action: ApiAction | null;
  additionalAction: PermissionActionKey | null;
  ownerPackage: string;
  ownerLayer: WorkspacePackageRegistration["layer"];
  ownerModuleKey: string | null;
  ownerResourceKey: string | null;
  source: ApiContractSource;
}

const API_METHODS = new Set<ApiMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function normalizeOwnerKey(definition: WorkspacePackageRegistration) {
  return (definition.moduleDef?.key ?? definition.packageName)
    .replace(/^@workspace\//, "")
    .replace(/[^a-zA-Z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function createApiContractKey(
  definition: WorkspacePackageRegistration,
  route: Pick<ApiRouteRegistration, "method" | "pathPrefix" | "access" | "resourceKey" | "action">,
) {
  const owner = normalizeOwnerKey(definition);
  const pathKey = route.pathPrefix
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return [
    owner,
    route.method.toLowerCase(),
    pathKey,
    route.access,
    route.action ?? "none",
    route.resourceKey ?? "none",
  ].join(".");
}

function normalizePathPrefix(pathPrefix: string) {
  if (!pathPrefix.startsWith("/api/") && pathPrefix !== "/api") {
    throw new Error(`API contract pathPrefix must start with /api: ${pathPrefix}`);
  }
  return pathPrefix.length > 1 ? pathPrefix.replace(/\/+$/g, "") : pathPrefix;
}

function buildApiContracts(
  definitions: readonly WorkspacePackageRegistration[],
): ApiContract[] {
  const contracts: ApiContract[] = [];

  for (const definition of definitions) {
    for (const guard of definition.apiGuards ?? []) {
      if (!API_METHODS.has(guard.method)) {
        throw new Error(`Invalid API contract method: ${guard.method}`);
      }

      const actionPolicy = resolvePermissionApiActionPolicy({
        method: guard.method,
        apiPath: normalizePathPrefix(guard.pathPrefix),
        resourceKey: guard.resourceKey,
        defaultBaseAction: guard.action,
      });

      contracts.push({
        key: createApiContractKey(definition, { ...guard, access: isApiGuardEnabled(guard) ? "protected" : "disabled" }),
        method: guard.method,
        pathPrefix: normalizePathPrefix(guard.pathPrefix),
        access: isApiGuardEnabled(guard) ? "protected" : "disabled",
        resourceKey: guard.resourceKey,
        action: actionPolicy.baseAction,
        additionalAction: actionPolicy.additionalAction,
        ownerPackage: definition.packageName,
        ownerLayer: definition.layer,
        ownerModuleKey: definition.moduleDef?.key ?? null,
        ownerResourceKey: definition.moduleDef?.resourceKey ?? null,
        source: "module-registry.apiGuards",
      });
    }

    for (const route of definition.apiRoutes ?? []) {
      if (!API_METHODS.has(route.method)) {
        throw new Error(`Invalid API contract method: ${route.method}`);
      }

      if (!route.resourceKey && route.action) {
        throw new Error(`API route contract cannot set action without resourceKey: ${route.method} ${route.pathPrefix}`);
      }
      const defaultAction = route.action ?? (route.resourceKey ? defaultApiActionForMethod(route.method) : null);
      const actionPolicy = resolvePermissionApiActionPolicy({
        method: route.method,
        apiPath: normalizePathPrefix(route.pathPrefix),
        resourceKey: route.resourceKey ?? null,
        defaultBaseAction: defaultAction,
      });

      contracts.push({
        key: createApiContractKey(definition, { ...route, action: actionPolicy.baseAction ?? undefined }),
        method: route.method,
        pathPrefix: normalizePathPrefix(route.pathPrefix),
        access: route.access,
        resourceKey: route.resourceKey ?? null,
        action: actionPolicy.baseAction,
        additionalAction: actionPolicy.additionalAction,
        ownerPackage: definition.packageName,
        ownerLayer: definition.layer,
        ownerModuleKey: definition.moduleDef?.key ?? null,
        ownerResourceKey: definition.moduleDef?.resourceKey ?? null,
        source: "module-registry.apiRoutes",
      });
    }
  }

  return contracts.sort((left, right) => left.key.localeCompare(right.key));
}

function validateApiContracts(contracts: readonly ApiContract[]) {
  const seenKeys = new Set<string>();
  const seenRouteOwners = new Map<string, ApiContract>();
  for (const contract of contracts) {
    if (seenKeys.has(contract.key)) {
      throw new Error(`Duplicate API contract key: ${contract.key}`);
    }
    seenKeys.add(contract.key);

    const routeOwnerKey = `${contract.method} ${contract.pathPrefix}`;
    const existing = seenRouteOwners.get(routeOwnerKey);
    if (existing) {
      throw new Error(
        `Duplicate API contract route owner: ${routeOwnerKey} is registered by ${existing.ownerPackage} and ${contract.ownerPackage}`,
      );
    }
    seenRouteOwners.set(routeOwnerKey, contract);

    assertPermissionApiActionPolicySupported({
      method: contract.method,
      apiPath: contract.pathPrefix,
      resourceKey: contract.resourceKey,
    });
  }
}

function pathMatchesPrefix(apiPath: string, pathPrefix: string) {
  return apiPath === pathPrefix || apiPath.startsWith(`${pathPrefix}/`);
}

export const apiContracts = buildApiContracts(effectiveModuleDefinitions);

validateApiContracts(apiContracts);

export function getApiContracts() {
  return apiContracts;
}

export function findApiContract(method: ApiMethod, apiPath: string) {
  const normalizedPath = apiPath.replace(/\/+$/g, "") || "/";
  const contract = apiContracts
    .filter((contract) => contract.method === method)
    .filter((contract) => pathMatchesPrefix(normalizedPath, contract.pathPrefix))
    .sort((left, right) => right.pathPrefix.length - left.pathPrefix.length)[0] ?? null;
  if (!contract) return null;
  const actionPolicy = resolvePermissionApiActionPolicy({
    method,
    apiPath: normalizedPath,
    resourceKey: contract.resourceKey,
    defaultBaseAction: contract.action,
  });
  return {
    ...contract,
    action: actionPolicy.baseAction,
    additionalAction: actionPolicy.additionalAction,
  };
}

export function assertApiContractRegistered(method: ApiMethod, apiPath: string) {
  const contract = findApiContract(method, apiPath);
  if (!contract) {
    throw new Error(`API contract not registered: ${method} ${apiPath}`);
  }
  return contract;
}
