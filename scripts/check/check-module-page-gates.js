#!/usr/bin/env node

/**
 * Page Contract Gate Check
 *
 * L1/L2 pages are derived from moduleDef/moduleDef.children.
 * Deeper pages and system pages must be registered in WorkspacePackageRegistration.routes.
 * Every physical page.tsx must match exactly one page contract and use the contract's gate.
 */

const fs = require("fs");
const path = require("path");
const { collectModuleDefs, collectRoutes, ROOT } = require("./module-registry-reader");
const { hasModuleHomePage, hasRouteAccessGate } = require("./module-page-gate-detector");

const APP_DIR = path.join(ROOT, "app");
const VALID_PAGE_ACCESS = new Set(["resource", "adminManage", "authenticated", "public"]);
const CUSTOM_L1_HOME_MODULES = new Set(["agent", "work"]);

function normalizeRoute(route) {
  return route.replace(/\/+/g, "/").replace(/\/$/g, "") || "/";
}

function displayPath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function walkPages(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "api") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkPages(full));
    } else if (entry.name === "page.tsx") {
      output.push(full);
    }
  }
  return output;
}

function routeFromPagePath(pagePath) {
  const relativeDir = path.relative(APP_DIR, path.dirname(pagePath)).replace(/\\/g, "/");
  const segments = relativeDir
    .split("/")
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("(") || !segment.endsWith(")"));
  return normalizeRoute(`/${segments.join("/")}`);
}

function hasNamedImport(content, name, source) {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${escaped}["']`, "g");
  let match;
  while ((match = regex.exec(content))) {
    const names = match[1].split(",").map((item) => item.trim().split(/\s+as\s+/)[0]?.trim());
    if (names.includes(name)) return true;
  }
  return false;
}

function getRedirectTargets(text) {
  const targets = [];
  const regex = /\bredirect\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = regex.exec(text))) targets.push(normalizeRoute(match[1]));
  return targets;
}

function hasRegisteredChildRedirect(texts, route, byRoute) {
  const normalizedRoute = normalizeRoute(route);
  return texts.some((text) =>
    getRedirectTargets(text).some((target) =>
      target.startsWith(`${normalizedRoute}/`) && byRoute.has(target),
    ),
  );
}

function hasAdminManageGate(text) {
  return /requireAdminManageAccess\s*\(\s*\)/.test(text);
}

function hasAuthenticatedGate(text) {
  if (/createAuthenticatedAppShellPage\s*\(/.test(text)) return true;
  if (/requireAuth\s*\(\s*\)/.test(text)) return true;
  if (/getCurrentUser\s*\(\s*\)/.test(text) && /redirect\s*\(\s*["']\/login["']\s*\)/.test(text)) return true;
  return false;
}

function hasPublicPageSignal(text) {
  if (hasNamedImport(text, "verifyToken", "@workspace/platform/server/auth") && /redirect\s*\(\s*["']\/login["']\s*\)/.test(text)) return true;
  if (/LoginClient/.test(text)) return true;
  return true;
}

function findLayoutFiles(pageDir) {
  const layouts = [];
  let dir = pageDir;
  while (dir.startsWith(APP_DIR)) {
    const layout = path.join(dir, "layout.tsx");
    if (fs.existsSync(layout)) layouts.push(layout);
    if (dir === APP_DIR) break;
    dir = path.dirname(dir);
  }
  return layouts;
}

function pageAndLayouts(pagePath) {
  return [pagePath, ...findLayoutFiles(path.dirname(pagePath))];
}

function findOwningModuleForRoute(modules, route) {
  const normalized = normalizeRoute(route);
  return modules
    .filter((moduleDef) => moduleDef.href && moduleDef.resourceKey)
    .filter((moduleDef) => normalized === normalizeRoute(moduleDef.href) || normalized.startsWith(`${normalizeRoute(moduleDef.href)}/`))
    .sort((left, right) => normalizeRoute(right.href).length - normalizeRoute(left.href).length)[0] ?? null;
}

function buildPageContracts() {
  const modules = collectModuleDefs();
  const contracts = [];
  for (const moduleDef of modules) {
    if (!moduleDef.href || !moduleDef.resourceKey || moduleDef.presentation === "headless") continue;
    const path = normalizeRoute(moduleDef.href);
    const access = moduleDef.pageAccess || "resource";
    contracts.push({
      route: path,
      gatePath: path,
      resourceKey: moduleDef.resourceKey,
      access,
      moduleKey: moduleDef.parentKey ? null : moduleDef.key,
      filePath: moduleDef.filePath,
      line: moduleDef.line,
      source: "moduleDef.href",
      notes: null,
    });
  }

  for (const route of collectRoutes()) {
    const path = normalizeRoute(route.route);
    const owner = findOwningModuleForRoute(modules, path);
    const access = route.access || (owner ? "resource" : null);
    contracts.push({
      route: path,
      gatePath: normalizeRoute(route.gatePath || owner?.href || path),
      resourceKey: route.resourceKey || owner?.resourceKey || null,
      access,
      moduleKey: owner && !owner.parentKey ? owner.key : null,
      filePath: route.filePath,
      line: route.line,
      source: "routes",
      notes: route.notes,
    });
  }

  return contracts;
}

function checkContract(contract, violations) {
  if (!contract.access || !VALID_PAGE_ACCESS.has(contract.access)) {
    violations.push({
      filePath: contract.filePath,
      line: contract.line,
      message: `page route ${contract.route} declares invalid access ${contract.access ?? "<missing>"}`,
    });
  }
  if (contract.access === "resource" && !contract.resourceKey) {
    violations.push({
      filePath: contract.filePath,
      line: contract.line,
      message: `resource page route ${contract.route} must resolve a resourceKey`,
    });
  }
  if ((contract.access === "public" || contract.access === "authenticated") && contract.resourceKey) {
    violations.push({
      filePath: contract.filePath,
      line: contract.line,
      message: `${contract.access} page route ${contract.route} must not declare resourceKey ${contract.resourceKey}`,
    });
  }
  if ((contract.access === "public" || contract.access === "authenticated") && !contract.notes && contract.source === "routes") {
    violations.push({
      filePath: contract.filePath,
      line: contract.line,
      message: `${contract.access} page route ${contract.route} must explain why it has no resource gate via notes`,
    });
  }
}

function checkPageGate(pagePath, contract) {
  const texts = pageAndLayouts(pagePath)
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => readText(filePath));
  if (contract.access === "resource") {
    return texts.some((text) => hasRouteAccessGate(text, contract.gatePath, contract.moduleKey));
  }
  if (contract.access === "adminManage") {
    return texts.some(hasAdminManageGate);
  }
  if (contract.access === "authenticated") {
    return texts.some(hasAuthenticatedGate);
  }
  if (contract.access === "public") {
    return texts.some(hasPublicPageSignal);
  }
  return false;
}

const contracts = buildPageContracts();
const violations = [];
const byRoute = new Map();

for (const contract of contracts) {
  checkContract(contract, violations);
  const existing = byRoute.get(contract.route);
  if (existing) {
    violations.push({
      filePath: contract.filePath,
      line: contract.line,
      message: `page route ${contract.route} is registered twice; first registration is ${displayPath(existing.filePath)}:${existing.line}`,
    });
    continue;
  }
  byRoute.set(contract.route, contract);
}

for (const pagePath of walkPages(APP_DIR)) {
  const route = routeFromPagePath(pagePath);
  const contract = byRoute.get(route);
  if (!contract) {
    violations.push({
      filePath: pagePath,
      line: 1,
      message: `page route ${route} has no page contract in module registry`,
    });
    continue;
  }
  if (!checkPageGate(pagePath, contract)) {
    const expected = contract.access === "resource"
      ? `requireRouteAccess("${contract.gatePath}"), requireRouteActionAccess("${contract.gatePath}", <action>), or createProtectedModulePage({ route: "${contract.gatePath}" })`
      : contract.access === "adminManage"
        ? "requireAdminManageAccess()"
        : contract.access === "authenticated"
          ? "requireAuth(), createAuthenticatedAppShellPage(), or getCurrentUser()+redirect('/login')"
          : "a public page contract";
    violations.push({
      filePath: pagePath,
      line: 1,
      message: `page route ${route} must use ${expected}`,
    });
  }
  if (
    contract.source === "moduleDef.href"
    && contract.moduleKey
  ) {
    const texts = pageAndLayouts(pagePath)
      .filter((filePath) => fs.existsSync(filePath))
      .map((filePath) => readText(filePath));
    const hasModuleHome = texts.some((text) => hasModuleHomePage(text, contract.moduleKey));
    const hasDefaultRedirect = hasRegisteredChildRedirect(texts, contract.route, byRoute);
    const allowsCustomHome = CUSTOM_L1_HOME_MODULES.has(contract.moduleKey);
    if (!allowsCustomHome && !hasModuleHome && !hasDefaultRedirect) {
      violations.push({
        filePath: pagePath,
        line: 1,
        message: `L1 page route ${route} must render ModuleHomePage for moduleKey "${contract.moduleKey}" or redirect to a registered child route`,
      });
    }
  }
}

if (violations.length > 0) {
  console.error("✗ Module page contract check failed.");
  for (const v of violations) {
    console.error(`  ${displayPath(v.filePath)}:${v.line} — ${v.message}`);
  }
  process.exit(1);
}

console.log(`✓ Module page contract check passed (${byRoute.size} registered pages).`);
