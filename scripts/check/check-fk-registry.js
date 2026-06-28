#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..");
const REGISTRY_PATH = path.join(ROOT, "packages", "platform", "module-registry.ts");
const RESOLVE_FK_PATH = path.join(ROOT, "packages", "platform", "server", "resolve-fk.ts");
const LEGACY_FK_KEYS = new Set(["employee"]);
const REQUIRED_PROPERTIES = ["key", "scope", "source", "target", "nullable", "permission"];
const SOURCE_PROPERTIES = ["entity", "field"];
const PERMISSION_PROPERTIES = ["resourceKey", "action"];
const HISTORY_FK_FIELDS = [
  ["Employee", "userId"],
  ["Employment", "employeeId"],
  ["CompanyRelation", "parentId"],
  ["CompanyRelation", "childId"],
  ["Department", "parentId"],
  ["Department", "managerUserId"],
  ["Position", "departmentId"],
  ["Position", "positionDescriptionId"],
  ["EDP", "employeeId"],
  ["EDP", "departmentId"],
  ["EDP", "positionId"],
  ["EmployeeProject", "employeeId"],
  ["EmployeeProject", "projectId"],
  ["Project", "leadingDepartmentId"],
  ["Project", "parentProjectTaskId"],
  ["ProjectTask", "projectId"],
  ["ProjectTask", "ownerEmployeeId"],
  ["ProjectTask", "planPhaseId"],
  ["ProjectTask", "sourceMeetingDecisionId"],
  ["ProjectTask", "sourceMeetingActionCandidateId"],
  ["FinanceAccount", "parentId"],
];
const HISTORY_FK_IGNORES = new Map([
  ["EDP:reportTo", "business semantic string; accepts employee name or employee code, not Employee.id"],
]);

let failed = false;

function fail(message) {
  failed = true;
  console.error(`✗ ${message}`);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function unwrap(node) {
  let current = node;
  while (ts.isSatisfiesExpression(current) || ts.isAsExpression(current)) current = current.expression;
  return current;
}

function propertyName(prop) {
  if (!prop.name) return null;
  if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) return prop.name.text;
  return null;
}

function objectProperty(obj, name) {
  if (!ts.isObjectLiteralExpression(obj)) return null;
  return obj.properties.find((prop) => propertyName(prop) === name) ?? null;
}

function stringProperty(obj, name) {
  const prop = objectProperty(obj, name);
  if (!prop || !ts.isPropertyAssignment(prop)) return null;
  const value = unwrap(prop.initializer);
  return ts.isStringLiteral(value) ? value.text : null;
}

function objectLiteralProperty(obj, name) {
  const prop = objectProperty(obj, name);
  if (!prop || !ts.isPropertyAssignment(prop)) return null;
  const value = unwrap(prop.initializer);
  return ts.isObjectLiteralExpression(value) ? value : null;
}

function hasProperty(obj, name) {
  return Boolean(objectProperty(obj, name));
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function collectRegistrations() {
  const text = read(REGISTRY_PATH);
  const sourceFile = ts.createSourceFile(REGISTRY_PATH, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const registrations = [];

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text.endsWith("_FK_REGISTRATIONS") && node.initializer) {
      const initializer = unwrap(node.initializer);
      if (!ts.isArrayLiteralExpression(initializer)) {
        fail(`${path.relative(ROOT, REGISTRY_PATH)}:${lineOf(sourceFile, node)} FK registrations must be an array literal`);
        return;
      }
      for (const element of initializer.elements) {
        const registration = unwrap(element);
        if (!ts.isObjectLiteralExpression(registration)) continue;
        const key = stringProperty(registration, "key");
        const source = objectLiteralProperty(registration, "source");
        registrations.push({
          key,
          sourceEntity: source ? stringProperty(source, "entity") : null,
          sourceField: source ? stringProperty(source, "field") : null,
          sourceValueKind: source ? stringProperty(source, "valueKind") : null,
          node: registration,
          line: lineOf(sourceFile, registration),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return registrations;
}

function validateRegistrations(registrations) {
  const keys = new Set();
  for (const registration of registrations) {
    const label = registration.key || `line ${registration.line}`;
    if (!registration.key) fail(`FK registration ${label} is missing string key`);
    if (registration.key && keys.has(registration.key)) fail(`duplicate FK registration key: ${registration.key}`);
    if (registration.key) keys.add(registration.key);

    for (const property of REQUIRED_PROPERTIES) {
      if (!hasProperty(registration.node, property)) fail(`FK registration ${label} missing ${property}`);
    }

    const source = objectLiteralProperty(registration.node, "source");
    for (const property of SOURCE_PROPERTIES) {
      if (!source || !stringProperty(source, property)) fail(`FK registration ${label} missing source.${property}`);
    }
    const sourceValueKind = source ? stringProperty(source, "valueKind") : null;
    if (sourceValueKind && sourceValueKind !== "id" && sourceValueKind !== "semantic") {
      fail(`FK registration ${label} has invalid source.valueKind: ${sourceValueKind}`);
    }

    const permission = objectLiteralProperty(registration.node, "permission");
    for (const property of PERMISSION_PROPERTIES) {
      if (!permission || !stringProperty(permission, property)) fail(`FK registration ${label} missing permission.${property}`);
    }
  }
  return keys;
}

function sourceMatches(registration, entity, field) {
  return registration.sourceField === field && (registration.sourceEntity === entity || registration.sourceEntity === "Any");
}

function validateHistoryFkCoverage(registrations) {
  for (const [entity, field] of HISTORY_FK_FIELDS) {
    const match = registrations.find((registration) => sourceMatches(registration, entity, field) && (registration.sourceValueKind ?? "id") === "id");
    if (!match) {
      fail(`tracked history FK field ${entity}.${field} must have an id-backed FK registration or explicit ignore`);
    }
  }

  for (const [key, reason] of HISTORY_FK_IGNORES) {
    const [entity, field] = key.split(":");
    const match = registrations.find((registration) => sourceMatches(registration, entity, field));
    if (!match) fail(`history FK ignore ${entity}.${field} (${reason}) must still have a registry entry if used by reference options`);
    else if (match.sourceValueKind !== "semantic") fail(`history FK ignore ${entity}.${field} must be registered as source.valueKind = "semantic"`);
  }
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function validateFkKeyUsages(keys) {
  const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "packages"))];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (rel === "packages/platform/module-registry.ts") continue;
    const text = read(file);
    const patterns = [
      /fkKey\s*[:=]\s*["']([^"']+)["']/g,
      /fkKeyForEntity\([^)]*,\s*["']([^"']+)["']/g,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const fkKey = match[1];
        if (!keys.has(fkKey) && !LEGACY_FK_KEYS.has(fkKey)) {
          fail(`${rel} uses unregistered FK key: ${fkKey}`);
        }
      }
    }
  }
}

function validateReferenceOptionRoutes() {
  const files = [
    ...walk(path.join(ROOT, "app")),
    ...walk(path.join(ROOT, "packages")),
  ].filter((file) => {
    const rel = path.relative(ROOT, file);
    if (rel === "packages/platform/server/reference-options.ts") return false;
    return /reference-options.*\.(ts|tsx|js|jsx)$/.test(rel) || /reference-options\/route\.(ts|tsx|js|jsx)$/.test(rel);
  });

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const text = read(file);
    if (/if\s*\([^)]*fkKey/.test(text) || /switch\s*\([^)]*fkKey/.test(text)) {
      fail(`${rel} must route FK reference options through the registry, not fkKey branches`);
    }
  }
}

function validateResolveFk() {
  const text = read(RESOLVE_FK_PATH);
  if (/FK_CONFIG/.test(text)) fail("packages/platform/server/resolve-fk.ts must not restore static FK_CONFIG");
}

const registrations = collectRegistrations();
const keys = validateRegistrations(registrations);
validateHistoryFkCoverage(registrations);
validateFkKeyUsages(keys);
validateReferenceOptionRoutes();
validateResolveFk();

if (failed) {
  console.error("\nFK registry check failed.");
  process.exit(1);
}

ok(`FK registry check passed (${keys.size} keys)`);
