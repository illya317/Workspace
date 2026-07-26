import { registeredModuleDefinitions } from "./module-registry";

type RuntimeRouteChild = {
  href: string;
  label: string;
  enabled?: boolean;
  hidden?: boolean;
};

type RuntimeRouteModule = RuntimeRouteChild & {
  children?: RuntimeRouteChild[];
};

type RuntimeRouteRegistration = string | {
  path: string;
  gatePath?: string;
};

type RuntimeRouteDefinition = {
  moduleDef?: RuntimeRouteModule | null;
  routes?: RuntimeRouteRegistration[];
};

export type RouteRuntimeMeta = {
  baseLabel: string;
  label: string;
};

function normalizeRoute(route: string, normalizeRecordRoute?: boolean) {
  return normalizeRecordRoute ? route.replace(/\/\[[^\]]+\]/g, "") : route;
}

function getBaseRouteLabel(route: string) {
  for (const { moduleDef } of registeredModuleDefinitions) {
    if (!moduleDef) continue;
    if (moduleDef.href === route) return moduleDef.label;
    const child = moduleDef.children?.find((item) => item.href === route);
    if (child) return child.label;
  }
  return null;
}

function isVisible(item: RuntimeRouteChild, respectVisibility: boolean) {
  return !respectVisibility || (item.enabled !== false && !item.hidden);
}

export function getRouteRuntimeMeta(
  route: string,
  runtimeDefinitions: RuntimeRouteDefinition[],
  options: { normalizeRecordRoute?: boolean; respectVisibility?: boolean } = {},
): RouteRuntimeMeta | null {
  const normalizedRoute = normalizeRoute(route, options.normalizeRecordRoute);
  const respectVisibility = options.respectVisibility ?? true;

  for (const { moduleDef, routes } of runtimeDefinitions) {
    if (!moduleDef || !isVisible(moduleDef, respectVisibility)) continue;
    if (moduleDef.href === normalizedRoute) {
      return { baseLabel: getBaseRouteLabel(normalizedRoute) ?? moduleDef.label, label: moduleDef.label };
    }
    const child = moduleDef.children?.find((item) => item.href === normalizedRoute && isVisible(item, respectVisibility));
    if (child) return { baseLabel: getBaseRouteLabel(normalizedRoute) ?? child.label, label: child.label };
    const registeredRoute = routes?.find((item) => (typeof item === "string" ? item : item.path) === normalizedRoute);
    if (!registeredRoute) continue;
    const gatePath = typeof registeredRoute === "string" ? null : registeredRoute.gatePath;
    if (gatePath && gatePath !== normalizedRoute) {
      return getRouteRuntimeMeta(gatePath, runtimeDefinitions, options);
    }
    return { baseLabel: moduleDef.label, label: moduleDef.label };
  }
  return null;
}

export function applyRouteRuntimeLabel(value: string, meta: RouteRuntimeMeta) {
  if (!meta.baseLabel || meta.baseLabel === meta.label) return value;
  return value.replaceAll(meta.baseLabel, meta.label);
}
