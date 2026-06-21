import fs from "node:fs";
import path from "node:path";
import { registeredModuleDefinitions } from "../../packages/platform/module-registry";

const ROOT = path.resolve(__dirname, "../..");
const APP_ROOT = path.join(ROOT, "app");
const SYSTEM_ROUTE_ROOTS = new Set(["api", "login", "module-disabled", "portal"]);
const PAGE_FILE = "page.tsx";

type Violation = {
  file: string;
  message: string;
};

function isRouteGroup(segment: string) {
  return segment.startsWith("(") && segment.endsWith(")");
}

function normalizeRoute(route: string) {
  return route.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function routeSegments(route: string) {
  return normalizeRoute(route).split("/").filter(Boolean);
}

function routeRoot(route: string) {
  return routeSegments(route)[0];
}

function isL1Route(route: string) {
  return routeSegments(route).length === 1;
}

function isChildRoute(parent: string, child: string) {
  const normalizedParent = normalizeRoute(parent);
  const normalizedChild = normalizeRoute(child);
  return normalizedChild.startsWith(`${normalizedParent}/`);
}

function toRelative(filePath: string) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function appRouteFromPage(filePath: string) {
  const relative = path.relative(APP_ROOT, filePath).replace(/\\/g, "/");
  const segments = relative.split("/");
  segments.pop();
  const routeParts = segments.filter((segment) => segment && !isRouteGroup(segment));
  return `/${routeParts.join("/")}`.replace(/\/$/, "") || "/";
}

function walkPages(dir: string, pages: string[] = []) {
  if (!fs.existsSync(dir)) return pages;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "api") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkPages(fullPath, pages);
    } else if (entry.name === PAGE_FILE) {
      pages.push(fullPath);
    }
  }
  return pages;
}

function checkRegisteredHierarchy(violations: Violation[]) {
  for (const registration of registeredModuleDefinitions) {
    const moduleDef = registration.moduleDef;
    if (!moduleDef) continue;

    const moduleHref = normalizeRoute(moduleDef.href);
    if (!isL1Route(moduleHref)) {
      violations.push({
        file: "packages/platform/module-registry.ts",
        message: `${moduleDef.key}.href must be an L1 route, got ${moduleDef.href}`,
      });
    }

    for (const child of moduleDef.children ?? []) {
      if (!isChildRoute(moduleHref, child.href)) {
        violations.push({
          file: "packages/platform/module-registry.ts",
          message: `${moduleDef.key}.${child.key}.href must start with ${moduleHref}/, got ${child.href}`,
        });
      }
    }

    for (const route of registration.routes ?? []) {
      const normalizedRoute = normalizeRoute(route);
      if (normalizedRoute !== moduleHref && !isChildRoute(moduleHref, normalizedRoute)) {
        violations.push({
          file: "packages/platform/module-registry.ts",
          message: `${moduleDef.key}.routes contains ${route}; routes must stay under ${moduleHref}`,
        });
      }
    }
  }
}

function checkPhysicalAppRoots(allowedRouteRoots: Set<string>, violations: Violation[]) {
  for (const entry of fs.readdirSync(APP_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || isRouteGroup(entry.name)) continue;
    if (allowedRouteRoots.has(entry.name)) continue;
    violations.push({
      file: `app/${entry.name}`,
      message: `top-level app directory "${entry.name}" is not a registered L1 module or system route`,
    });
  }
}

function checkRenderedRouteRoots(allowedRouteRoots: Set<string>, violations: Violation[]) {
  for (const page of walkPages(APP_ROOT)) {
    const route = appRouteFromPage(page);
    const root = routeRoot(route);
    if (!root || allowedRouteRoots.has(root)) continue;
    violations.push({
      file: toRelative(page),
      message: `route ${route} must live under a registered L1 module or system route`,
    });
  }
}

export function checkAppRouteHierarchy() {
  console.log("\n▶ App route hierarchy guard");

  const moduleRouteRoots = registeredModuleDefinitions
    .map((registration) => registration.moduleDef?.href)
    .filter((href): href is string => Boolean(href))
    .map(routeRoot)
    .filter((root): root is string => Boolean(root));
  const allowedRouteRoots = new Set([...SYSTEM_ROUTE_ROOTS, ...moduleRouteRoots]);
  const violations: Violation[] = [];

  checkRegisteredHierarchy(violations);
  checkPhysicalAppRoots(allowedRouteRoots, violations);
  checkRenderedRouteRoots(allowedRouteRoots, violations);

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`✗ ${violation.file}: ${violation.message}`);
    }
    return false;
  }

  console.log("✓ App route hierarchy guard passed.");
  return true;
}
