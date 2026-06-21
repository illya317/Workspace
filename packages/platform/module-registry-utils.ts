import type {
  ApiGuardRegistration,
  ApiRouteAccessMode,
  ApiRouteRegistration,
  ResourceRegistration,
  WorkspacePackageRegistration,
} from "@workspace/core";

const API_ACTION_BY_METHOD = {
  GET: "access",
  POST: "write",
  PUT: "write",
  PATCH: "write",
  DELETE: "delete",
} satisfies Record<ApiGuardRegistration["method"], ApiGuardRegistration["action"]>;

export function apiResourceGuards(
  pathPrefix: string,
  resourceKey: string,
  methods: ApiGuardRegistration["method"][] = ["GET", "POST", "PUT", "PATCH", "DELETE"],
): ApiGuardRegistration[] {
  return methods.map((method) => ({
    method,
    pathPrefix,
    resourceKey,
    action: API_ACTION_BY_METHOD[method],
  }));
}

export function apiRoutes(
  pathPrefix: string,
  access: ApiRouteAccessMode,
  methods: ApiRouteRegistration["method"][] = ["GET", "POST", "PUT", "PATCH", "DELETE"],
  resource?: Pick<ApiRouteRegistration, "resourceKey" | "action">,
): ApiRouteRegistration[] {
  return methods.map((method) => ({
    method,
    pathPrefix,
    access,
    ...resource,
  }));
}

export function systemApiRoutes(): ApiRouteRegistration[] {
  return [
    ...apiRoutes("/api/settings/account", "protected", ["GET", "POST", "PUT", "PATCH", "DELETE"]),
    ...apiRoutes("/api/settings/account/password", "protected", ["POST"]),
    ...apiRoutes("/api/auth/dev-login", "dev", ["POST", "DELETE"]),
    ...apiRoutes("/api/auth/gateway-check", "protected", ["GET"]),
    ...apiRoutes("/api/auth/me", "protected", ["GET"]),
    ...apiRoutes("/api/auth/wecom", "public", ["GET"]),
    ...apiRoutes("/api/auth/dev-login-bypass", "dev", ["GET"]),
    ...apiRoutes("/api/modules/production/inventory", "disabled", ["GET", "POST", "PUT", "DELETE"]),
    ...apiRoutes("/api/settings/account/targets", "protected", ["GET"]),
    ...apiRoutes("/api/settings/account/routine", "protected", ["GET", "PUT"]),
    ...apiRoutes("/api/settings/account/week-info", "public", ["GET"]),
  ];
}

function sortOrderAt(index: number) {
  return index;
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
        maxRoleKey: moduleDef.resourceMaxRoleKey,
        hidden: moduleDef.resourceHidden,
        sortOrder: moduleDef.resourceSortOrder,
      });
      moduleDef.children?.forEach((child, index) => {
        derived.push({
          key: child.resourceKey,
          name: child.label,
          parentKey: moduleDef.resourceKey,
          maxRoleKey: child.resourceMaxRoleKey,
          hidden: child.resourceHidden,
          sortOrder: child.resourceSortOrder ?? sortOrderAt(index),
        });
      });
    }
    explicit.push(...(definition.resourceDefs ?? []));
  }

  return [...derived, ...explicit];
}

export function validateModuleRegistry(definitions: WorkspacePackageRegistration[], moduleKeys: string[]) {
  const seenPackages = new Set<string>();
  const seenModuleKeys = new Set<string>();
  const seenRoutes = new Map<string, string>();

  for (const definition of definitions) {
    if (seenPackages.has(definition.packageName)) throw new Error(`DUPLICATE MODULE PACKAGE: ${definition.packageName}`);
    seenPackages.add(definition.packageName);

    for (const route of definition.routes ?? []) {
      const existingPackage = seenRoutes.get(route);
      if (existingPackage) throw new Error(`DUPLICATE MODULE ROUTE: ${route} is registered by ${existingPackage} and ${definition.packageName}`);
      seenRoutes.set(route, definition.packageName);
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
}
