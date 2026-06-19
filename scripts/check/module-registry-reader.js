const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");
const REGISTRY_GLOBS = [
  path.join(ROOT, "packages", "platform", "modules.tsx"),
  path.join(ROOT, "packages", "hr", "module.ts"),
  path.join(ROOT, "packages", "production", "module.ts"),
  path.join(ROOT, "packages", "finance", "module.ts"),
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
      parentKey: getStringProperty(resourceDef, "parentKey") ?? null,
      maxRoleKey: getStringProperty(resourceDef, "maxRoleKey") ?? null,
    });
  }
}

function collectRoutesFromObject(sourceFile, filePath, moduleObj, output) {
  for (const route of getArrayStringProperty(moduleObj, "routes")) {
    output.push({
      route: route.value,
      line: route.line,
      filePath,
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

module.exports = {
  ROOT,
  REGISTRY_GLOBS,
  collectModuleDefs,
  collectResourceDefs,
  collectRoutes,
};
