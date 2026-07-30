import assert from "node:assert/strict";
import test from "node:test";

import { registeredModuleDefinitions } from "./module-registry";
import { findOpenApiEndpoint, getOpenApiScope } from "./open-api-registry";
import { resolvePermissionApiActionPolicy } from "./permission-api-action-policy";
import { getPermissionResourceActionPolicy } from "./permission-resource-policy";

test("notification publishing registries keep ingress permissions explicit", () => {
  assert.equal(
    getOpenApiScope("workspace.notifications.definitions.read")?.scope.key,
    "workspace.notifications.definitions.read",
  );
  assert.equal(
    findOpenApiEndpoint("POST", "/api/open/v1/notifications/publications")?.endpoint.scopeKey,
    "workspace.notifications.publications.write",
  );
  const duplicateInternalRoutes = registeredModuleDefinitions
    .flatMap((definition) => "apiRoutes" in definition ? definition.apiRoutes : [])
    .filter((route) => route?.pathPrefix.startsWith("/api/open/v1/notifications") === true);
  assert.deepEqual(duplicateInternalRoutes, []);

  const publication = resolvePermissionApiActionPolicy({
    method: "POST",
    apiPath: "/api/modules/settings/notifications/publications",
    resourceKey: "settings.notifications",
  });
  assert.deepEqual(publication.requiredActions, ["create", "apiUse"]);

  const management = resolvePermissionApiActionPolicy({
    method: "POST",
    apiPath: "/api/settings/api/open/notification-definitions/custom.operations.reminder/publish",
    resourceKey: "settings.notifications",
  });
  assert.deepEqual(management.requiredActions, ["configure"]);

  const resource = getPermissionResourceActionPolicy("settings.notifications");
  for (const action of ["read", "configure", "create", "apiUse", "audit"] as const) {
    assert.equal(resource?.supportedActions.includes(action), true);
    assert.equal(resource?.explicitOnlyActions.includes(action), true);
  }
});
