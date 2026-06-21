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

type RuntimeRouteDefinition = {
  moduleDef?: RuntimeRouteModule | null;
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

  for (const { moduleDef } of runtimeDefinitions) {
    if (!moduleDef || !isVisible(moduleDef, respectVisibility)) continue;
    if (moduleDef.href === normalizedRoute) {
      return { baseLabel: getBaseRouteLabel(normalizedRoute) ?? moduleDef.label, label: moduleDef.label };
    }
    const child = moduleDef.children?.find((item) => item.href === normalizedRoute && isVisible(item, respectVisibility));
    if (child) return { baseLabel: getBaseRouteLabel(normalizedRoute) ?? child.label, label: child.label };
  }
  return null;
}

export function applyRouteRuntimeLabel(value: string, meta: RouteRuntimeMeta) {
  if (!meta.baseLabel || meta.baseLabel === meta.label) return value;
  return value.replaceAll(meta.baseLabel, meta.label);
}
