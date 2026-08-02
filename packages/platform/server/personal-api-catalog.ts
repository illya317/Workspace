import "server-only";

import { getApiContracts } from "../api-registry";
import { listBusinessActionRegistrations } from "../business-action-registry";

export type PersonalApiDocumentationReference = {
  readonly uiPath: string;
  readonly catalogPath: string;
  readonly sectionPathTemplate: string;
  readonly searchPathTemplate: string;
  readonly permissionQueryPath: string;
  readonly guidance: string;
};

let personalApiDocumentationReference: PersonalApiDocumentationReference | null = null;
let personalApiDocumentationLeaseCount = 0;

function sameDocumentationReference(
  left: PersonalApiDocumentationReference,
  right: PersonalApiDocumentationReference,
) {
  return left.uiPath === right.uiPath
    && left.catalogPath === right.catalogPath
    && left.sectionPathTemplate === right.sectionPathTemplate
    && left.searchPathTemplate === right.searchPathTemplate
    && left.permissionQueryPath === right.permissionQueryPath
    && left.guidance === right.guidance;
}

export function registerPersonalApiDocumentationReference(reference: PersonalApiDocumentationReference) {
  if (
    personalApiDocumentationReference
    && !sameDocumentationReference(personalApiDocumentationReference, reference)
  ) {
    throw new Error("Personal API documentation reference is already registered");
  }
  personalApiDocumentationReference ??= reference;
  personalApiDocumentationLeaseCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    personalApiDocumentationLeaseCount -= 1;
    if (personalApiDocumentationLeaseCount > 0) return;
    personalApiDocumentationLeaseCount = 0;
    personalApiDocumentationReference = null;
  };
}

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
      "When a contract, permission, business term or write sequence is unclear, query the structured documentation catalog before guessing or claiming that no API exists.",
    ],
    documentation: personalApiDocumentationReference,
    contracts,
    mutations,
  };
}
