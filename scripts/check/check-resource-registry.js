#!/usr/bin/env node

const path = require("path");
const {
  collectApiContracts,
  collectModuleDefs,
  collectResourceDefs,
  REGISTRY_GLOBS,
  ROOT,
} = require("./module-registry-reader");

const VALID_MAX_ROLES = new Set(["access", "write", "delete", "admin"]);
const VALID_KINDS = new Set(["capability"]);
const REQUIRED_STANDARD_SETTINGS_L2 = new Set(["settings.account", "settings.admin", "settings.api"]);
function kebabCase(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function canonicalApiBase(moduleDef) {
  if (!moduleDef.parentKey) return null;
  const childKey = moduleDef.key.slice(`${moduleDef.parentKey}.`.length);
  if (moduleDef.parentKey === "settings") return `/api/settings/${kebabCase(childKey)}`;
  return `/api/modules/${moduleDef.parentKey}/${kebabCase(childKey)}`;
}

function deriveResources(moduleDefs) {
  return moduleDefs
    .filter((moduleDef) => moduleDef.resourceKey)
    .map((moduleDef) => ({
      key: moduleDef.resourceKey,
      line: moduleDef.line,
      filePath: moduleDef.filePath,
      name: moduleDef.key,
      kind: null,
      capabilityOwnerKey: null,
      parentKey: moduleDef.parentKey
        ? moduleDefs.find((candidate) => candidate.key === moduleDef.parentKey)?.resourceKey ?? moduleDef.parentKey
        : null,
      runtimeParentKey: null,
      maxRoleKey: moduleDef.resourceMaxRoleKey ?? null,
      hidden: moduleDef.resourceHidden ?? false,
      derived: true,
    }));
}

function displayPath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function runCheck() {
  const modules = collectModuleDefs();
  const explicitResources = collectResourceDefs();
  const derivedResources = deriveResources(modules);
  const resources = [...derivedResources, ...explicitResources];
  const apiContracts = collectApiContracts();
  const violations = [];
  const byKey = new Map();
  const moduleDefKeys = new Set(modules.filter((moduleDef) => !moduleDef.parentKey).map((moduleDef) => moduleDef.key));
  const l2ResourceKeys = new Set(modules.filter((moduleDef) => moduleDef.parentKey).map((moduleDef) => moduleDef.resourceKey).filter(Boolean));
  const modulesWithChildren = new Set(modules.filter((moduleDef) => moduleDef.parentKey).map((moduleDef) => moduleDef.parentKey));
  const l1OnlyResourceKeys = new Set(
    modules
      .filter((moduleDef) => !moduleDef.parentKey && moduleDef.resourceKey && !modulesWithChildren.has(moduleDef.key))
      .map((moduleDef) => moduleDef.resourceKey),
  );
  const derivedResourceKeys = new Set(derivedResources.map((resource) => resource.key));
  const apiByPrefix = new Map(apiContracts.map((contract) => [contract.pathPrefix, contract]));

  for (const resourceKey of REQUIRED_STANDARD_SETTINGS_L2) {
    const moduleDef = modules.find((item) => item.resourceKey === resourceKey);
    if (!moduleDef) {
      violations.push({
        filePath: REGISTRY_GLOBS[0],
        line: 1,
        message: `Settings 标准 L2 缺少注册: ${resourceKey}`,
      });
      continue;
    }
    if (moduleDef.resourceHidden) {
      violations.push({
        filePath: moduleDef.filePath,
        line: moduleDef.line,
        message: `Settings 标准 L2 "${resourceKey}" 不能隐藏，必须进入普通 RBAC/resource 树`,
      });
    }
  }

  for (const resource of explicitResources) {
    if (derivedResourceKeys.has(resource.key)) {
      violations.push({
        filePath: resource.filePath,
        line: resource.line,
        message: `L1/L2 主资源 "${resource.key}" 由 moduleDef 自动派生，不能在 resourceDefs 中重复手写`,
      });
    }
  }

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
    if (resource.kind && !VALID_KINDS.has(resource.kind)) {
      violations.push({
        filePath: resource.filePath,
        line: resource.line,
        message: `资源 "${resource.key}" 的 kind 无效: ${resource.kind}`,
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
    if (resource.runtimeParentKey && !byKey.has(resource.runtimeParentKey)) {
      violations.push({
        filePath: resource.filePath,
        line: resource.line,
        message: `资源 "${resource.key}" 的 runtimeParentKey 未注册: ${resource.runtimeParentKey}`,
      });
    }
    if (resource.kind === "capability") {
      if (!resource.capabilityOwnerKey) {
        violations.push({
          filePath: resource.filePath,
          line: resource.line,
          message: `capability 资源 "${resource.key}" 必须声明 capabilityOwnerKey`,
        });
      } else if (!byKey.has(resource.capabilityOwnerKey)) {
        violations.push({
          filePath: resource.filePath,
          line: resource.line,
          message: `capability 资源 "${resource.key}" 的 capabilityOwnerKey 未注册: ${resource.capabilityOwnerKey}`,
        });
      } else if (!l2ResourceKeys.has(resource.capabilityOwnerKey) && !l1OnlyResourceKeys.has(resource.capabilityOwnerKey)) {
        violations.push({
          filePath: resource.filePath,
          line: resource.line,
          message: `capability 资源 "${resource.key}" 的 capabilityOwnerKey 必须归属于已注册 L2 或无 L2 的 L1: ${resource.capabilityOwnerKey}`,
        });
      }
      if (resource.parentKey) {
        violations.push({
          filePath: resource.filePath,
          line: resource.line,
          message: `capability 资源 "${resource.key}" 不能使用 parentKey 继承所属 L2 权限`,
        });
      }
    } else if (resource.capabilityOwnerKey) {
      violations.push({
        filePath: resource.filePath,
        line: resource.line,
        message: `非 capability 资源 "${resource.key}" 不能声明 capabilityOwnerKey`,
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
    if (!moduleDef.parentKey) {
      if (moduleDef.presentation === "headless") {
        if (!moduleDef.noPageReason) {
          violations.push({
            filePath: moduleDef.filePath,
            line: moduleDef.line,
            message: `headless 模块 "${moduleDef.key}" 必须声明 noPageReason`,
          });
        }
      } else if (moduleDef.resourceKey && moduleDef.resourceKey !== moduleDef.key) {
        violations.push({
          filePath: moduleDef.filePath,
          line: moduleDef.line,
          message: `L1 模块 "${moduleDef.key}" 的 resourceKey 必须等于 module key，当前为 ${moduleDef.resourceKey}`,
        });
      }
      continue;
    }

    if (!moduleDefKeys.has(moduleDef.parentKey)) {
      violations.push({
        filePath: moduleDef.filePath,
        line: moduleDef.line,
        message: `L2 "${moduleDef.key}" 的 parent module 未注册: ${moduleDef.parentKey}`,
      });
    }
    if (moduleDef.resourceKey !== moduleDef.key) {
      violations.push({
        filePath: moduleDef.filePath,
        line: moduleDef.line,
        message: `L2 "${moduleDef.key}" 的 resourceKey 必须等于 L2 key，当前为 ${moduleDef.resourceKey}`,
      });
    }
    const apiPrefixes = moduleDef.apiPrefixes || [];
    const expectedApiBase = canonicalApiBase(moduleDef);
    if (apiPrefixes.length === 0 && !moduleDef.noApiReason) {
      violations.push({
        filePath: moduleDef.filePath,
        line: moduleDef.line,
        message: `L2 "${moduleDef.key}" 必须声明 apiPrefixes 或 noApiReason`,
      });
    }
    if (apiPrefixes.length > 0 && moduleDef.noApiReason) {
      violations.push({
        filePath: moduleDef.filePath,
        line: moduleDef.line,
        message: `L2 "${moduleDef.key}" 不能同时声明 apiPrefixes 和 noApiReason`,
      });
    }
    if (apiPrefixes.length > 0) {
      if (apiPrefixes.length !== 1 || apiPrefixes[0] !== expectedApiBase) {
        violations.push({
          filePath: moduleDef.filePath,
          line: moduleDef.line,
          message: `L2 "${moduleDef.key}" 的 API base 必须等于 ${expectedApiBase}，当前为 ${apiPrefixes.join(", ")}`,
        });
      }
    }
    for (const prefix of apiPrefixes) {
      const contract = apiByPrefix.get(prefix);
      if (!contract) {
        violations.push({
          filePath: moduleDef.filePath,
          line: moduleDef.line,
          message: `L2 "${moduleDef.key}" 声明的 API prefix 未注册 contract: ${prefix}`,
        });
        continue;
      }
      if (contract.resourceKey && contract.resourceKey !== moduleDef.resourceKey) {
        violations.push({
          filePath: moduleDef.filePath,
          line: moduleDef.line,
          message: `L2 "${moduleDef.key}" 的 API prefix ${prefix} 绑定到 ${contract.resourceKey}，应为 ${moduleDef.resourceKey}`,
        });
      }
      if (!contract.resourceKey) {
        violations.push({
          filePath: moduleDef.filePath,
          line: moduleDef.line,
          message: `L2 "${moduleDef.key}" 的 API prefix ${prefix} 未绑定 resourceKey`,
        });
      }
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
