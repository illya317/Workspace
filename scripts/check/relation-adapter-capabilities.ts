import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { RelationAdapterCapabilities } from "./relation-policy-coverage";

function propertyName(node: ts.ObjectLiteralElementLike) {
  if (!node.name) return null;
  return ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
}

function stringConstants(sourceFile: ts.SourceFile) {
  const constants = new Map<string, string>();
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isStringLiteral(node.initializer)) {
      constants.set(node.name.text, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return constants;
}

function relationKeyFromObject(node: ts.ObjectLiteralExpression, constants: ReadonlyMap<string, string>) {
  const relationKey = node.properties.find((property) => propertyName(property) === "relationKey");
  if (!relationKey || !ts.isPropertyAssignment(relationKey)) return null;
  if (ts.isStringLiteral(relationKey.initializer)) return relationKey.initializer.text;
  if (ts.isIdentifier(relationKey.initializer)) return constants.get(relationKey.initializer.text) ?? null;
  return null;
}

function adapterCapabilitiesFromObject(node: ts.ObjectLiteralExpression) {
  const names = new Set(node.properties.map(propertyName).filter((name): name is string => Boolean(name)));
  if (!names.has("relationKey") || !names.has("inspect")) return null;
  return {
    listInbound: true,
    unlink: names.has("unlink"),
    cascade: names.has("cascade"),
  } satisfies RelationAdapterCapabilities;
}

function mergeCapabilities(
  capabilities: Map<string, RelationAdapterCapabilities>,
  relationKey: string,
  discovered: RelationAdapterCapabilities,
) {
  const previous = capabilities.get(relationKey);
  capabilities.set(relationKey, {
    listInbound: previous?.listInbound === true || discovered.listInbound,
    unlink: previous?.unlink === true || discovered.unlink,
    cascade: previous?.cascade === true || discovered.cascade,
  });
}

export function listRelationAdapterCapabilitiesFromSource(source: string, fileName = "adapter.ts") {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const constants = stringConstants(sourceFile);
  const capabilities = new Map<string, RelationAdapterCapabilities>();
  const factoryCapabilities = new Map<string, RelationAdapterCapabilities>();

  function findFactoryCapabilities(node: ts.FunctionDeclaration) {
    if (!node.name || !node.body) return;
    let found: RelationAdapterCapabilities | null = null;
    function inspect(child: ts.Node) {
      if (found) return;
      if (ts.isObjectLiteralExpression(child)) found = adapterCapabilitiesFromObject(child);
      if (!found) ts.forEachChild(child, inspect);
    }
    inspect(node.body);
    if (found) factoryCapabilities.set(node.name.text, found);
  }

  function collectFactories(node: ts.Node) {
    if (ts.isFunctionDeclaration(node)) findFactoryCapabilities(node);
    ts.forEachChild(node, collectFactories);
  }
  collectFactories(sourceFile);

  function visit(node: ts.Node) {
    if (ts.isObjectLiteralExpression(node)) {
      const relationKey = relationKeyFromObject(node, constants);
      const discovered = adapterCapabilitiesFromObject(node);
      if (relationKey && discovered) mergeCapabilities(capabilities, relationKey, discovered);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const factory = factoryCapabilities.get(node.expression.text);
      const argument = node.arguments[0];
      if (factory && argument && ts.isObjectLiteralExpression(argument)) {
        const relationKey = relationKeyFromObject(argument, constants);
        if (relationKey) mergeCapabilities(capabilities, relationKey, factory);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return capabilities;
}

function walkServerFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return walkServerFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test.") ? [fullPath] : [];
  });
}

export function discoverRelationAdapterCapabilities(repositoryRoot: string) {
  const result = new Map<string, RelationAdapterCapabilities>();
  const packageRoot = path.join(repositoryRoot, "packages");
  for (const packageName of fs.readdirSync(packageRoot).sort()) {
    const serverRoot = path.join(packageRoot, packageName, "server");
    for (const filePath of walkServerFiles(serverRoot).sort()) {
      const discovered = listRelationAdapterCapabilitiesFromSource(fs.readFileSync(filePath, "utf8"), filePath);
      for (const [relationKey, capabilities] of discovered) {
        const previous = result.get(relationKey);
        result.set(relationKey, {
          listInbound: previous?.listInbound === true || capabilities.listInbound,
          unlink: previous?.unlink === true || capabilities.unlink,
          cascade: previous?.cascade === true || capabilities.cascade,
        });
      }
    }
  }
  return result;
}
