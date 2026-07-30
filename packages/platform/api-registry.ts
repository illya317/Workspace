import type {
  ApiRouteAccessMode,
  ApiRouteRegistration,
  WorkspacePackageRegistration,
} from "@workspace/core/module-contract";

import { effectiveModuleDefinitions, isApiGuardEnabled } from "./effective-module-registry";
import { resolvePermissionApiActionPolicy, assertPermissionApiActionPolicySupported } from "./permission-api-action-policy";
import {
  deriveApiResourcePrefixes,
  resolveApiResourceForPath,
} from "./module-registry-utils";
import type { PermissionRegistryActionKey } from "./action-registry";
import type { ApiMethod } from "./api-contract-types";

export type { ApiMethod } from "./api-contract-types";
export type ApiContractSource = "module-registry.apiGuards" | "module-registry.apiRoutes";
export type ApiContractKind = "business" | "session" | "public" | "dev" | "internal";
export type { ApiRouteAccessMode };

export interface ApiContractAuthorization {
  resourceKey: string | null;
  requiredActions: readonly PermissionRegistryActionKey[];
  runtimeEnforcement: "gateway" | "serviceDelegated";
  scopeId: string | null;
  projection: "default" | "space";
  notes: string | null;
}

export interface ApiContract {
  key: string;
  method: ApiMethod;
  pathPrefix: string;
  apiKind: ApiContractKind;
  access: ApiRouteAccessMode;
  resourceKey: string | null;
  requiredActions: readonly PermissionRegistryActionKey[];
  runtimeEnforcement: "gateway" | "serviceDelegated";
  authorization: ApiContractAuthorization;
  ownerPackage: string;
  ownerLayer: WorkspacePackageRegistration["layer"];
  ownerModuleKey: string | null;
  ownerResourceKey: string | null;
  source: ApiContractSource;
  migrationNote: string | null;
  notes: string | null;
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
  route: Pick<ApiRouteRegistration, "method" | "pathPrefix" | "access"> & { resourceKey?: string | null },
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
    route.resourceKey ?? "none",
  ].join(".");
}

function normalizePathPrefix(pathPrefix: string) {
  if (!pathPrefix.startsWith("/api/") && pathPrefix !== "/api") {
    throw new Error(`API contract pathPrefix must start with /api: ${pathPrefix}`);
  }
  return pathPrefix.length > 1 ? pathPrefix.replace(/\/+$/g, "") : pathPrefix;
}

function deriveApiContractKind(input: { access: ApiRouteAccessMode; resourceKey?: string | null }): ApiContractKind {
  if (input.access === "public") return "public";
  if (input.access === "dev") return "dev";
  if (input.access === "internal") return "internal";
  return input.resourceKey ? "business" : "session";
}

function buildApiContracts(
  definitions: readonly WorkspacePackageRegistration[],
): ApiContract[] {
  const contracts: ApiContract[] = [];
  const apiResourcePrefixes = deriveApiResourcePrefixes(definitions);

  for (const definition of definitions) {
    for (const guard of definition.apiGuards ?? []) {
      if (!API_METHODS.has(guard.method)) {
        throw new Error(`Invalid API contract method: ${guard.method}`);
      }

      const resourceKey = resolveApiResourceForPath(apiResourcePrefixes, guard.pathPrefix)?.resourceKey ?? null;
      if (!resourceKey) {
        throw new Error(`API guard URL must resolve resourceKey: ${guard.method} ${guard.pathPrefix}`);
      }
      const actionPolicy = resolvePermissionApiActionPolicy({
        method: guard.method,
        apiPath: normalizePathPrefix(guard.pathPrefix),
        resourceKey,
      });

      const access = isApiGuardEnabled(guard, resourceKey) ? "protected" : "disabled";
      contracts.push({
        key: createApiContractKey(definition, { ...guard, access, resourceKey }),
        method: guard.method,
        pathPrefix: normalizePathPrefix(guard.pathPrefix),
        apiKind: deriveApiContractKind({ access, resourceKey }),
        access,
        resourceKey,
        requiredActions: actionPolicy.requiredActions,
        runtimeEnforcement: actionPolicy.runtimeEnforcement,
        authorization: actionPolicy,
        ownerPackage: definition.packageName,
        ownerLayer: definition.layer,
        ownerModuleKey: definition.moduleDef?.key ?? null,
        ownerResourceKey: definition.moduleDef?.resourceKey ?? null,
        source: "module-registry.apiGuards",
        migrationNote: guard.migrationNote ?? null,
        notes: guard.notes ?? actionPolicy.notes ?? null,
      });
    }

    for (const route of definition.apiRoutes ?? []) {
      if (!API_METHODS.has(route.method)) {
        throw new Error(`Invalid API contract method: ${route.method}`);
      }

      const resourceKey = route.access === "protected"
        ? resolveApiResourceForPath(apiResourcePrefixes, route.pathPrefix)?.resourceKey ?? null
        : null;
      const actionPolicy = resolvePermissionApiActionPolicy({
        method: route.method,
        apiPath: normalizePathPrefix(route.pathPrefix),
        resourceKey,
      });

      const routeForKey = { ...route, resourceKey };
      contracts.push({
        key: createApiContractKey(definition, routeForKey),
        method: route.method,
        pathPrefix: normalizePathPrefix(route.pathPrefix),
        apiKind: deriveApiContractKind({ access: route.access, resourceKey }),
        access: route.access,
        resourceKey,
        requiredActions: actionPolicy.requiredActions,
        runtimeEnforcement: actionPolicy.runtimeEnforcement,
        authorization: actionPolicy,
        ownerPackage: definition.packageName,
        ownerLayer: definition.layer,
        ownerModuleKey: definition.moduleDef?.key ?? null,
        ownerResourceKey: definition.moduleDef?.resourceKey ?? null,
        source: "module-registry.apiRoutes",
        migrationNote: route.migrationNote ?? null,
        notes: route.notes ?? actionPolicy.notes ?? null,
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

    if (contract.apiKind === "business") {
      if (!contract.resourceKey) {
        throw new Error(`Business API contract must declare resourceKey: ${routeOwnerKey}`);
      }
      if (contract.requiredActions.length === 0) {
        throw new Error(`Business API contract must declare requiredActions: ${routeOwnerKey}`);
      }
      if (!["protected", "disabled"].includes(contract.access)) {
        throw new Error(`Business API contract must be protected or disabled: ${routeOwnerKey}`);
      }
    } else {
      if (contract.resourceKey || contract.requiredActions.length > 0 || contract.runtimeEnforcement !== "gateway") {
        throw new Error(`Non-business API contract cannot declare resource/requiredActions: ${routeOwnerKey}`);
      }
      if (!contract.notes) {
        throw new Error(`Non-business API contract must explain why it has no resource/action: ${routeOwnerKey}`);
      }
    }

    if (contract.apiKind === "session" && !["protected", "disabled"].includes(contract.access)) {
      throw new Error(`Session API contract must be protected or disabled: ${routeOwnerKey}`);
    }

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

export function findApiContract(method: ApiMethod, apiPath: string, searchParams?: URLSearchParams) {
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
    searchParams,
  });
  return {
    ...contract,
    requiredActions: actionPolicy.requiredActions,
    runtimeEnforcement: actionPolicy.runtimeEnforcement,
    authorization: actionPolicy,
    notes: actionPolicy.notes ?? contract.notes,
  };
}

export function assertApiContractRegistered(method: ApiMethod, apiPath: string) {
  const contract = findApiContract(method, apiPath);
  if (!contract) {
    throw new Error(`API contract not registered: ${method} ${apiPath}`);
  }
  return contract;
}
