#!/usr/bin/env node
/**
 * API Route Governance Check
 *
 * 规则：
 * 1. 已废弃的兼容路由（旧入口）只能包含纯代理逻辑
 * 2. 新业务 API 必须放在 /api/modules/<module>/* 下；旧一级业务目录仅作为兼容期 baseline
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../app/api");

// 已知兼容路由：只能纯代理
const LEGACY_ROUTES = [
  "employees",
  "positions",
  "departments",
  "employee-positions",
  "employee-projects",
  "projects",
];

const ALLOWED_LEGACY_PATTERNS = [
  /new URL\(/,
  /fetch\(/,
  /request\.url/,
  /request\.headers/,
  /request\.method/,
  /request\.text\(/,
  /await request\.text\(/,
  /export async function/,
  /^\s*\/\//,
  /^\s*$/,
  /^\s*\*\s*/,
  /^\s*@deprecated/,
  /^\s*\/\*\*/,
  /^\s*\*\/\s*$/,
  /proxy/,
  /target/,
  /url/,
  /origin/,
  /search/,
  /searchParams/,
  /pageSize/,
  /headers/,
  /method/,
  /body/,
  /return/,
  /\{/,
  /\}/,
  /^\s*import/,
  /^\s*const\s+url/,
  /^\s*const\s+target/,
];

const FORBIDDEN_LEGACY_PATTERNS = [
  /prisma\./,
  /NextResponse\.json\(.*\{/,
  /checkHRAccess/,
  /checkHRWrite/,
  /checkPermission/,
  /handleUpdateField/,
  /handleDelete/,
  /handleCreate/,
];

function isPureProxy(content) {
  const lines = content.split("\n");
  const codeLines = lines.filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  });

  // 如果包含任何禁止模式，就不是纯代理
  for (const line of codeLines) {
    for (const pattern of FORBIDDEN_LEGACY_PATTERNS) {
      if (pattern.test(line)) return false;
    }
  }

  // 检查是否有代理模式（inline 或 createProxyHandler）
  const hasProxy = codeLines.some((l) =>
    /fetch\(|new URL\(|target|create(?:Compatibility|ValidatedId)?ProxyHandler/.test(l)
  );
  return hasProxy;
}

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

const COMPATIBILITY_PREFIXES = [
  "admin",
  "agent",
  "finance",
  "hr",
  "inventory",
  "contracts",
  "library",
  "dev-login-bypass",
  "reports",
  "user",
  "week-info",
  "works",
  "work",
  "my-api-key",
  "my-targets",
  "position-descriptions",
  "employments",
  "production",
];

const KNOWN_MODULES = [
  "administration",
  "finance",
  "hr",
  "library",
  "production",
  "work",
];

let errors = 0;

const allRoutes = walkRoutes(ROOT);

for (const file of allRoutes) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const content = fs.readFileSync(file, "utf-8");

  // 判断是否属于 legacy 路由（包括子目录）
  const isLegacy = LEGACY_ROUTES.some(
    (r) => rel.startsWith(r + "/") || rel === r + "/route.ts"
  );

  if (isLegacy) {
    if (!content.includes("@deprecated")) {
      console.error(`❌ ${rel} 缺少 @deprecated 标记`);
      errors++;
      continue;
    }

    if (!isPureProxy(content)) {
      console.error(`❌ ${rel} 包含非代理业务逻辑（必须纯代理）`);
      errors++;
    } else {
      console.log(`✓ ${rel} 纯代理`);
    }
    continue;
  }

  // 非 legacy：检查是否在已知 API 能力前缀或兼容 baseline 下
  const firstSegment = rel.split("/")[0];
  if (!KNOWN_PREFIXES.includes(firstSegment) && !COMPATIBILITY_PREFIXES.includes(firstSegment)) {
    console.error(`❌ ${rel} 缺少 API 能力前缀，应放到 /api/{auth,me,system,modules,integrations}/*`);
    errors++;
    continue;
  }

  if (firstSegment === "modules") {
    const moduleName = rel.split("/")[1];
    if (!KNOWN_MODULES.includes(moduleName)) {
      console.error(`❌ ${rel} 的模块名未登记，应放到 /api/modules/<registered-module>/*`);
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
