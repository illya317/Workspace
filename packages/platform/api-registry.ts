import type { ApiGuardRegistration, WorkspacePackageRegistration } from "@workspace/core";

import { registeredModuleDefinitions } from "./module-registry";

export type ApiMethod = ApiGuardRegistration["method"];
export type ApiAction = ApiGuardRegistration["action"];
export type ApiContractSource = "module-registry";

export interface ApiContract {
  key: string;
  method: ApiMethod;
  pathPrefix: string;
  resourceKey: string;
  action: ApiAction;
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
  guard: ApiGuardRegistration,
) {
  const owner = normalizeOwnerKey(definition);
  const pathKey = guard.pathPrefix
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${owner}.${guard.method.toLowerCase()}.${pathKey}.${guard.action}.${guard.resourceKey}`;
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

      contracts.push({
        key: createApiContractKey(definition, guard),
        method: guard.method,
        pathPrefix: normalizePathPrefix(guard.pathPrefix),
        resourceKey: guard.resourceKey,
        action: guard.action,
        ownerPackage: definition.packageName,
        ownerLayer: definition.layer,
        ownerModuleKey: definition.moduleDef?.key ?? null,
        ownerResourceKey: definition.moduleDef?.resourceKey ?? null,
        source: "module-registry",
      });
    }
  }

  return contracts.sort((left, right) => left.key.localeCompare(right.key));
}

function validateApiContracts(contracts: readonly ApiContract[]) {
  const seenKeys = new Set<string>();
  for (const contract of contracts) {
    if (seenKeys.has(contract.key)) {
      throw new Error(`Duplicate API contract key: ${contract.key}`);
    }
    seenKeys.add(contract.key);
  }
}

function pathMatchesPrefix(apiPath: string, pathPrefix: string) {
  return apiPath === pathPrefix || apiPath.startsWith(`${pathPrefix}/`);
}

export const apiContracts = buildApiContracts(registeredModuleDefinitions);

validateApiContracts(apiContracts);

export function getApiContracts() {
  return apiContracts;
}

export function findApiContract(method: ApiMethod, apiPath: string) {
  const normalizedPath = apiPath.replace(/\/+$/g, "") || "/";
  return apiContracts
    .filter((contract) => contract.method === method)
    .filter((contract) => pathMatchesPrefix(normalizedPath, contract.pathPrefix))
    .sort((left, right) => right.pathPrefix.length - left.pathPrefix.length)[0] ?? null;
}

export function assertApiContractRegistered(method: ApiMethod, apiPath: string) {
  const contract = findApiContract(method, apiPath);
  if (!contract) {
    throw new Error(`API contract not registered: ${method} ${apiPath}`);
  }
  return contract;
}
