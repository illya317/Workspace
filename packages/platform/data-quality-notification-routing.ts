import type { DataQualityFinding } from "./data-quality-contract";

export type DataQualityNotificationRoute = {
  id: string;
  resourceKey: string | null;
  departmentId: number | null;
  recipientUsernames: string[];
};

export type DataQualityNotificationGroup = {
  resourceKey: string | null;
  departmentId: number | null;
  matchedRouteId: string | null;
  recipientUsernames: string[];
  findings: DataQualityFinding[];
};

type BuildNotificationGroupsInput = {
  findings: DataQualityFinding[];
  routes?: DataQualityNotificationRoute[];
  fallbackRecipientUsernames?: string[];
};

function routeSpecificity(route: DataQualityNotificationRoute) {
  if (route.resourceKey && route.departmentId) return 3;
  if (route.departmentId) return 2;
  if (route.resourceKey) return 1;
  return 0;
}

function matchesRoute(finding: DataQualityFinding, route: DataQualityNotificationRoute) {
  return (!route.resourceKey || route.resourceKey === (finding.resourceKey ?? null))
    && (!route.departmentId || route.departmentId === (finding.departmentId ?? null));
}

function matchedRoute(finding: DataQualityFinding, routes: DataQualityNotificationRoute[]) {
  return routes
    .filter((route) => matchesRoute(finding, route))
    .sort((left, right) => routeSpecificity(right) - routeSpecificity(left))[0] ?? null;
}

/**
 * Routes findings to recipients and groups only within the same L2/department scope.
 * Department-only routes win over L2-only routes; an exact L2 + department route wins over both.
 */
export function buildDataQualityNotificationGroups({
  findings,
  routes = [],
  fallbackRecipientUsernames = [],
}: BuildNotificationGroupsInput): DataQualityNotificationGroup[] {
  const groups = new Map<string, DataQualityNotificationGroup>();
  for (const finding of findings) {
    const route = matchedRoute(finding, routes);
    const resourceKey = finding.resourceKey ?? null;
    const departmentId = finding.departmentId ?? null;
    const groupKey = `${route?.id ?? "fallback"}:${resourceKey ?? "unscoped"}:${departmentId ?? "unscoped"}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.findings.push(finding);
      continue;
    }
    groups.set(groupKey, {
      resourceKey,
      departmentId,
      matchedRouteId: route?.id ?? null,
      recipientUsernames: [...(route?.recipientUsernames ?? fallbackRecipientUsernames)],
      findings: [finding],
    });
  }
  return [...groups.values()];
}
