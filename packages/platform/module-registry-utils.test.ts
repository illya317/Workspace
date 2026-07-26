import assert from "node:assert/strict";
import test from "node:test";

import { assistantIntegrationApiRoutes, systemApiRoutes } from "./module-registry-utils";

test("production API Key login is public while the bypass helper stays development-only", () => {
  const routes = systemApiRoutes();
  assert.equal(routes.find((route) => route.method === "POST" && route.pathPrefix === "/api/auth/dev-login")?.access, "public");
  assert.equal(routes.find((route) => route.method === "DELETE" && route.pathPrefix === "/api/auth/dev-login")?.access, "public");
  assert.equal(routes.find((route) => route.pathPrefix === "/api/auth/dev-login-bypass")?.access, "dev");
});

test("assistant owns headless agent and integration adapters while auth remains in the shell", () => {
  const assistantRoutes = assistantIntegrationApiRoutes();
  const systemRoutes = systemApiRoutes();
  assert.equal(assistantRoutes.some((route) => route.pathPrefix === "/api/agent"), true);
  assert.equal(assistantRoutes.some((route) => route.pathPrefix.startsWith("/api/integrations/")), true);
  assert.equal(systemRoutes.some((route) => route.pathPrefix.startsWith("/api/integrations/")), false);
  assert.equal(systemRoutes.some((route) => route.pathPrefix === "/api/auth/wecom"), true);
});
