import fs from "fs";
import path from "path";

import {
  assertOpenApiRegistryValid,
  openApiRegistrations,
  type OpenApiMethod,
} from "../../packages/platform/open-api-registry";

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "app");
const API_DIR = path.join(APP_DIR, "api");
const METHODS = new Set<OpenApiMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function walk(dir: string, predicate: (file: string) => boolean, results: string[] = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, results);
    if (entry.isFile() && predicate(full)) results.push(full);
  }
  return results;
}

function visibleAppRouteFromPage(file: string) {
  const rel = path.relative(APP_DIR, file).replace(/\\/g, "/");
  const segments = rel.split("/").slice(0, -1);
  const visible = segments.filter((segment) => !segment.startsWith("(") && !segment.startsWith("_"));
  return `/${visible.join("/")}`;
}

function routeFileForApiPath(apiPath: string) {
  const rel = apiPath.replace(/^\/api\//, "");
  return path.join(API_DIR, rel, "route.ts");
}

function apiPathFromRouteFile(file: string) {
  const rel = path.relative(API_DIR, file).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
  return `/api/${rel}`;
}

function exportedMethods(content: string) {
  const methods = new Set<OpenApiMethod>();
  for (const match of content.matchAll(/\bexport\s+(?:const|async function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
    const method = match[1] as OpenApiMethod;
    if (METHODS.has(method)) methods.add(method);
  }
  return methods;
}

function pathMatchesPrefix(apiPath: string, pathPrefix: string) {
  return apiPath === pathPrefix || apiPath.startsWith(`${pathPrefix}/`);
}

export function checkOpenApi() {
  const errors: string[] = [];

  try {
    assertOpenApiRegistryValid();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const pageRoutes = new Set(
    walk(APP_DIR, (file) => path.basename(file) === "page.tsx").map(visibleAppRouteFromPage),
  );
  const endpoints = openApiRegistrations.flatMap((registration) =>
    registration.endpoints.map((endpoint) => ({ registration, endpoint })),
  );

  for (const registration of openApiRegistrations) {
    if (!registration.resources.length) errors.push(`${registration.key} missing Open API resources`);
    if (!registration.scopes.length) errors.push(`${registration.key} missing Open API scopes`);
    if (!registration.endpoints.length) errors.push(`${registration.key} missing Open API endpoints`);
    if (!pageRoutes.has(registration.consoleHref)) {
      errors.push(`${registration.key} console page not found: ${registration.consoleHref}`);
    }
    for (const endpoint of registration.endpoints) {
      const routeFile = routeFileForApiPath(endpoint.pathPrefix);
      if (!fs.existsSync(routeFile)) {
        errors.push(`${endpoint.key} route file not found for ${endpoint.pathPrefix}`);
        continue;
      }
      const methods = exportedMethods(fs.readFileSync(routeFile, "utf8"));
      if (!methods.has(endpoint.method)) {
        errors.push(`${endpoint.key} route file missing export ${endpoint.method}: ${endpoint.pathPrefix}`);
      }
    }
  }

  const openRouteFiles = walk(path.join(API_DIR, "open"), (file) => path.basename(file) === "route.ts");
  for (const file of openRouteFiles) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");
    const apiPath = apiPathFromRouteFile(file);
    const methods = exportedMethods(content);
    if (!content.includes("withOpenApiScope(")) {
      errors.push(`${rel} must use withOpenApiScope()`);
    }
    if (/\bauthorize\s*\(/.test(content) || /\bwithAuth\s*\(/.test(content) || /\bauthenticate\s*\(/.test(content)) {
      errors.push(`${rel} must not use internal RBAC/auth wrappers`);
    }
    if (methods.size === 0) {
      errors.push(`${rel} exports no HTTP method`);
      continue;
    }
    for (const method of methods) {
      const registered = endpoints.some(({ endpoint }) =>
        endpoint.method === method && pathMatchesPrefix(apiPath, endpoint.pathPrefix),
      );
      if (!registered) errors.push(`${rel} exports unregistered Open API endpoint: ${method} ${apiPath}`);
    }
  }

  if (errors.length) {
    console.error(errors.map((error) => `❌ ${error}`).join("\n"));
    return false;
  }
  console.log("✓ Open API registry/routes check passed");
  return true;
}
