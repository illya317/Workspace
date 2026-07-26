import "server-only";

import { getApiContracts } from "../api-registry";
import { listBusinessActionRegistrations } from "../business-action-registry";

export function buildPersonalApiCatalog() {
  const contracts = getApiContracts()
    .filter((contract) => (
      contract.apiKind === "business"
      && contract.access === "protected"
      && contract.pathPrefix.startsWith("/api/modules/")
    ))
    .map((contract) => ({
      key: contract.key,
      method: contract.method,
      pathPrefix: contract.pathPrefix,
      resourceKey: contract.resourceKey,
      requiredActions: contract.requiredActions,
      runtimeEnforcement: contract.runtimeEnforcement,
      ownerPackage: contract.ownerPackage,
      ownerModuleKey: contract.ownerModuleKey,
      notes: contract.notes,
    }));

  const mutations = listBusinessActionRegistrations()
    .filter((action) => action.settingsVisibility !== "runtime_only")
    .flatMap((action) => (action.apiRoutes ?? [])
      .filter((route) => route.path.startsWith("/api/modules/"))
      .map((route) => ({
        key: action.key,
        label: action.label,
        method: route.method,
        path: route.path,
        moduleKey: action.moduleKey,
        resourceKey: action.resourceKey,
        requiredAction: action.directPermissionAction ?? null,
        writeKind: action.writeKind,
        targetKind: action.targetKind,
        notes: route.notes ?? action.notes ?? null,
      })))
    .sort((left, right) => `${left.key}:${left.method}:${left.path}`.localeCompare(
      `${right.key}:${right.method}:${right.path}`,
    ));

  return {
    version: 3,
    authentication: {
      header: "X-API-Key",
      embeddedDelegation: "The built-in Agent receives a short-lived exact-request delegation from Workspace; the model never receives credentials.",
      identity: "Both transports act only as the authenticated Workspace requester; a selected virtual actor can only narrow authorization.",
    },
    rules: [
      "Call only normal /api/modules/** business endpoints.",
      "Every request rechecks the requester's registered resource, action, apiUse and object/space visibility.",
      "serviceDelegated endpoints perform the final object or space check inside their owning business service.",
      "Resolve concrete IDs, query values and request bodies from API responses and contracts; never guess them.",
      "Mutation endpoints execute when dispatched. The client or embedded runtime owns conversational confirmation and should read current versions before CAS-protected writes.",
    ],
    contracts,
    mutations,
  };
}
