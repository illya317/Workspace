import assert from "node:assert/strict";
import test from "node:test";

import { findApiContract } from "./api-registry";
import { registeredModuleDefinitions } from "./module-registry";
import { findOpenApiEndpoint, getOpenApiRegistrations, getOpenApiScope } from "./open-api-registry";
import { resolvePermissionApiActionPolicy } from "./permission-api-action-policy";
import { getPermissionResourceActionPolicy } from "./permission-resource-policy";

test("notification publishing registries keep ingress permissions explicit", () => {
  const notificationRegistration = getOpenApiRegistrations()
    .find((registration) => registration.key === "workspace.notifications");
  assert.equal(notificationRegistration?.consoleHref, "/settings/api");
  assert.equal(notificationRegistration?.consoleTab, "notifications");
  assert.equal(
    registeredModuleDefinitions
      .some((definition) => "routes" in definition && (definition.routes ?? [])
        .some((route) => typeof route === "string" && route.startsWith("/settings/api/"))),
    false,
  );
  assert.equal(
    getOpenApiScope("workspace.notifications.definitions.read")?.scope.key,
    "workspace.notifications.definitions.read",
  );
  assert.equal(
    findOpenApiEndpoint("POST", "/api/open/v1/notifications/publications")?.endpoint.scopeKey,
    "workspace.notifications.publications.write",
  );
  const openIngressRoutes = registeredModuleDefinitions
    .flatMap((definition) => "apiRoutes" in definition ? definition.apiRoutes : [])
    .filter((route) => route?.pathPrefix.startsWith("/api/open/v1/notifications") === true);
  assert.deepEqual(openIngressRoutes?.map((route) => ({
    method: route?.method,
    pathPrefix: route?.pathPrefix,
    access: route?.access,
  })), [
    { method: "GET", pathPrefix: "/api/open/v1/notifications/definitions", access: "public" },
    { method: "POST", pathPrefix: "/api/open/v1/notifications/publications", access: "public" },
  ]);

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

  for (const [method, path] of [
    ["POST", "/api/settings/api/open/managed-groups/group-key/claim"],
    ["POST", "/api/settings/api/open/managed-groups/group-key/verify"],
    ["PATCH", "/api/settings/api/open/managed-groups/group-key"],
    ["POST", "/api/settings/api/open/group-policies"],
    ["PATCH", "/api/settings/api/open/group-policies/policy-id"],
  ] as const) {
    const contract = findApiContract(method, path);
    assert.equal(contract?.resourceKey, "settings.notifications");
    assert.deepEqual(contract?.requiredActions, ["configure"]);
  }

  const resource = getPermissionResourceActionPolicy("settings.notifications");
  for (const action of ["read", "configure", "create", "apiUse", "audit"] as const) {
    assert.equal(resource?.supportedActions.includes(action), true);
    assert.equal(resource?.explicitOnlyActions.includes(action), true);
  }
});
