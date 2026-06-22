#!/usr/bin/env node
/**
 * API Route Governance Check
 *
 * 规则：
 * 1. API 一级目录只表达系统能力类型
 * 2. 业务 API 必须放在 /api/modules/<module>/* 下
 * 3. module 名必须来自 packages/platform/module-registry.ts 中登记的 API guards
 * 4. 外部开放 API 必须放在 /api/open/*，且走 Open API registry/scope
 */

const fs = require("fs");
const path = require("path");
const { collectApiContracts, collectModuleDefs } = require("./module-registry-reader");

const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const ROOT = path.join(WORKSPACE_ROOT, "app/api");

function walkRoutes(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results.push(...walkRoutes(full));
    } else if (entry === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

const KNOWN_PREFIXES = [
  "agent",
  "auth",
  "integrations",
  "modules",
  "open",
  "settings",
];

const MODULE_DEFS = collectModuleDefs();
const KNOWN_MODULES = new Set(MODULE_DEFS.filter((moduleDef) => !moduleDef.parentKey).map((moduleDef) => moduleDef.key));
const MODULES_WITH_CHILDREN = new Set(MODULE_DEFS.filter((moduleDef) => moduleDef.parentKey).map((moduleDef) => moduleDef.parentKey));
const REGISTERED_L2_API_BASES = new Set(
  MODULE_DEFS
    .filter((moduleDef) => moduleDef.parentKey)
    .flatMap((moduleDef) => moduleDef.apiPrefixes || []),
);
const REGISTERED_L1_ONLY_API_BASES = new Set(
  collectApiContracts()
    .filter((contract) => contract.source === "apiResourceGuards")
    .map((contract) => contract.pathPrefix)
    .filter((prefix) => {
      const parts = prefix.split("/").filter(Boolean);
      const moduleName = parts[2];
      return parts[0] === "api" && parts[1] === "modules" && moduleName && !MODULES_WITH_CHILDREN.has(moduleName);
    }),
);
const EXPLICIT_NON_L2_API_CONTRACTS = collectApiContracts()
  .filter((contract) => contract.source === "apiRoutes" && ["disabled", "internal"].includes(contract.access))
  .map((contract) => contract.pathPrefix);

function routePathFromRel(rel) {
  return `/api/${rel.replace(/\/route\.ts$/, "")}`;
}

function isCoveredByExplicitNonL2Contract(pathname) {
  return EXPLICIT_NON_L2_API_CONTRACTS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isCoveredByL1OnlyContract(pathname) {
  return [...REGISTERED_L1_ONLY_API_BASES].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

let errors = 0;

const allRoutes = walkRoutes(ROOT);

for (const file of allRoutes) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const content = fs.readFileSync(file, "utf-8");

  // 检查是否在已知 API 能力前缀下
  const firstSegment = rel.split("/")[0];
  if (!KNOWN_PREFIXES.includes(firstSegment)) {
    console.error(`❌ ${rel} 缺少 API 能力前缀，应放到 /api/{auth,agent,settings,modules,integrations,open}/*`);
    errors++;
    continue;
  }

  if (firstSegment === "modules") {
    const parts = rel.split("/");
    const moduleName = parts[1];
    if (!KNOWN_MODULES.has(moduleName)) {
      console.error(`❌ ${rel} 的模块名未在 module-registry apiGuards 登记，应放到 /api/modules/<registered-module>/*`);
      errors++;
    }
    const routePath = routePathFromRel(rel);
    const l2Base = parts.length >= 3 ? `/api/modules/${parts[1]}/${parts[2]}` : null;
    if (
      !isCoveredByExplicitNonL2Contract(routePath) &&
      !isCoveredByL1OnlyContract(routePath) &&
      (!l2Base || !REGISTERED_L2_API_BASES.has(l2Base))
    ) {
      console.error(`❌ ${rel} 未命中注册的 L2 API base；应放到 /api/modules/<l1>/<registered-l2>/*，当前 L2 base 为 ${l2Base || "缺失"}`);
      errors++;
    }

    const usesDirectAuthenticate = content.includes("authenticate(");
    const hasDisabledRuntimeGuard = content.includes("disabledApiResponseForRequest");
    const usesAuthWrapper = /with[A-Za-z]*Access\s*\(/.test(content) || /withAuth\s*\(/.test(content);
    if (
      usesDirectAuthenticate &&
      !hasDisabledRuntimeGuard &&
      !usesAuthWrapper
    ) {
      console.error(`❌ ${rel} 手写 authenticate() 时必须先调用 disabledApiResponseForRequest()，避免 contract disabled 后仍进入业务逻辑`);
      errors++;
    }
  }

  if (firstSegment === "open") {
    if (!content.includes("withOpenApiScope(")) {
      console.error(`❌ ${rel} 外部开放 API 必须使用 withOpenApiScope()`);
      errors++;
    }
    if (/\bauthorize\s*\(/.test(content) || /\bwithAuth\s*\(/.test(content) || /\bauthenticate\s*\(/.test(content)) {
      console.error(`❌ ${rel} 外部开放 API 禁止使用内部 RBAC/auth wrapper`);
      errors++;
    }
  }
}

if (errors > 0) {
  console.error(`\nAPI route governance check failed: ${errors} error(s)`);
  process.exit(1);
} else {
  console.log("\n✓ API route governance check passed");
}
