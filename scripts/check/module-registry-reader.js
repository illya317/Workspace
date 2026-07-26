const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const REGISTRY_GLOBS = [
  path.join(ROOT, "packages", "platform", "module-registry.ts"),
  path.join(ROOT, "packages", "platform", "module-registry-finance-operational-analytics.ts"),
  path.join(ROOT, "packages", "platform", "module-registry-hr-runtime.ts"),
  path.join(ROOT, "packages", "platform", "module-registry-work-runtime.ts"),
  path.join(ROOT, "packages", "platform", "module-registry-utils.ts"),
];

function getLine(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function getPropertyName(prop) {
  if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) {
    if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
      return prop.name.text;
    }
  }
  if (ts.isPropertyAssignment(prop) && ts.isComputedPropertyName(prop.name)) {
    if (ts.isStringLiteral(prop.name.expression)) {
      return prop.name.expression.text;
    }
  }
  return undefined;
}

function getObjectProperty(obj, name) {
  if (!ts.isObjectLiteralExpression(obj)) return undefined;
  for (const prop of obj.properties) {
    if (getPropertyName(prop) === name) return prop;
  }
  return undefined;
}

function getStringProperty(obj, name) {
  const prop = getObjectProperty(obj, name);
  if (!prop || !ts.isPropertyAssignment(prop)) return undefined;
  if (ts.isStringLiteral(prop.initializer)) return prop.initializer.text;
  return undefined;
}

function hasOwnProperty(obj, name) {
  return Boolean(getObjectProperty(obj, name));
}

function getChildren(obj) {
  const childrenProp = getObjectProperty(obj, "children");
  if (!childrenProp || !ts.isPropertyAssignment(childrenProp)) return [];
  if (!ts.isArrayLiteralExpression(childrenProp.initializer)) return [];
  return childrenProp.initializer.elements.filter(ts.isObjectLiteralExpression);
}

function getArrayObjectProperty(obj, name) {
  const prop = getObjectProperty(obj, name);
  if (!prop || !ts.isPropertyAssignment(prop)) return [];
  if (!ts.isArrayLiteralExpression(prop.initializer)) return [];
  return prop.initializer.elements.filter(ts.isObjectLiteralExpression);
}

function getArrayStringProperty(obj, name) {
  const prop = getObjectProperty(obj, name);
  if (!prop || !ts.isPropertyAssignment(prop)) return [];
  if (!ts.isArrayLiteralExpression(prop.initializer)) return [];
  return prop.initializer.elements
    .filter(ts.isStringLiteral)
    .map((literal) => ({
      value: literal.text,
      line: getLine(obj.getSourceFile(), literal.getStart(obj.getSourceFile())),
    }));
}

function getBoolProperty(obj, name) {
  const prop = getObjectProperty(obj, name);
  if (!prop || !ts.isPropertyAssignment(prop)) return undefined;
  if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function getNumberProperty(obj, name) {
  const prop = getObjectProperty(obj, name);
  if (!prop || !ts.isPropertyAssignment(prop)) return undefined;
  if (ts.isNumericLiteral(prop.initializer)) return Number(prop.initializer.text);
  return undefined;
}

function deriveApiKind(access, resourceKey) {
  if (access === "public") return "public";
  if (access === "dev") return "dev";
  if (access === "internal") return "internal";
  return resourceKey ? "business" : "session";
}

function normalizeApiPath(value) {
  return value && value.length > 1 ? value.replace(/\/+$/g, "") : value;
}

function pathMatchesPrefix(apiPath, pathPrefix) {
  return apiPath === pathPrefix || apiPath.startsWith(`${pathPrefix}/`);
}

function resourceKeyToApiSegments(resourceKey) {
  return resourceKey
    .split(".")
    .map((segment) => segment.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase());
}

function pushApiPrefix(prefixes, pathPrefix, resourceKey, source) {
  if (!pathPrefix || !resourceKey) return;
  prefixes.push({ pathPrefix: normalizeApiPath(pathPrefix), resourceKey, source });
}

function pushCanonicalApiPrefix(prefixes, resourceKey) {
  if (!resourceKey) return;
  pushApiPrefix(prefixes, `/api/modules/${resourceKeyToApiSegments(resourceKey).join("/")}`, resourceKey, "canonicalResourcePath");
}

function deriveApiResourcePrefixes(filePaths = REGISTRY_GLOBS) {
  const prefixes = [];
  for (const moduleDef of collectModuleDefs(filePaths)) {
    if (!moduleDef.resourceKey) continue;
    pushCanonicalApiPrefix(prefixes, moduleDef.resourceKey);
    for (const prefix of moduleDef.apiPrefixes ?? []) {
      pushApiPrefix(prefixes, prefix, moduleDef.resourceKey, "apiPrefixes");
    }
  }
  for (const resourceDef of collectResourceDefs(filePaths)) {
    pushCanonicalApiPrefix(prefixes, resourceDef.key);
    for (const prefix of resourceDef.apiPrefixes ?? []) {
      pushApiPrefix(prefixes, prefix, resourceDef.key, "apiPrefixes");
    }
  }
  return prefixes.sort((left, right) => {
    const lengthDelta = right.pathPrefix.length - left.pathPrefix.length;
    if (lengthDelta !== 0) return lengthDelta;
    const canonicalDelta = Number(right.source === "canonicalResourcePath") - Number(left.source === "canonicalResourcePath");
    if (canonicalDelta !== 0) return canonicalDelta;
    return left.resourceKey.localeCompare(right.resourceKey);
  });
}

function resolveApiResource(apiResourcePrefixes, apiPath) {
  const normalizedPath = normalizeApiPath(apiPath);
  return apiResourcePrefixes.find((prefix) => pathMatchesPrefix(normalizedPath, prefix.pathPrefix)) ?? null;
}

function resolveApiResourceKey(apiResourcePrefixes, apiPath) {
  return resolveApiResource(apiResourcePrefixes, apiPath)?.resourceKey ?? null;
}

function collectModuleDefsFromObject(sourceFile, filePath, moduleObj, output) {
  const moduleDefProp = getObjectProperty(moduleObj, "moduleDef");
  if (!moduleDefProp || !ts.isPropertyAssignment(moduleDefProp)) return;
  const moduleDef = moduleDefProp.initializer;
  if (!ts.isObjectLiteralExpression(moduleDef)) return;
  const key = getStringProperty(moduleDef, "key");
  if (!key) return;
  output.push({
    key,
    line: getLine(sourceFile, moduleDef.getStart(sourceFile)),
    filePath,
    node: moduleDef,
    href: getStringProperty(moduleDef, "href"),
    resourceKey: getStringProperty(moduleDef, "resourceKey"),
    hasResourceKey: hasOwnProperty(moduleDef, "resourceKey"),
    presentation: getStringProperty(moduleDef, "presentation"),
    noPageReason: getStringProperty(moduleDef, "noPageReason"),
    resourceHidden: getBoolProperty(moduleDef, "resourceHidden") ?? false,
    resourceSortOrder: getNumberProperty(moduleDef, "resourceSortOrder"),
    pageAccess: getStringProperty(moduleDef, "pageAccess") ?? null,
    apiPrefixes: getArrayStringProperty(moduleDef, "apiPrefixes").map((item) => item.value),
    noApiReason: getStringProperty(moduleDef, "noApiReason"),
    parentKey: null,
  });
  for (const child of getChildren(moduleDef)) {
    const childKey = getStringProperty(child, "key");
    if (!childKey) continue;
    output.push({
      key: `${key}.${childKey}`,
      line: getLine(sourceFile, child.getStart(sourceFile)),
      filePath,
      node: child,
      href: getStringProperty(child, "href"),
      resourceKey: getStringProperty(child, "resourceKey"),
      hasResourceKey: hasOwnProperty(child, "resourceKey"),
      presentation: getStringProperty(child, "presentation"),
      noPageReason: getStringProperty(child, "noPageReason"),
      resourceHidden: getBoolProperty(child, "resourceHidden") ?? false,
      resourceSortOrder: getNumberProperty(child, "resourceSortOrder"),
      pageAccess: getStringProperty(child, "pageAccess") ?? null,
      apiPrefixes: getArrayStringProperty(child, "apiPrefixes").map((item) => item.value),
      noApiReason: getStringProperty(child, "noApiReason"),
      parentKey: key,
    });
  }
}

function collectResourceDefsFromObject(sourceFile, filePath, moduleObj, output) {
  for (const resourceDef of getArrayObjectProperty(moduleObj, "resourceDefs")) {
    const key = getStringProperty(resourceDef, "key");
    if (!key) continue;
    output.push({
      key,
      line: getLine(sourceFile, resourceDef.getStart(sourceFile)),
      filePath,
      name: getStringProperty(resourceDef, "name"),
      kind: getStringProperty(resourceDef, "kind") ?? null,
      capabilityOwnerKey: getStringProperty(resourceDef, "capabilityOwnerKey") ?? null,
      parentKey: getStringProperty(resourceDef, "parentKey") ?? null,
      runtimeParentKey: getStringProperty(resourceDef, "runtimeParentKey") ?? null,
      apiPrefixes: getArrayStringProperty(resourceDef, "apiPrefixes").map((item) => item.value),
      hidden: getBoolProperty(resourceDef, "hidden") ?? false,
    });
  }
}

function collectApiContractsFromObject(sourceFile, filePath, moduleObj, output, apiResourcePrefixes) {
  for (const guard of getArrayObjectProperty(moduleObj, "apiGuards")) {
    const method = getStringProperty(guard, "method");
    const pathPrefix = getStringProperty(guard, "pathPrefix");
    const resourceKey = pathPrefix ? resolveApiResourceKey(apiResourcePrefixes, pathPrefix) : null;
    if (!pathPrefix) continue;
    output.push({
      method,
      pathPrefix,
      apiKind: "business",
      resourceKey,
      access: "protected",
      line: getLine(sourceFile, guard.getStart(sourceFile)),
      filePath,
      source: "apiGuards",
      migrationNote: getStringProperty(guard, "migrationNote") ?? null,
      notes: getStringProperty(guard, "notes") ?? null,
    });
  }
  for (const route of getArrayObjectProperty(moduleObj, "apiRoutes")) {
    const method = getStringProperty(route, "method");
    const pathPrefix = getStringProperty(route, "pathPrefix");
    const access = getStringProperty(route, "access") ?? null;
    const resourceKey = access === "protected" && pathPrefix ? resolveApiResourceKey(apiResourcePrefixes, pathPrefix) : null;
    if (!pathPrefix) continue;
    output.push({
      method,
      pathPrefix,
      apiKind: deriveApiKind(access, resourceKey ?? null),
      resourceKey: resourceKey ?? null,
      access,
      line: getLine(sourceFile, route.getStart(sourceFile)),
      filePath,
      source: "apiRoutes",
      migrationNote: getStringProperty(route, "migrationNote") ?? null,
      notes: getStringProperty(route, "notes") ?? null,
    });
  }
}

function parseMethodList(methodListText) {
  if (!methodListText) return DEFAULT_API_METHODS;
  const methods = [...methodListText.matchAll(/["'](GET|POST|PUT|PATCH|DELETE)["']/g)].map((match) => match[1]);
  return methods.length > 0 ? methods : DEFAULT_API_METHODS;
}

function collectRoutesFromObject(sourceFile, filePath, moduleObj, output) {
  const routesProp = getObjectProperty(moduleObj, "routes");
  if (!routesProp || !ts.isPropertyAssignment(routesProp)) return;
  if (!ts.isArrayLiteralExpression(routesProp.initializer)) return;
  for (const route of routesProp.initializer.elements) {
    if (ts.isStringLiteral(route)) {
      output.push({
        route: route.text,
        line: getLine(sourceFile, route.getStart(sourceFile)),
        filePath,
        access: null,
        resourceKey: null,
        gatePath: null,
        notes: null,
      });
      continue;
    }
    if (!ts.isObjectLiteralExpression(route)) continue;
    const routePath = getStringProperty(route, "path");
    if (!routePath) continue;
    output.push({
      route: routePath,
      line: getLine(sourceFile, route.getStart(sourceFile)),
      filePath,
      access: getStringProperty(route, "access") ?? null,
      resourceKey: getStringProperty(route, "resourceKey") ?? null,
      gatePath: getStringProperty(route, "gatePath") ?? null,
      notes: getStringProperty(route, "notes") ?? null,
    });
  }
}

function collectModuleDefs(filePaths = REGISTRY_GLOBS) {
  const output = [];
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    function visit(node) {
      if (ts.isObjectLiteralExpression(node)) {
        collectModuleDefsFromObject(sourceFile, filePath, node, output);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }
  return output;
}

function collectResourceDefs(filePaths = REGISTRY_GLOBS) {
  const output = [];
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    function visit(node) {
      if (ts.isObjectLiteralExpression(node)) {
        collectResourceDefsFromObject(sourceFile, filePath, node, output);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }
  return output;
}

function collectRoutes(filePaths = REGISTRY_GLOBS) {
  const output = [];
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    function visit(node) {
      if (ts.isObjectLiteralExpression(node)) {
        collectRoutesFromObject(sourceFile, filePath, node, output);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }
  return output;
}

function collectApiContracts(filePaths = REGISTRY_GLOBS) {
  const output = [];
  const apiResourcePrefixes = deriveApiResourcePrefixes(filePaths);
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    if (filePath.endsWith("module-registry-utils.ts")) {
      for (const match of text.matchAll(/\{\s*method:\s*["'](GET|POST|PUT|PATCH|DELETE)["']\s*,\s*pathPrefix:\s*["']([^"']+)["']\s*,\s*access:\s*["']([^"']+)["'](?:\s*,\s*notes:\s*["']([^"']+)["'])?/g)) {
        output.push({
          method: match[1],
          pathPrefix: match[2],
          apiKind: deriveApiKind(match[3], null),
          resourceKey: null,
          access: match[3],
          line: getLine(sourceFile, match.index ?? 0),
          filePath,
          source: "apiRoutes",
          notes: match[4] ?? null,
        });
      }
    }

    for (const match of text.matchAll(/apiResourceGuards\(\s*["']([^"']+)["'](?:\s*,\s*\[([\s\S]*?)\])?/g)) {
      const resourceKey = resolveApiResourceKey(apiResourcePrefixes, match[1]);
      for (const method of parseMethodList(match[2])) {
        output.push({
          method,
          pathPrefix: match[1],
          apiKind: "business",
          resourceKey,
          access: "protected",
          line: getLine(sourceFile, match.index ?? 0),
          filePath,
          source: "apiResourceGuards",
          notes: null,
        });
      }
    }
    for (const match of text.matchAll(/apiRoutes\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["'](?:\s*,\s*\[([\s\S]*?)\])?/g)) {
      for (const method of parseMethodList(match[3])) {
        output.push({
          method,
          pathPrefix: match[1],
          apiKind: deriveApiKind(match[2], null),
          resourceKey: null,
          access: match[2],
          line: getLine(sourceFile, match.index ?? 0),
          filePath,
          source: "apiRoutes",
          notes: null,
        });
      }
    }

    function visit(node) {
      if (ts.isObjectLiteralExpression(node)) {
        collectApiContractsFromObject(sourceFile, filePath, node, output, apiResourcePrefixes);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }
  return output;
}

module.exports = {
  ROOT,
  REGISTRY_GLOBS,
  collectApiContracts,
  collectModuleDefs,
  collectResourceDefs,
  collectRoutes,
};
