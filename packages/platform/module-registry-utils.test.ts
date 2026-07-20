import assert from "node:assert/strict";
import test from "node:test";

import { systemApiRoutes } from "./module-registry-utils";

test("production API Key login is public while the bypass helper stays development-only", () => {
  const routes = systemApiRoutes();
  assert.equal(routes.find((route) => route.method === "POST" && route.pathPrefix === "/api/auth/dev-login")?.access, "public");
  assert.equal(routes.find((route) => route.method === "DELETE" && route.pathPrefix === "/api/auth/dev-login")?.access, "public");
  assert.equal(routes.find((route) => route.pathPrefix === "/api/auth/dev-login-bypass")?.access, "dev");
});
