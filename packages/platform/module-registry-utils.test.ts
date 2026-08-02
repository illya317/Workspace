import assert from "node:assert/strict";
import test from "node:test";

import { assistantIntegrationApiRoutes, systemApiRoutes } from "./module-registry-utils";

test("production API Key login is public while no authentication bypass is registered", () => {
  const routes = systemApiRoutes();
  assert.equal(routes.find((route) => route.method === "POST" && route.pathPrefix === "/api/auth/dev-login")?.access, "public");
  assert.equal(routes.find((route) => route.method === "DELETE" && route.pathPrefix === "/api/auth/dev-login")?.access, "public");
  assert.equal(routes.some((route) => route.pathPrefix === "/api/auth/dev-login-bypass"), false);
});

test("assistant owns Agent L1 APIs and integration adapters while auth remains in the shell", () => {
  const assistantRoutes = assistantIntegrationApiRoutes();
  const systemRoutes = systemApiRoutes();
  assert.equal(assistantRoutes.some((route) => route.pathPrefix === "/api/agent"), true);
  assert.equal(assistantRoutes.some((route) => route.pathPrefix.startsWith("/api/integrations/")), true);
  assert.equal(systemRoutes.some((route) => route.pathPrefix.startsWith("/api/integrations/")), false);
  assert.equal(systemRoutes.some((route) => route.pathPrefix === "/api/auth/wecom"), true);
});

test("assistant owns all HMAC-authenticated WeCom notification worker routes", () => {
  const routes = assistantIntegrationApiRoutes();
  for (const pathPrefix of [
    "/api/integrations/wecom/notifications/claim",
    "/api/integrations/wecom/notifications/result",
    "/api/integrations/wecom/notifications/heartbeat",
  ]) {
    assert.equal(
      routes.some((route) => (
        route.method === "POST"
        && route.pathPrefix === pathPrefix
        && route.access === "internal"
      )),
      true,
    );
  }
});
