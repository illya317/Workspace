#!/usr/bin/env node

const path = require("path");
const {
  collectModuleDefs,
  collectResourceDefs,
  REGISTRY_GLOBS,
  ROOT,
} = require("./module-registry-reader");

const VALID_MAX_ROLES = new Set(["access", "write", "delete", "admin"]);

function displayPath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function runCheck() {
  const modules = collectModuleDefs();
  const resources = collectResourceDefs();
  const violations = [];
  const byKey = new Map();

  for (const resource of resources) {
    const existing = byKey.get(resource.key);
    if (existing) {
      violations.push({
        filePath: resource.filePath,
        line: resource.line,
        message: `资源 "${resource.key}" 重复注册，首次出现在 ${displayPath(existing.filePath)}:${existing.line}`,
      });
    } else {
      byKey.set(resource.key, resource);
    }
    if (!resource.name) {
      violations.push({
        filePath: resource.filePath,
        line: resource.line,
        message: `资源 "${resource.key}" 缺少 name`,
      });
    }
    if (resource.maxRoleKey && !VALID_MAX_ROLES.has(resource.maxRoleKey)) {
      violations.push({
        filePath: resource.filePath,
        line: resource.line,
        message: `资源 "${resource.key}" 的 maxRoleKey 无效: ${resource.maxRoleKey}`,
      });
    }
  }

  for (const resource of resources) {
    if (resource.parentKey && !byKey.has(resource.parentKey)) {
      violations.push({
        filePath: resource.filePath,
        line: resource.line,
        message: `资源 "${resource.key}" 的 parentKey 未注册: ${resource.parentKey}`,
      });
    }
  }

  for (const moduleDef of modules) {
    if (moduleDef.resourceKey && !byKey.has(moduleDef.resourceKey)) {
      violations.push({
        filePath: moduleDef.filePath,
        line: moduleDef.line,
        message: `模块 "${moduleDef.key}" 的 resourceKey 未注册: ${moduleDef.resourceKey}`,
      });
    }
  }

  if (violations.length > 0) {
    console.error("✗ Resource registry check failed.");
    for (const v of violations) {
      console.error(`  ${displayPath(v.filePath)}:${v.line} — ${v.message}`);
    }
    return false;
  }

  console.log(`✓ Resource registry check passed (${resources.length} resources in ${REGISTRY_GLOBS.length} files).`);
  return true;
}

process.exit(runCheck() ? 0 : 1);
