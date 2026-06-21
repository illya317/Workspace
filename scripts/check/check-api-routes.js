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

const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const ROOT = path.join(WORKSPACE_ROOT, "app/api");
const MODULE_REGISTRY = path.join(WORKSPACE_ROOT, "packages/platform/module-registry.ts");
const DIRECT_AUTH_DISABLED_GUARD_BASELINE = new Set([
  "modules/hr/autocomplete/route.ts",
  "modules/hr/companies/route.ts",
  "modules/hr/company-relations/route.ts",
  "modules/hr/contracts/[id]/route.ts",
  "modules/hr/contracts/route.ts",
  "modules/hr/edps/route.ts",
  "modules/hr/employee-profiles/[id]/contracts/route.ts",
  "modules/hr/employee-profiles/[id]/edps/route.ts",
  "modules/hr/employee-profiles/[id]/history/route.ts",
  "modules/hr/employee-profiles/[id]/route.ts",
  "modules/hr/employees/search/route.ts",
  "modules/hr/employments/route.ts",
  "modules/hr/position-description-templates/route.ts",
  "modules/hr/position-descriptions/route.ts",
  "modules/hr/positions/route.ts",
  "modules/hr/roster/route.ts",
]);

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
  "auth",
  "integrations",
  "me",
  "modules",
  "system",
];

function registeredApiModules() {
  const source = fs.readFileSync(MODULE_REGISTRY, "utf8");
  return new Set(
    Array.from(source.matchAll(/apiResourceGuards\(\s*["']\/api\/modules\/([^/"']+)/g))
      .map((match) => match[1])
  );
}

const KNOWN_MODULES = registeredApiModules();

let errors = 0;

const allRoutes = walkRoutes(ROOT);

for (const file of allRoutes) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const content = fs.readFileSync(file, "utf-8");

  // 检查是否在已知 API 能力前缀下
  const firstSegment = rel.split("/")[0];
  if (!KNOWN_PREFIXES.includes(firstSegment)) {
    console.error(`❌ ${rel} 缺少 API 能力前缀，应放到 /api/{auth,me,system,modules,integrations}/*`);
    errors++;
    continue;
  }

  if (firstSegment === "modules") {
    const moduleName = rel.split("/")[1];
    if (!KNOWN_MODULES.has(moduleName)) {
      console.error(`❌ ${rel} 的模块名未在 module-registry apiGuards 登记，应放到 /api/modules/<registered-module>/*`);
      errors++;
    }

    const usesDirectAuthenticate = content.includes("authenticate(");
    const hasDisabledRuntimeGuard = content.includes("disabledApiResponseForRequest");
    const usesAuthWrapper = /with[A-Za-z]*Access\s*\(/.test(content) || /withAuth\s*\(/.test(content);
    if (
      usesDirectAuthenticate &&
      !hasDisabledRuntimeGuard &&
      !usesAuthWrapper &&
      !DIRECT_AUTH_DISABLED_GUARD_BASELINE.has(rel)
    ) {
      console.error(`❌ ${rel} 手写 authenticate() 时必须先调用 disabledApiResponseForRequest()，避免 contract disabled 后仍进入业务逻辑`);
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
