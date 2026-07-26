import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { getApiContracts } from "../../packages/platform/api-registry";
import { registeredModuleDefinitions } from "../../packages/platform/module-registry";

const ROOT = path.resolve(__dirname, "../..");
export type ViolationKind =
  | "missingDomainValidatorImport"
  | "serviceUsesLowLevelRule"
  | "routeImportsDomainValidator"
  | "serverRootReexportsDomainValidator"
  | "lifecycleEntryBypassesGuard";

interface DomainPackage {
  packageName: string;
  packageKey: string;
  packageDir: string;
  serverDir: string;
  serverRoot: string;
  apiRoots: string[];
}

export interface Violation {
  kind: ViolationKind;
  key: string;
  file: string;
  detail: string;
  recommendation: string;
}

export interface DomainValidationWarning {
  key: string;
  file: string;
  detail: string;
  recommendation: string;
}

interface ExportedEntry {
  name: string;
  text: string;
}

interface WorkspaceServerImports {
  named: string[];
  namespaces: string[];
}

const WRITE_FUNCTION_PREFIXES = [
  "add",
  "archive",
  "activate",
  "clear",
  "confirm",
  "create",
  "delete",
  "import",
  "restore",
  "save",
  "submit",
  "sync",
  "update",
  "upsert",
  "write",
];

const LOW_LEVEL_RULE_TOKENS = [
  "validateFkValue",
  "parseWorkPercent",
  "isValidDateValue",
  "rejectInvalidDateField",
  "validateEdpReportTo",
  "validateEmploymentOption",
  "validateContractOption",
  "isValidCompanyName",
  "normalizeEmployeeOption",
  "guardActiveReferences",
  "guardPositionArchive",
  "guardDepartmentArchive",
  "guardEmployeeInactive",
];

const REGISTERED_VALIDATION_ENTRY_TOKENS = [
  "guardedDelete",
  "executeDirectBusinessActionCommand",
  "executeApprovedBusinessActionCommand",
];

const LOW_LEVEL_HELPER_FILE_PATTERNS = [
  /\/server\/domain\//,
  /\/server\/field-validation\.ts$/,
  /\/server\/reference-guards\.ts$/,
  /\/server\/fk-registry\.ts$/,
  /\/server\/edp-report-to\.ts$/,
  /\/server\/contract-records\.ts$/,
  /\/server\/schemas\.ts$/,
  /\/server\/.*schema.*\.ts$/,
];

const QUERY_ONLY_FILE_PATTERNS = [
  /\/server\/index\.ts$/,
  /\/server\/autocomplete(?:-config)?\.ts$/,
  /\/server\/agent-tools\.ts$/,
  /\/server\/admin-/,
  /\/server\/company-directory\.ts$/,
  /\/server\/department-codes\.ts$/,
  /\/server\/employee-history\.ts$/,
  /\/server\/employee-profile\.ts$/,
  /\/server\/permission-/,
  /\/server\/position-codes\.ts$/,
  /\/server\/position-description-template-store\.ts$/,
  /\/server\/roster\.ts$/,
  /\/server\/search\.ts$/,
  /\/server\/.*types?\.ts$/,
  /\/server\/.*config\.ts$/,
];

function relPath(fullPath: string) {
  return path.relative(ROOT, fullPath).replace(/\\/g, "/");
}

function readFile(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function fileExists(rel: string) {
  return fs.existsSync(path.join(ROOT, rel));
}

function uniqueSorted(items: string[]) {
  return [...new Set(items)].sort();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTs(file: string, source: string) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function collectTsFiles(dirRel: string): string[] {
  const dir = path.join(ROOT, dirRel);
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(relPath(fullPath)));
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(relPath(fullPath));
    }
  }
  return files.sort();
}

function businessApiRoot(pathPrefix: string) {
  const parts = pathPrefix.replace(/^\/+|\/+$/g, "").split("/");
  if (parts[0] !== "api" || parts[1] !== "modules" || !parts[2]) return null;
  return `app/${parts.slice(0, Math.min(parts.length, 4)).join("/")}`;
}

function domainPackages(): DomainPackage[] {
  const contracts = getApiContracts();
  return registeredModuleDefinitions
    .filter((definition) => definition.layer === "domain")
    .map((definition) => {
      const packageKey = definition.packageName.replace(/^@workspace\//, "");
      const packageDir = `packages/${packageKey}`;
      const apiPrefixes = [
        ...contracts
          .filter((contract) => contract.ownerPackage === definition.packageName)
          .map((contract) => contract.pathPrefix),
        ...(definition.moduleDef?.children ?? []).flatMap((child) => ("apiPrefixes" in child ? child.apiPrefixes ?? [] : [])),
      ];
      const apiRoots = uniqueSorted(
        apiPrefixes
          .map((pathPrefix) => businessApiRoot(pathPrefix))
          .filter((apiRoot): apiRoot is string => Boolean(apiRoot)),
      );
      return {
        packageName: definition.packageName,
        packageKey,
        packageDir,
        serverDir: `${packageDir}/server`,
        serverRoot: `${packageDir}/server/index.ts`,
        apiRoots,
      };
    })
    .filter((definition) => fileExists(definition.serverDir));
}

function hasDomainValidatorImport(source: string) {
  return /from\s+["'][^"']*\/domain\/[^"']*-validation["']/.test(source);
}

function reexportsDomainValidator(source: string) {
  return /export\s+(?:\*|\{[^}]*\})\s+from\s+["']\.\/domain\/[^"']*-validation["']/.test(source);
}

function workspaceServerImports(source: string, packageName: string): WorkspaceServerImports {
  const named: string[] = [];
  const namespaces: string[] = [];
  const sourceFile = parseTs("route.ts", source);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (specifier !== `${packageName}/server` && !specifier.startsWith(`${packageName}/server/`)) continue;
    const importClause = statement.importClause;
    if (!importClause || importClause.isTypeOnly) continue;
    const namedBindings = importClause.namedBindings;
    if (!namedBindings) continue;
    if (ts.isNamespaceImport(namedBindings)) {
      namespaces.push(namedBindings.name.text);
      continue;
    }
    if (!ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements) {
      if (element.isTypeOnly) continue;
      named.push(element.propertyName?.text ?? element.name.text);
    }
  }
  return { named: uniqueSorted(named), namespaces: uniqueSorted(namespaces) };
}

function namespaceForbiddenUsages(source: string, namespace: string, forbiddenNames: Set<string>) {
  const names = new Set<string>();
  const sourceFile = parseTs("route.ts", source);
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === namespace
      && forbiddenNames.has(node.name.text)
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...names];
}

function exportedDomainValidatorNames(pkg: DomainPackage) {
  const names = new Set<string>();
  for (const file of collectTsFiles(`${pkg.serverDir}/domain`)) {
    if (!file.endsWith("-validation.ts")) continue;
    const source = readFile(file);
    for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g)) {
      names.add(match[1]);
    }
    for (const match of source.matchAll(/export\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

function lowLevelTokensInSource(source: string) {
  return LOW_LEVEL_RULE_TOKENS.filter((token) => new RegExp(`\\b${escapeRegex(token)}\\b`).test(source));
}

function isLowLevelHelperFile(file: string) {
  return LOW_LEVEL_HELPER_FILE_PATTERNS.some((pattern) => pattern.test(file));
}

function isQueryOnlyFile(file: string) {
  return QUERY_ONLY_FILE_PATTERNS.some((pattern) => pattern.test(file));
}

function hasPrismaWriteSignal(source: string) {
  return /\b(?:prisma|tx)\.\w+\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/.test(source);
}

function hasCrudWriteSignal(source: string) {
  return /\bhandle(?:Create|UpdateField|Delete)\s*\(/.test(source);
}

function hasExportedWriteFunction(source: string) {
  const prefix = WRITE_FUNCTION_PREFIXES.join("|");
  return new RegExp(
    `export\\s+(?:(?:async\\s+)?function\\s+|const\\s+)(?:${prefix})[A-Z\\w]*\\s*(?:\\(|=)`,
  ).test(source);
}

function isWriteService(file: string, source: string) {
  if (isLowLevelHelperFile(file) || isQueryOnlyFile(file)) return false;
  return hasPrismaWriteSignal(source) || hasCrudWriteSignal(source) || hasExportedWriteFunction(source);
}

function isExported(statement: ts.Node) {
  if (!ts.canHaveModifiers(statement)) return false;
  return Boolean(ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function hasWriteEntryName(name: string) {
  return new RegExp(`^(?:${WRITE_FUNCTION_PREFIXES.join("|")})[A-Z\\w]*`).test(name);
}

function exportedEntries(file: string, source: string): ExportedEntry[] {
  const sourceFile = parseTs(file, source);
  const entries: ExportedEntry[] = [];
  const declarationTextByName = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarationTextByName.set(statement.name.text, statement.getText(sourceFile));
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        declarationTextByName.set(declaration.name.text, statement.getText(sourceFile));
        if (isExported(statement)) {
          entries.push({ name: declaration.name.text, text: statement.getText(sourceFile) });
        }
      }
      continue;
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name) {
      entries.push({ name: statement.name.text, text: statement.getText(sourceFile) });
      continue;
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        entries.push({ name: declaration.name.text, text: statement.getText(sourceFile) });
      }
      continue;
    }
    if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue;
      const exportedName = element.name.text;
      const localName = element.propertyName?.text ?? exportedName;
      const text = declarationTextByName.get(localName);
      if (text) entries.push({ name: exportedName, text });
    }
  }
  return entries;
}

function domainValidatorImportLocals(file: string, source: string) {
  const sourceFile = parseTs(file, source);
  const names: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!/\/domain\/[^"']*-validation$/.test(statement.moduleSpecifier.text)) continue;
    const importClause = statement.importClause;
    if (!importClause || importClause.isTypeOnly) continue;
    if (importClause.name) names.push(importClause.name.text);
    const namedBindings = importClause.namedBindings;
    if (!namedBindings) continue;
    if (ts.isNamespaceImport(namedBindings)) {
      names.push(namedBindings.name.text);
      continue;
    }
    for (const element of namedBindings.elements) {
      if (element.isTypeOnly) continue;
      names.push(element.name.text);
    }
  }
  return uniqueSorted(names);
}

function objectConstText(file: string, source: string, name: string) {
  const sourceFile = parseTs(file, source);
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
      if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      return declaration.initializer.getText(sourceFile);
    }
  }
  return "";
}

type CrudHelperName = "executeCreate" | "executeUpdateField" | "executeDelete";

function referencedCrudConfigNames(entryText: string, helperName: CrudHelperName) {
  const names: string[] = [];
  const regex = new RegExp(`\\b${helperName}\\s*\\([\\s\\S]*?,\\s*([A-Za-z_$][\\w$]*)\\s*\\)`, "g");
  for (const match of entryText.matchAll(regex)) {
    names.push(match[1]);
  }
  return uniqueSorted(names);
}

function crudHookPattern(helperName: CrudHelperName) {
  if (helperName === "executeDelete") return /\bonBeforeDelete\s*:/;
  if (helperName === "executeUpdateField") return /\bonBefore(?:Update|UpdateField)\s*:/;
  return /\bonBeforeCreate\s*:/;
}

function crudHelperCallIsValidated(
  file: string,
  source: string,
  entryText: string,
  helperName: CrudHelperName,
) {
  const hookPattern = crudHookPattern(helperName);
  if (hookPattern.test(entryText)) return true;
  return referencedCrudConfigNames(entryText, helperName).some((name) =>
    hookPattern.test(objectConstText(file, source, name)),
  );
}

function usesValidatedCrudHelper(file: string, source: string, entryText: string) {
  const helpers = ["executeCreate", "executeUpdateField", "executeDelete"] as const;
  let hasCrudHelper = false;
  for (const helperName of helpers) {
    if (!new RegExp(`\\b${helperName}\\s*\\(`).test(entryText)) continue;
    hasCrudHelper = true;
    if (!crudHelperCallIsValidated(file, source, entryText, helperName)) return false;
  }
  return hasCrudHelper;
}

function callsDomainValidator(entryText: string, validatorNames: string[]) {
  return validatorNames.some((name) =>
    new RegExp(`\\b${escapeRegex(name)}\\s*(?:\\(|\\.)`).test(entryText),
  );
}

function callsRegisteredValidationEntry(entryText: string) {
  return REGISTERED_VALIDATION_ENTRY_TOKENS.some((name) =>
    new RegExp(`\\b${escapeRegex(name)}\\s*\\(`).test(entryText),
  );
}

function entryUsesValidatedCommand(file: string, source: string, entry: ExportedEntry, validatorNames: string[]) {
  return callsDomainValidator(entry.text, validatorNames)
    || callsRegisteredValidationEntry(entry.text)
    || usesValidatedCrudHelper(file, source, entry.text);
}

function adapterBoundCommitNames(file: string, source: string, validatorNames: string[]) {
  const sourceFile = parseTs(file, source);
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "defineBusinessActionCommandAdapter"
      && node.arguments.length > 0
      && ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const properties = node.arguments[0].properties;
      const validate = properties.find((property) => (
        ts.isPropertyAssignment(property)
        && property.name.getText(sourceFile) === "validate"
      ));
      const commit = properties.find((property) => (
        ts.isPropertyAssignment(property)
        && property.name.getText(sourceFile) === "commit"
      ));
      if (
        validate
        && ts.isPropertyAssignment(validate)
        && commit
        && ts.isPropertyAssignment(commit)
        && callsDomainValidator(validate.initializer.getText(sourceFile), validatorNames)
      ) {
        const collectIdentifiers = (child: ts.Node) => {
          if (ts.isIdentifier(child)) names.add(child.text);
          ts.forEachChild(child, collectIdentifiers);
        };
        collectIdentifiers(commit.initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

function isWriteEntry(entry: ExportedEntry) {
  return hasWriteEntryName(entry.name) || hasPrismaWriteSignal(entry.text) || hasCrudWriteSignal(entry.text);
}

function isDestructiveLifecycleEntry(entry: ExportedEntry) {
  return /^(?:(?:delete|archive|deactivate|disable|remove)|(?:commit|execute)(?:Delete|Archive|Deactivate|Disable|Remove))[A-Z\w]/.test(entry.name);
}

function hasDirectPrismaLifecycleWrite(entry: ExportedEntry) {
  if (/\b[A-Za-z_$][\w$]*\.\w+\.(?:delete|deleteMany)\s*\(/.test(entry.text)) return true;
  if (/delete/i.test(entry.name) && /\b(?:deletedAt|isDeleted)\b/.test(entry.text)) {
    return /\b[A-Za-z_$][\w$]*\.\w+\.(?:update|updateMany)\s*\(/.test(entry.text);
  }
  if (!/(?:archive|deactivate|disable)/i.test(entry.name)) return false;
  return /\b[A-Za-z_$][\w$]*\.\w+\.(?:update|updateMany)\s*\(/.test(entry.text);
}

function usesAuditedTransactionalLifecycleProtocol(entry: ExportedEntry) {
  return /\.\$transaction\s*\(/.test(entry.text)
    && /\bensureEditHistoryBaseline\s*\(/.test(entry.text)
    && /\bsnapshotHistory\s*\(/.test(entry.text)
    && /\b(?:expectedVersion|version)\b/.test(entry.text)
    && /(?:reference|count|roles|status)/i.test(entry.text);
}

function usesMutationImpactLifecycleProtocol(entry: ExportedEntry) {
  return /\brunSerializableTransaction\s*\(/.test(entry.text)
    && /\bbuild[A-Za-z0-9_$]*MutationImpactEngine\s*\([^)]*\)\.execute\s*\(/.test(entry.text)
    && /\bcommitRoot\s*:/.test(entry.text);
}

function callsLifecycleGuard(file: string, source: string, entry: ExportedEntry) {
  return /\bguardedDelete\s*\(/.test(entry.text)
    || usesValidatedCrudHelper(file, source, entry.text)
    || usesAuditedTransactionalLifecycleProtocol(entry)
    || usesMutationImpactLifecycleProtocol(entry);
}

export function lifecycleGuardBypassEntryNames(file: string, source: string) {
  return exportedEntries(file, source)
    .filter((entry) => (
      isDestructiveLifecycleEntry(entry)
      && hasDirectPrismaLifecycleWrite(entry)
      && !callsLifecycleGuard(file, source, entry)
    ))
    .map((entry) => entry.name);
}

function violationKey(kind: ViolationKind, file: string, detail: string) {
  return `${kind}: ${file}: ${detail}`;
}

function createViolation(kind: ViolationKind, file: string, detail: string, recommendation: string): Violation {
  return {
    kind,
    key: violationKey(kind, file, detail),
    file,
    detail,
    recommendation,
  };
}

function createWarning(file: string, detail: string, recommendation: string): DomainValidationWarning {
  return {
    key: `routeCommandShellWarning: ${file}: ${detail}`,
    file,
    detail,
    recommendation,
  };
}

function blockContainsBusinessBranch(node: ts.Node) {
  let found = false;
  const visit = (child: ts.Node) => {
    if (ts.isIfStatement(child) || ts.isConditionalExpression(child) || ts.isSwitchStatement(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function createCommandRouteInlineBranchWarnings(source: string) {
  const sourceFile = parseTs("route.ts", source);
  const warnings: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "createCommandRoute"
      && node.arguments.length > 0
      && ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      for (const property of node.arguments[0].properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        if (!ts.isIdentifier(property.name)) continue;
        if (property.name.text !== "action" && property.name.text !== "buildCommand") continue;
        const initializer = property.initializer;
        if (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) continue;
        if (blockContainsBusinessBranch(initializer.body)) {
          warnings.push(`branches inside route ${property.name.text}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return uniqueSorted(warnings);
}

function commandRouteShellWarnings(file: string, source: string) {
  if (!file.endsWith("/route.ts")) return [];
  const warnings: string[] = [];
  if (!/\bcreateCommandRoute\b|\bcreateInternalApiRoute\b|\bcreateAgentDomainRpcHandler\b|\bcreateAuthoritativeLibrarySourceRoute\b|\bcreateWorkspaceAnalysisSourceRpcHandler\b/.test(source)) {
    warnings.push("business API route does not use createCommandRoute/createInternalApiRoute");
  }
  if (/\brequest\.json\s*\(\s*\)\.catch\s*\(/.test(source)) {
    warnings.push("parses JSON with request.json().catch in route");
  }
  if (/\.safeParse\s*\(/.test(source) && /\bif\s*\(\s*![A-Za-z_$][\w$]*\.success\s*\)/.test(source)) {
    warnings.push("handles zod safeParse failure in route");
  }
  if (/\bif\s*\([^)]*\b(?:parsed|parsedBody|parsedQuery)\.data\.[^)]+\)/.test(source)) {
    warnings.push("branches on parsed request data in route");
  }
  warnings.push(...createCommandRouteInlineBranchWarnings(source));
  return uniqueSorted(warnings);
}

export function createDomainValidationReport() {
  const violations: Violation[] = [];
  const packages = domainPackages();

  for (const pkg of packages) {
    if (fileExists(pkg.serverRoot) && reexportsDomainValidator(readFile(pkg.serverRoot))) {
      violations.push(
        createViolation(
          "serverRootReexportsDomainValidator",
          pkg.serverRoot,
          "server root re-exports domain validators",
          `Remove domain validator re-exports from ${pkg.serverRoot}; routes should import schemas/services only.`,
        ),
      );
    }

    const domainExportNames = exportedDomainValidatorNames(pkg);
    const forbiddenRouteRootNames = new Set([...domainExportNames, ...LOW_LEVEL_RULE_TOKENS]);
    for (const apiRoot of pkg.apiRoots) {
      for (const file of collectTsFiles(apiRoot)) {
        const source = readFile(file);
        const serverImports = workspaceServerImports(source, pkg.packageName);
        if (hasDomainValidatorImport(source)) {
          violations.push(
            createViolation(
              "routeImportsDomainValidator",
              file,
              "imports package domain validator directly",
              `Move business validation behind ${pkg.packageName}/server service; route and route-local helpers must stay API shells.`,
            ),
          );
        }

        const forbidden = serverImports.named.find((name) => forbiddenRouteRootNames.has(name));
        if (forbidden) {
          violations.push(
            createViolation(
              "routeImportsDomainValidator",
              file,
              `imports ${forbidden} from ${pkg.packageName}/server`,
              `Call a ${pkg.packageName}/server service instead of importing ${forbidden} into the API tree.`,
            ),
          );
        }
        for (const namespace of serverImports.namespaces) {
          const namespaceForbidden = namespaceForbiddenUsages(source, namespace, forbiddenRouteRootNames)[0];
          if (!namespaceForbidden) continue;
          violations.push(
            createViolation(
              "routeImportsDomainValidator",
              file,
              `uses ${namespace}.${namespaceForbidden} from ${pkg.packageName}/server`,
              `Call a ${pkg.packageName}/server service instead of exposing ${namespaceForbidden} into the API tree.`,
            ),
          );
        }
      }
    }

    const packageAdapterBoundCommitNames = new Set<string>();
    for (const adapterFile of collectTsFiles(pkg.serverDir)) {
      const adapterSource = readFile(adapterFile);
      if (!hasDomainValidatorImport(adapterSource)) continue;
      const adapterValidatorNames = domainValidatorImportLocals(adapterFile, adapterSource);
      for (const name of adapterBoundCommitNames(adapterFile, adapterSource, adapterValidatorNames)) {
        packageAdapterBoundCommitNames.add(name);
      }
    }

    for (const file of collectTsFiles(pkg.serverDir)) {
      const source = readFile(file);
      if (isLowLevelHelperFile(file)) continue;

      const lowLevelTokens = lowLevelTokensInSource(source);
      if (lowLevelTokens.length > 0 && isWriteService(file, source)) {
        violations.push(
          createViolation(
            "serviceUsesLowLevelRule",
            file,
            `uses ${lowLevelTokens.join(", ")}`,
            `Move ${lowLevelTokens.join(", ")} usage into packages/${pkg.packageKey}/server/domain/*-validation.ts and let this service consume a validated command.`,
          ),
        );
      }

      if (isWriteService(file, source) && !hasDomainValidatorImport(source)) {
        violations.push(
          createViolation(
            "missingDomainValidatorImport",
            file,
            "write service does not import a domain validator",
            `Add packages/${pkg.packageKey}/server/domain/<action>-validation.ts and import it from this write service before Prisma/CRUD writes.`,
          ),
        );
      }

      if (hasDomainValidatorImport(source)) {
        const validatorNames = domainValidatorImportLocals(file, source);
        const boundCommitNames = adapterBoundCommitNames(file, source, validatorNames);
        for (const entry of exportedEntries(file, source)) {
          if (!isWriteEntry(entry)) continue;
          if (boundCommitNames.has(entry.name) || packageAdapterBoundCommitNames.has(entry.name)) continue;
          if (entryUsesValidatedCommand(file, source, entry, validatorNames)) continue;
          violations.push(
            createViolation(
              "missingDomainValidatorImport",
              file,
              `write entry ${entry.name} does not call a domain validator`,
              `Call packages/${pkg.packageKey}/server/domain/*-validation.ts from ${entry.name} before delegating to Prisma/CRUD writes.`,
            ),
          );
        }
      }

      for (const entryName of lifecycleGuardBypassEntryNames(file, source)) {
        violations.push(
          createViolation(
            "lifecycleEntryBypassesGuard",
            file,
            `lifecycle entry ${entryName} performs a direct Prisma lifecycle write`,
            `Route ${entryName} through @workspace/platform/server/delete-guard (or the validated CRUD delete helper) with an explicit deleteMode and referencePolicy.`,
          ),
        );
      }
    }
  }

  for (const file of collectTsFiles("packages/platform/server")) {
    const source = readFile(file);
    for (const entryName of lifecycleGuardBypassEntryNames(file, source)) {
      violations.push(
        createViolation(
          "lifecycleEntryBypassesGuard",
          file,
          `lifecycle entry ${entryName} performs a direct Prisma lifecycle write`,
          `Route ${entryName} through @workspace/platform/server/delete-guard (or the validated CRUD delete helper) with an explicit deleteMode and referencePolicy.`,
        ),
      );
    }
  }

  return violations.sort((left, right) => left.key.localeCompare(right.key));
}

export function createDomainValidationWarnings() {
  const warnings: DomainValidationWarning[] = [];
  for (const file of collectTsFiles("app/api/modules")) {
    const source = readFile(file);
    for (const detail of commandRouteShellWarnings(file, source)) {
      warnings.push(
        createWarning(
          file,
          detail,
          "Prefer createCommandRoute with schema/buildCommand/action so the route stays an API shell.",
        ),
      );
    }
  }
  return warnings.sort((left, right) => left.key.localeCompare(right.key));
}
