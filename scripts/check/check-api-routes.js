#!/usr/bin/env node
/**
 * API Route Governance Check
 *
 * 规则：
 * 1. API 一级目录只表达系统能力类型
 * 2. 业务 API 必须放在 /api/modules/<module>/* 下
 * 3. module 名必须来自 packages/platform/module-registry.ts 中登记的 API guards
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
    .filter((contract) => contract.source === "apiGuards")
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
const PUBLIC_OR_DEV_API_ROUTES = new Set([
  "auth/dev-login/route.ts",
  "auth/dev-login-bypass/route.ts",
  "auth/gateway-check/route.ts",
  "auth/me/route.ts",
  "auth/wecom/callback/route.ts",
  "auth/wecom/start/route.ts",
  "settings/account/week-info/route.ts",
]);
const API_ACCESS_IMPORTS = [
  "@workspace/platform/server/auth",
  "@workspace/platform/server/api-access",
];
const WITH_AUTH_IMPORT = "@workspace/platform/server/with-auth";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routePathFromRel(rel) {
  return `/api/${rel.replace(/\/route\.ts$/, "")}`;
}

function isCoveredByExplicitNonL2Contract(pathname) {
  return EXPLICIT_NON_L2_API_CONTRACTS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isCoveredByL1OnlyContract(pathname) {
  return [...REGISTERED_L1_ONLY_API_BASES].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function hasNamedImport(content, name, sources) {
  return sources.some((source) => {
    const escaped = escapeRegExp(source);
    const regex = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${escaped}["']`, "g");
    let match;
    while ((match = regex.exec(content))) {
      const names = match[1].split(",").map((item) => item.trim().split(/\s+as\s+/)[0]?.trim());
      if (names.includes(name)) return true;
    }
    return false;
  });
}

function hasWithAuthImport(content) {
  const escaped = escapeRegExp(WITH_AUTH_IMPORT);
  return new RegExp(`import\\s*\\{[^}]*with[A-Za-z]*(?:Access|Write|Delete|Auth)[^}]*\\}\\s*from\\s*["']${escaped}["']`).test(content);
}

function usesImportedApiGate(content) {
  return hasNamedImport(content, "requireApiAccess", API_ACCESS_IMPORTS) && /\brequireApiAccess\s*\(/.test(content);
}

function usesImportedAdminApiGate(content) {
  return hasNamedImport(content, "requireAdminApiAccess", API_ACCESS_IMPORTS) && /\brequireAdminApiAccess\s*\(/.test(content);
}

let errors = 0;

const allRoutes = walkRoutes(ROOT);

for (const file of allRoutes) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const content = fs.readFileSync(file, "utf-8");

  // 检查是否在已知 API 能力前缀下
  const firstSegment = rel.split("/")[0];
  if (!KNOWN_PREFIXES.includes(firstSegment)) {
    console.error(`❌ ${rel} 缺少 API 能力前缀，应放到 /api/{auth,agent,settings,modules,integrations}/*`);
    errors++;
    continue;
  }

  const routePath = routePathFromRel(rel);
  const isExplicitNonL2 = isCoveredByExplicitNonL2Contract(routePath);
  const usesDirectAuthenticate = content.includes("authenticate(");
  const usesAuthWrapper = hasWithAuthImport(content) && (/with[A-Za-z]*(Access|Write|Delete|Auth)\s*\(/.test(content) || /withAuth\s*\(/.test(content));
  const usesRegistryGate = usesImportedApiGate(content) || usesAuthWrapper;
  const usesAdminGate = usesImportedAdminApiGate(content);

  if (firstSegment === "modules") {
    const parts = rel.split("/");
    const moduleName = parts[1];
    if (!KNOWN_MODULES.has(moduleName)) {
      console.error(`❌ ${rel} 的模块名未在 module-registry apiGuards 登记，应放到 /api/modules/<registered-module>/*`);
      errors++;
    }
    const l2Base = parts.length >= 3 ? `/api/modules/${parts[1]}/${parts[2]}` : null;
    if (
      !isCoveredByExplicitNonL2Contract(routePath) &&
      !isCoveredByL1OnlyContract(routePath) &&
      (!l2Base || !REGISTERED_L2_API_BASES.has(l2Base))
    ) {
      console.error(`❌ ${rel} 未命中注册的 L2 API base；应放到 /api/modules/<l1>/<registered-l2>/*，当前 L2 base 为 ${l2Base || "缺失"}`);
      errors++;
    }

    if (usesDirectAuthenticate) {
      console.error(`❌ ${rel} 业务 API 禁止裸用 authenticate()；入口必须走 requireApiAccess(request) 或已接入它的 with-auth wrapper`);
      errors++;
    }
    if (!isExplicitNonL2 && !usesRegistryGate) {
      console.error(`❌ ${rel} 缺少 registry 派生 API 门禁；请在 route 入口调用 requireApiAccess(request)，或使用 with-auth wrapper`);
      errors++;
    }
    if (
      content.includes("searchFkOptions(") &&
      !content.includes("definition.permission") &&
      !content.includes("authorizeFk")
    ) {
      console.error(`❌ ${rel} 调用 searchFkOptions() 前必须按 FK definition.permission 做 resource 授权，避免 FK 分支绕过 L2 权限`);
      errors++;
    }
  }

  if (firstSegment === "settings" && !PUBLIC_OR_DEV_API_ROUTES.has(rel)) {
    if (rel.startsWith("settings/account/")) {
      if (usesDirectAuthenticate) {
        console.error(`❌ ${rel} 账号自助 API 禁止裸用 authenticate()；必须从平台导入并调用 requireApiAccess(request)`);
        errors++;
      }
      if (!usesRegistryGate) {
        console.error(`❌ ${rel} 缺少 settings.account registry API 门禁；请从 @workspace/platform/server/auth 导入 requireApiAccess`);
        errors++;
      }
    } else if (rel.startsWith("settings/admin/")) {
      if (usesDirectAuthenticate) {
        console.error(`❌ ${rel} 系统管理 API 禁止裸用 authenticate()；必须使用 requireAdminApiAccess(request)`);
        errors++;
      }
      if (!usesAdminGate) {
        console.error(`❌ ${rel} 缺少 settings.admin 管理范围 API 门禁；请从 @workspace/platform/server/auth 导入 requireAdminApiAccess`);
        errors++;
      }
    }
  }

  if (firstSegment === "agent") {
    if (usesDirectAuthenticate || content.includes("getCurrentUser(") && !usesRegistryGate) {
      console.error(`❌ ${rel} Agent API 必须先走 requireApiAccess(request)，再读取 session user`);
      errors++;
    }
    if (!usesRegistryGate) {
      console.error(`❌ ${rel} 缺少 agent registry API 门禁；请从 @workspace/platform/server/auth 导入 requireApiAccess`);
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
