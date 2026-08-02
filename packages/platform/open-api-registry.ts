export type OpenApiAction = "read" | "write";
export type OpenApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface OpenApiResourceRegistration {
  key: string;
  label: string;
  description?: string;
}

export interface OpenApiScopeRegistration {
  key: string;
  label: string;
  resourceKey: string;
  action: OpenApiAction;
}

export interface OpenApiEndpointRegistration {
  key: string;
  label: string;
  method: OpenApiMethod;
  pathPrefix: string;
  scopeKey: string;
  action: OpenApiAction;
}

export interface OpenApiRegistration {
  key: string;
  label: string;
  description: string;
  consoleHref: string;
  consoleTab: string;
  runtimeParentResourceKey: string;
  resources: OpenApiResourceRegistration[];
  scopes: OpenApiScopeRegistration[];
  endpoints: OpenApiEndpointRegistration[];
}

export const openApiRegistrations = [
  {
    key: "hr.generated",
    label: "HR 生成资料开放 API",
    description: "面向外部系统提供 HR 生成资料读取能力。",
    consoleHref: "/settings/api",
    consoleTab: "catalog",
    runtimeParentResourceKey: "hr.roster",
    resources: [
      {
        key: "hr.generated.roster",
        label: "花名册生成资料",
        description: "外部系统读取管理版或尽调版花名册。",
      },
    ],
    scopes: [
      {
        key: "hr.generated.roster.read",
        label: "读取花名册生成资料",
        resourceKey: "hr.generated.roster",
        action: "read",
      },
    ],
    endpoints: [
      {
        key: "hr.generated.roster.list",
        label: "读取花名册生成资料",
        method: "GET",
        pathPrefix: "/api/open/v1/hr/generated/roster",
        scopeKey: "hr.generated.roster.read",
        action: "read",
      },
    ],
  },
  {
    key: "workspace.notifications",
    label: "Workspace 通知开放 API",
    description: "面向受信任外部系统提供已发布通知定义查询与幂等发布能力。",
    consoleHref: "/settings/api",
    consoleTab: "notifications",
    runtimeParentResourceKey: "settings.notifications",
    resources: [
      {
        key: "workspace.notifications",
        label: "Workspace 通知",
        description: "读取可调用定义并创建受控通知发布。",
      },
    ],
    scopes: [
      {
        key: "workspace.notifications.definitions.read",
        label: "读取通知定义",
        resourceKey: "workspace.notifications",
        action: "read",
      },
      {
        key: "workspace.notifications.publications.write",
        label: "发布通知",
        resourceKey: "workspace.notifications",
        action: "write",
      },
    ],
    endpoints: [
      {
        key: "workspace.notifications.definitions.list",
        label: "读取已发布通知定义",
        method: "GET",
        pathPrefix: "/api/open/v1/notifications/definitions",
        scopeKey: "workspace.notifications.definitions.read",
        action: "read",
      },
      {
        key: "workspace.notifications.publications.create",
        label: "创建通知发布",
        method: "POST",
        pathPrefix: "/api/open/v1/notifications/publications",
        scopeKey: "workspace.notifications.publications.write",
        action: "write",
      },
    ],
  },
] satisfies OpenApiRegistration[];

const scopeByKey = new Map(
  openApiRegistrations.flatMap((registration) =>
    registration.scopes.map((scope) => [scope.key, { registration, scope }] as const),
  ),
);

function pathMatchesPrefix(apiPath: string, pathPrefix: string) {
  return apiPath === pathPrefix || apiPath.startsWith(`${pathPrefix}/`);
}

export function getOpenApiRegistrations() {
  return openApiRegistrations;
}

export function getOpenApiResources() {
  return openApiRegistrations.flatMap((registration) =>
    registration.resources.map((resource, index) => ({
      ...resource,
      registrationKey: registration.key,
      runtimeParentResourceKey: registration.runtimeParentResourceKey,
      sortOrder: index,
    })),
  );
}

export function getOpenApiScopes() {
  return openApiRegistrations.flatMap((registration) =>
    registration.scopes.map((scope, index) => ({
      ...scope,
      registrationKey: registration.key,
      runtimeParentResourceKey: registration.runtimeParentResourceKey,
      sortOrder: index,
    })),
  );
}

export function getOpenApiEndpoints() {
  return openApiRegistrations.flatMap((registration) =>
    registration.endpoints.map((endpoint) => ({
      ...endpoint,
      registrationKey: registration.key,
      consoleHref: registration.consoleHref,
      consoleTab: registration.consoleTab,
      runtimeParentResourceKey: registration.runtimeParentResourceKey,
    })),
  );
}

export function getOpenApiScope(scopeKey: string) {
  return scopeByKey.get(scopeKey) ?? null;
}

export function findOpenApiEndpoint(method: OpenApiMethod, apiPath: string) {
  const normalizedPath = apiPath.replace(/\/+$/g, "") || "/";
  return openApiRegistrations
    .flatMap((registration) =>
      registration.endpoints.map((endpoint) => ({ registration, endpoint })),
    )
    .filter(({ endpoint }) => endpoint.method === method)
    .filter(({ endpoint }) => pathMatchesPrefix(normalizedPath, endpoint.pathPrefix))
    .sort((left, right) => right.endpoint.pathPrefix.length - left.endpoint.pathPrefix.length)[0] ?? null;
}

export function assertOpenApiRegistryValid() {
  const seenRoutes = new Map<string, string>();
  const seenResources = new Set<string>();
  const seenScopes = new Set<string>();
  for (const registration of openApiRegistrations) {
    if (registration.consoleHref !== "/settings/api") {
      throw new Error(`Open API consoleHref must use the shared /settings/api page: ${registration.key}`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(registration.consoleTab)) {
      throw new Error(`Open API consoleTab must be a stable tab key: ${registration.key}`);
    }

    const resourceKeys = new Set(registration.resources.map((resource) => resource.key));
    for (const resource of registration.resources) {
      if (seenResources.has(resource.key)) throw new Error(`Duplicate Open API resource: ${resource.key}`);
      seenResources.add(resource.key);
    }
    for (const scope of registration.scopes) {
      if (seenScopes.has(scope.key)) throw new Error(`Duplicate Open API scope: ${scope.key}`);
      if (!resourceKeys.has(scope.resourceKey)) throw new Error(`Open API scope references missing resource: ${scope.key}`);
      seenScopes.add(scope.key);
    }
    for (const endpoint of registration.endpoints) {
      if (!endpoint.pathPrefix.startsWith("/api/open/")) {
        throw new Error(`Open API endpoint must be under /api/open: ${endpoint.key}`);
      }
      if (!seenScopes.has(endpoint.scopeKey)) throw new Error(`Open API endpoint references missing scope: ${endpoint.key}`);
      const routeKey = `${endpoint.method} ${endpoint.pathPrefix}`;
      const existing = seenRoutes.get(routeKey);
      if (existing) throw new Error(`Duplicate Open API endpoint route: ${routeKey} by ${existing} and ${endpoint.key}`);
      seenRoutes.set(routeKey, endpoint.key);
    }
  }
}

assertOpenApiRegistryValid();
