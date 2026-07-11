#!/usr/bin/env node

const path = require("path");
const { collectModuleDefs, collectRoutes, REGISTRY_GLOBS, ROOT } = require("./module-registry-reader");

const WHITELIST_MODULES = new Set(["settings"]);

function displayPath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function getPathViolation(value) {
  if (!value) return null;
  if (value.startsWith("@workspace/")) return "不能把 package 名写进 URL，请使用站内路径如 /hr/roster";
  if (value.startsWith("/workspace/")) return "不能手写 basePath /workspace，请使用不带 basePath 的站内路径";
  if (!value.startsWith("/")) return "必须使用以 / 开头的站内绝对路径";
  return null;
}

function runCheck() {
  const moduleDefs = collectModuleDefs();
  const routes = collectRoutes();
  const violations = [];
  for (const def of moduleDefs) {
    const isWhitelisted = !def.parentKey && WHITELIST_MODULES.has(def.key);
    if (!isWhitelisted && !def.hasResourceKey) {
      violations.push({
        filePath: def.filePath,
        line: def.line,
        message: `${def.parentKey ? "子模块" : "模块"} "${def.key}" 缺少 resourceKey`,
      });
    }
    const hrefViolation = getPathViolation(def.href);
    if (hrefViolation) {
      violations.push({
        filePath: def.filePath,
        line: def.line,
        message: `${def.parentKey ? "子模块" : "模块"} "${def.key}" href="${def.href}" 无效：${hrefViolation}`,
      });
    }
  }
  for (const route of routes) {
    const routeViolation = getPathViolation(route.route);
    if (routeViolation) {
      violations.push({
        filePath: route.filePath,
        line: route.line,
        message: `routes 包含无效路径 "${route.route}"：${routeViolation}`,
      });
    }
  }

  if (violations.length > 0) {
    console.error("✗ Module registry access gate check failed.");
    for (const v of violations) {
      console.error(`  ${displayPath(v.filePath)}:${v.line} — ${v.message}`);
    }
    return false;
  }

  console.log("✓ Module registry access gate check passed.");
  return true;
}

function runFixtures() {
  const fs = require("fs");
  const os = require("os");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "module-registry-fixtures-"));
  const fixturePath = path.join(tmpDir, "module.ts");
  const cases = [
    {
      label: "parent missing gate, child has gate -> fail",
      text: `export const pkg = { moduleDef: { key: "finance", label: "财务", href: "/finance", iconKey: "finance", color: "amber", children: [{ key: "tax", label: "税务", href: "/finance/tax", resourceKey: "finance.tax" }] } };`,
      expectedOk: false,
    },
    {
      label: "parent has gate, child has gate -> pass",
      text: `export const pkg = { moduleDef: { key: "finance", label: "财务", href: "/finance", iconKey: "finance", color: "amber", resourceKey: "finance", children: [{ key: "tax", label: "税务", href: "/finance/tax", resourceKey: "finance.tax" }] } };`,
      expectedOk: true,
    },
    {
      label: "settings module without gate -> pass",
      text: `export const pkg = { moduleDef: { key: "settings", label: "设置", href: "/settings", iconKey: "settings", color: "orange" } };`,
      expectedOk: true,
    },
    {
      label: "package name used as href -> fail",
      text: `export const pkg = { moduleDef: { key: "hr", label: "人事", href: "/hr", iconKey: "hr", color: "blue", resourceKey: "hr", children: [{ key: "roster", label: "花名册", href: "@workspace/hr/roster", resourceKey: "hr.roster" }] } };`,
      expectedOk: false,
    },
    {
      label: "basePath used as href -> fail",
      text: `export const pkg = { moduleDef: { key: "hr", label: "人事", href: "/workspace/hr", iconKey: "hr", color: "blue", resourceKey: "hr" } };`,
      expectedOk: false,
    },
    {
      label: "package name used as route -> fail",
      text: `export const pkg = { moduleDef: { key: "hr", label: "人事", href: "/hr", iconKey: "hr", color: "blue", resourceKey: "hr" }, routes: ["/hr", "@workspace/hr/roster"] };`,
      expectedOk: false,
    },
  ];

  let allPassed = true;
  for (const c of cases) {
    fs.writeFileSync(fixturePath, c.text);
    const defs = collectModuleDefs([fixturePath]);
    const routes = collectRoutes([fixturePath]);
    const ok = defs.every((def) => {
      const isWhitelisted = !def.parentKey && WHITELIST_MODULES.has(def.key);
      return (isWhitelisted || def.hasResourceKey) && !getPathViolation(def.href);
    }) && routes.every((route) => !getPathViolation(route.route));
    if (ok !== c.expectedOk) {
      allPassed = false;
      console.error(`  ✗ fixture "${c.label}": expected ${c.expectedOk ? "pass" : "fail"}, got ${ok ? "pass" : "fail"}`);
    } else {
      console.log(`  ✓ fixture "${c.label}" ${c.expectedOk ? "passes" : "fails"} as expected`);
    }
  }
  return allPassed;
}

if (process.argv.includes("--fixtures")) {
  console.log(`Checking fixtures for ${REGISTRY_GLOBS.length} registry files...`);
  process.exit(runFixtures() ? 0 : 1);
}

process.exit(runCheck() ? 0 : 1);
