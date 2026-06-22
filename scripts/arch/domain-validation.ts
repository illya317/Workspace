import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { getApiContracts } from "../../packages/platform/api-registry";
import { registeredModuleDefinitions } from "../../packages/platform/module-registry";

const ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "scripts/arch/domain-validation-baseline.json");

type ViolationKind =
  | "missingDomainValidatorImport"
  | "serviceUsesLowLevelRule"
  | "routeImportsDomainValidator"
  | "serverRootReexportsDomainValidator";

type DomainValidationBaseline = Record<ViolationKind, string[]>;

interface DomainPackage {
  packageName: string;
  packageKey: string;
  packageDir: string;
  serverDir: string;
  serverRoot: string;
  apiRoots: string[];
}

interface Violation {
  kind: ViolationKind;
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

const EMPTY_BASELINE: DomainValidationBaseline = {
  missingDomainValidatorImport: [],
  serviceUsesLowLevelRule: [],
  routeImportsDomainValidator: [],
  serverRootReexportsDomainValidator: [],
};

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
  /\/server\/employee-permissions\.ts$/,
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

function diff(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
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

function readBaseline(): DomainValidationBaseline {
  if (!fs.existsSync(BASELINE_PATH)) return EMPTY_BASELINE;
  const parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Partial<DomainValidationBaseline>;
  return {
    missingDomainValidatorImport: parsed.missingDomainValidatorImport ?? [],
    serviceUsesLowLevelRule: parsed.serviceUsesLowLevelRule ?? [],
    routeImportsDomainValidator: parsed.routeImportsDomainValidator ?? [],
    serverRootReexportsDomainValidator: parsed.serverRootReexportsDomainValidator ?? [],
  };
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

function referencedCrudConfigNames(entryText: string, helperName: "handleCreate" | "handleUpdateField" | "handleDelete") {
  const names: string[] = [];
  const regex = new RegExp(`\\b${helperName}\\s*\\([\\s\\S]*?,\\s*([A-Za-z_$][\\w$]*)\\s*\\)`, "g");
  for (const match of entryText.matchAll(regex)) {
    names.push(match[1]);
  }
  return uniqueSorted(names);
}

function crudHookPattern(helperName: "handleCreate" | "handleUpdateField" | "handleDelete") {
  if (helperName === "handleDelete") return /\bonBeforeDelete\s*:/;
  if (helperName === "handleUpdateField") return /\bonBefore(?:Update|UpdateField)\s*:/;
  return /\bonBeforeCreate\s*:/;
}

function crudHelperCallIsValidated(
  file: string,
  source: string,
  entryText: string,
  helperName: "handleCreate" | "handleUpdateField" | "handleDelete",
) {
  const hookPattern = crudHookPattern(helperName);
  if (hookPattern.test(entryText)) return true;
  return referencedCrudConfigNames(entryText, helperName).some((name) =>
    hookPattern.test(objectConstText(file, source, name)),
  );
}

function usesValidatedCrudHelper(file: string, source: string, entryText: string) {
  const helpers = ["handleCreate", "handleUpdateField", "handleDelete"] as const;
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

function isWriteEntry(entry: ExportedEntry) {
  return hasWriteEntryName(entry.name) || hasPrismaWriteSignal(entry.text) || hasCrudWriteSignal(entry.text);
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
        for (const entry of exportedEntries(file, source)) {
          if (!isWriteEntry(entry)) continue;
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
    }
  }

  return violations.sort((left, right) => left.key.localeCompare(right.key));
}

function violationsByKind(violations: Violation[]): DomainValidationBaseline {
  const grouped: DomainValidationBaseline = {
    missingDomainValidatorImport: [],
    serviceUsesLowLevelRule: [],
    routeImportsDomainValidator: [],
    serverRootReexportsDomainValidator: [],
  };
  for (const violation of violations) grouped[violation.kind].push(violation.key);
  return {
    missingDomainValidatorImport: uniqueSorted(grouped.missingDomainValidatorImport),
    serviceUsesLowLevelRule: uniqueSorted(grouped.serviceUsesLowLevelRule),
    routeImportsDomainValidator: uniqueSorted(grouped.routeImportsDomainValidator),
    serverRootReexportsDomainValidator: uniqueSorted(grouped.serverRootReexportsDomainValidator),
  };
}

function printViolation(violation: Violation, prefix: string) {
  console.error(`  ${prefix} ${violation.key}`);
  console.error(`    file: ${violation.file}`);
  console.error(`    fix: ${violation.recommendation}`);
}

function checkRatchet(kind: ViolationKind, current: Violation[], baseline: string[]) {
  const currentKeys = uniqueSorted(current.map((violation) => violation.key));
  const baselineKeys = uniqueSorted(baseline);
  const additions = diff(currentKeys, baselineKeys);
  const stale = diff(baselineKeys, currentKeys);

  if (additions.length > 0) {
    console.error(`✗ Domain validation ratchet failed: new ${kind} violation(s).`);
    for (const key of additions) {
      const violation = current.find((item) => item.key === key);
      if (violation) printViolation(violation, "+");
      else console.error(`  + ${key}`);
    }
    return false;
  }

  if (stale.length > 0) {
    console.error(`✗ Domain validation ratchet failed: stale ${kind} baseline item(s).`);
    console.error("  Remove migrated items from scripts/arch/domain-validation-baseline.json.");
    for (const key of stale) console.error(`  - ${key}`);
    return false;
  }

  return true;
}

export function checkDomainValidation() {
  try {
    const baseline = readBaseline();
    const current = createDomainValidationReport();
    const grouped = violationsByKind(current);
    const byKind = new Map<ViolationKind, Violation[]>();
    for (const violation of current) {
      byKind.set(violation.kind, [...(byKind.get(violation.kind) ?? []), violation]);
    }

    for (const kind of Object.keys(EMPTY_BASELINE) as ViolationKind[]) {
      if (!checkRatchet(kind, byKind.get(kind) ?? [], baseline[kind])) return false;
    }

    const total = Object.values(grouped).reduce((sum, items) => sum + items.length, 0);
    console.log(`✓ domain validation boundaries passed (${total} baseline item${total === 1 ? "" : "s"}).`);
    return true;
  } catch (error) {
    console.error("✗ domain validation boundary check failed.");
    console.error(error instanceof Error ? `  ${error.message}` : error);
    return false;
  }
}

if (process.argv.includes("--print-baseline")) {
  process.stdout.write(`${JSON.stringify(violationsByKind(createDomainValidationReport()), null, 2)}\n`);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkDomainValidation() ? 0 : 1);
}
