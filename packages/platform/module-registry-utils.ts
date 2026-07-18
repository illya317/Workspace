import type {
  ApiGuardRegistration,
  ApiRouteAccessMode,
  ApiRouteRegistration,
  PageRouteRegistration,
  ResourceRegistration,
  WorkspacePackageRegistration,
} from "@workspace/core";
import { deriveSpaceResourceDefsFromRegistrations } from "./space-resource-model";

export function apiResourceGuards(
  pathPrefix: string,
  methods: ApiGuardRegistration["method"][] = ["GET", "POST", "PUT", "PATCH", "DELETE"],
  options: Pick<ApiGuardRegistration, "migrationNote" | "notes"> = {},
): ApiGuardRegistration[] {
  return methods.map((method) => ({
    method,
    pathPrefix,
    ...options,
  }));
}

export function apiRoutes(
  pathPrefix: string,
  access: ApiRouteAccessMode,
  methods: ApiRouteRegistration["method"][] = ["GET", "POST", "PUT", "PATCH", "DELETE"],
): ApiRouteRegistration[] {
  return methods.map((method) => ({
    method,
    pathPrefix,
    access,
  }));
}

export function systemApiRoutes(): ApiRouteRegistration[] {
  return [
    { method: "POST", pathPrefix: "/api/auth/dev-login", access: "dev", notes: "Development-only login helper; no business resource is read or mutated." },
    { method: "DELETE", pathPrefix: "/api/auth/dev-login", access: "dev", notes: "Development-only login session cleanup; no business resource is read or mutated." },
    { method: "GET", pathPrefix: "/api/auth/gateway-check", access: "protected", notes: "Session gateway check; verifies login state without reading business resources." },
    { method: "GET", pathPrefix: "/api/auth/me", access: "protected", notes: "Current-session identity snapshot; business resources are exposed through derived session claims." },
    { method: "GET", pathPrefix: "/api/auth/wecom", access: "public", notes: "WeCom desktop OAuth and mobile handoff callbacks; must be reachable before a local session exists." },
    { method: "POST", pathPrefix: "/api/auth/wecom", access: "public", notes: "Same-origin mobile browser creates and consumes a short-lived WeCom login handoff before a local session exists." },
    { method: "POST", pathPrefix: "/api/integrations/wecom/agent", access: "public", notes: "HMAC-authenticated localhost bridge from the WeCom intelligent-robot worker; sender RBAC is enforced by Platform." },
    { method: "GET", pathPrefix: "/api/integrations/wecom/agent/artifacts", access: "internal", notes: "HMAC-authenticated artifact stream for the WeCom worker; signed claims and Library permissions are rechecked." },
    { method: "POST", pathPrefix: "/api/integrations/wecom/agent/artifacts/cleanup", access: "internal", notes: "HMAC-authenticated maintenance call removes expired generated packages while retaining their audit rows." },
    { method: "GET", pathPrefix: "/api/integrations/wecom/download", access: "public", notes: "Short-lived user-bound artifact link; requires a matching Workspace or WeCom-authenticated session before download." },
    { method: "GET", pathPrefix: "/api/integrations/onlyoffice/library-documents", access: "internal", notes: "Short-lived JWT binds DocumentServer reads to one immutable Library document version and checksum; no browser session is accepted." },
    { method: "GET", pathPrefix: "/api/auth/dev-login-bypass", access: "dev", notes: "Development-only bypass helper; unavailable as a production business capability." },
    { method: "GET", pathPrefix: "/api/settings/account/week-info", access: "public", notes: "Calendar week metadata endpoint; returns no user or business-resource data." },
  ];
}

export interface ApiResourcePrefixRegistration {
  pathPrefix: string;
  resourceKey: string;
  ownerPackage: string;
  source: "canonicalResourcePath" | "moduleDef.apiPrefixes" | "moduleDef.children.apiPrefixes" | "resourceDefs.apiPrefixes";
}

export interface ApiResourceResolution extends ApiResourcePrefixRegistration {
  isCanonical: boolean;
}

function normalizeApiPath(pathPrefix: string) {
  return pathPrefix.length > 1 ? pathPrefix.replace(/\/+$/g, "") : pathPrefix;
}

function pathMatchesPrefix(apiPath: string, pathPrefix: string) {
  return apiPath === pathPrefix || apiPath.startsWith(`${pathPrefix}/`);
}

function pushApiResourcePrefixes(
  output: ApiResourcePrefixRegistration[],
  definition: WorkspacePackageRegistration,
  resourceKey: string | null | undefined,
  apiPrefixes: readonly string[] | undefined,
  source: ApiResourcePrefixRegistration["source"],
) {
  if (!resourceKey || !apiPrefixes?.length) return;
  for (const pathPrefix of apiPrefixes) {
    output.push({
      pathPrefix: normalizeApiPath(pathPrefix),
      resourceKey,
      ownerPackage: definition.packageName,
      source,
    });
  }
}

function resourceKeyToApiSegments(resourceKey: string) {
  return resourceKey
    .split(".")
    .map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase());
}

function pushCanonicalResourcePrefix(
  output: ApiResourcePrefixRegistration[],
  definition: WorkspacePackageRegistration,
  resourceKey: string | null | undefined,
) {
  if (!resourceKey) return;
  const segments = resourceKeyToApiSegments(resourceKey);
  output.push({
    pathPrefix: `/api/modules/${segments.join("/")}`,
    resourceKey,
    ownerPackage: definition.packageName,
    source: "canonicalResourcePath",
  });
}

export function deriveApiResourcePrefixes(
  definitions: readonly WorkspacePackageRegistration[],
): ApiResourcePrefixRegistration[] {
  const prefixes: ApiResourcePrefixRegistration[] = [];

  for (const definition of definitions) {
    const moduleDef = definition.moduleDef;
    pushCanonicalResourcePrefix(prefixes, definition, moduleDef?.resourceKey);
    pushApiResourcePrefixes(prefixes, definition, moduleDef?.resourceKey, moduleDef?.apiPrefixes, "moduleDef.apiPrefixes");
    for (const child of moduleDef?.children ?? []) {
      pushCanonicalResourcePrefix(prefixes, definition, child.resourceKey);
      pushApiResourcePrefixes(prefixes, definition, child.resourceKey, child.apiPrefixes, "moduleDef.children.apiPrefixes");
    }
    for (const resource of definition.resourceDefs ?? []) {
      pushCanonicalResourcePrefix(prefixes, definition, resource.key);
      pushApiResourcePrefixes(prefixes, definition, resource.key, resource.apiPrefixes, "resourceDefs.apiPrefixes");
    }
  }

  return prefixes.sort((left, right) => {
    const lengthDelta = right.pathPrefix.length - left.pathPrefix.length;
    if (lengthDelta !== 0) return lengthDelta;
    const canonicalDelta = Number(right.source === "canonicalResourcePath") - Number(left.source === "canonicalResourcePath");
    if (canonicalDelta !== 0) return canonicalDelta;
    return left.resourceKey.localeCompare(right.resourceKey);
  });
}

export function resolveApiResourceForPath(
  prefixes: readonly ApiResourcePrefixRegistration[],
  apiPath: string,
): ApiResourceResolution | null {
  const normalizedPath = normalizeApiPath(apiPath);
  const match = prefixes.find((prefix) => pathMatchesPrefix(normalizedPath, prefix.pathPrefix));
  return match ? { ...match, isCanonical: match.source === "canonicalResourcePath" } : null;
}

export function resolveApiResourceKeyForPath(
  prefixes: readonly ApiResourcePrefixRegistration[],
  apiPath: string,
) {
  return resolveApiResourceForPath(prefixes, apiPath)?.resourceKey ?? null;
}

function sortOrderAt(index: number) {
  return index;
}

function pageRoutePath(route: string | PageRouteRegistration) {
  return typeof route === "string" ? route : route.path;
}

export function deriveWorkspaceResourceDefs(definitions: WorkspacePackageRegistration[]): ResourceRegistration[] {
  const derived: ResourceRegistration[] = [];
  const explicit: ResourceRegistration[] = [];

  for (const definition of definitions) {
    const moduleDef = definition.moduleDef;
    if (moduleDef?.resourceKey) {
      derived.push({
        key: moduleDef.resourceKey,
        name: moduleDef.label,
        hidden: moduleDef.resourceHidden,
        sortOrder: moduleDef.resourceSortOrder,
      });
      moduleDef.children?.forEach((child, index) => {
        derived.push({
          key: child.resourceKey,
          name: child.label,
          parentKey: moduleDef.resourceKey,
          hidden: child.resourceHidden,
          sortOrder: child.resourceSortOrder ?? sortOrderAt(index),
        });
      });
    }
    explicit.push(...(definition.resourceDefs ?? []));
  }

  return [...derived, ...explicit, ...deriveSpaceResourceDefsFromRegistrations(definitions)];
}

export function validateModuleRegistry(definitions: WorkspacePackageRegistration[], moduleKeys: string[]) {
  const seenPackages = new Set<string>();
  const seenModuleKeys = new Set<string>();
  const seenRoutes = new Map<string, string>();
  const apiResourcePrefixes = deriveApiResourcePrefixes(definitions);
  const seenApiPrefixes = new Map<string, ApiResourcePrefixRegistration>();

  for (const prefix of apiResourcePrefixes) {
    const existing = seenApiPrefixes.get(prefix.pathPrefix);
    if (existing && existing.resourceKey !== prefix.resourceKey) {
      throw new Error(
        `API resource prefix conflict: ${prefix.pathPrefix} maps to both ${existing.resourceKey} and ${prefix.resourceKey}`,
      );
    }
    seenApiPrefixes.set(prefix.pathPrefix, prefix);
  }

  for (const definition of definitions) {
    if (seenPackages.has(definition.packageName)) throw new Error(`DUPLICATE MODULE PACKAGE: ${definition.packageName}`);
    seenPackages.add(definition.packageName);

    for (const route of definition.routes ?? []) {
      const routePath = pageRoutePath(route);
      const existingPackage = seenRoutes.get(routePath);
      if (existingPackage) throw new Error(`DUPLICATE MODULE ROUTE: ${routePath} is registered by ${existingPackage} and ${definition.packageName}`);
      seenRoutes.set(routePath, definition.packageName);
    }
  }

  for (const moduleKey of moduleKeys) {
    if (seenModuleKeys.has(moduleKey)) throw new Error(`DUPLICATE MODULE KEY: ${moduleKey}`);
    seenModuleKeys.add(moduleKey);
  }

  for (const definition of definitions) {
    const moduleKey = definition.moduleDef?.key;
    if (moduleKey && !moduleKeys.includes(moduleKey)) throw new Error(`MODULE NOT REGISTERED: ${moduleKey}`);
  }

  for (const definition of definitions) {
    for (const guard of definition.apiGuards ?? []) {
      if (guard.resourceKey) {
        throw new Error(
          `API guard must derive resourceKey from URL apiPrefixes; remove explicit resourceKey from ${guard.method} ${guard.pathPrefix}`,
        );
      }
      const resolution = resolveApiResourceForPath(apiResourcePrefixes, guard.pathPrefix);
      if (!resolution) {
        throw new Error(
          `API guard URL must resolve a resourceKey from registered apiPrefixes: ${guard.method} ${guard.pathPrefix}`,
        );
      }
      if (!resolution.isCanonical && !guard.migrationNote) {
        throw new Error(
          `此路径无法从 URL 推导 resource，必须声明 migration note: ${guard.method} ${guard.pathPrefix} -> ${resolution.resourceKey}`,
        );
      }
    }

    for (const route of definition.apiRoutes ?? []) {
      if (route.resourceKey) {
        throw new Error(
          `API route must derive resourceKey from URL apiPrefixes; remove explicit resourceKey from ${route.method} ${route.pathPrefix}`,
        );
      }
      if (route.access !== "protected") continue;
      const resolution = resolveApiResourceForPath(apiResourcePrefixes, route.pathPrefix);
      if (resolution) {
        if (!resolution.isCanonical && !route.migrationNote) {
          throw new Error(
            `此路径无法从 URL 推导 resource，必须声明 migration note: ${route.method} ${route.pathPrefix} -> ${resolution.resourceKey}`,
          );
        }
        continue;
      }
      if (!route.notes) {
        throw new Error(
          `Protected session API must explain why it has no URL-derived resource: ${route.method} ${route.pathPrefix}`,
        );
      }
    }
  }
}
