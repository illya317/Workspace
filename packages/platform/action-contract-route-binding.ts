import type { ActionContractMetadata } from "./action-contract";

interface ActionRouteBindingRegistration {
  key: string;
  apiRoutes?: ReadonlyArray<{ method: string; path: string }>;
}

export function listActionContractRouteBindingIssues(
  actions: readonly ActionRouteBindingRegistration[],
  contracts: readonly ActionContractMetadata[],
) {
  const contractByKey = new Map(contracts.map((contract) => [contract.key, contract]));
  const issues: string[] = [];
  for (const action of actions) {
    const contract = contractByKey.get(action.key);
    if (!contract) continue;
    const actionRoutes = new Set((action.apiRoutes ?? []).map((route) => `${route.method} ${route.path}`));
    const directContractRoutes = new Set([
      contract.api.commandRoute,
      ...contract.api.directRoutes ?? [],
    ].filter((route): route is string => Boolean(route)));
    const allContractRoutes = new Set([
      ...directContractRoutes,
      ...contract.api.workflowRoutes ?? [],
    ]);
    for (const route of actionRoutes) {
      if (!allContractRoutes.has(route)) issues.push(`${action.key}: BusinessAction route missing from Contract: ${route}`);
    }
    for (const route of directContractRoutes) {
      if (!actionRoutes.has(route)) issues.push(`${action.key}: Contract command/direct route missing from BusinessAction: ${route}`);
    }
  }
  return issues;
}
