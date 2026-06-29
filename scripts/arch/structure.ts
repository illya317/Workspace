import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import {
  apiContracts,
  findApiContract,
  type ApiContractSource,
  type ApiMethod,
  type ApiRouteAccessMode,
} from "../../packages/platform/api-registry";
import {
  findLegacyAuthHubFiles,
  findLegacyRootAccessFiles,
  findLegacyRootPeriodImplementationFiles,
  findLegacyRootPeriodImports,
  findLegacyRootPermissionsImplementationFiles,
  findLegacyRootPermissionsImports,
  findLegacyRootPrismaFiles,
  findLegacyRootPrismaImports,
  findLegacyRootSearchSchemaFiles,
  findLegacyRootUtilityFiles,
  findLegacyRootWithAuthFiles,
  findLegacyRootWithAuthImports,
  findLegacyServiceFiles,
} from "./structure-legacy";
import { findBusinessModuleViewUsages, type BusinessModuleViewUsage } from "./structure-module-view";
import {
  findBusinessPageLayoutPrimitiveUsages,
  findBusinessToolbarCompositionWarnings,
  findPageSurfaceLayoutProtocolWarnings,
  type BusinessPageLayoutPrimitiveUsage,
  type BusinessToolbarCompositionWarning,
  type PageSurfaceLayoutProtocolWarning,
} from "./structure-page-layout";
import { findHandwrittenSearchMatches, type HandwrittenSearchMatchCandidate } from "./structure-search";
import { countApiContractsByOwner, findAppJsxFiles } from "./structure-report-helpers";
import {
  findAppHookFiles,
  findAppHookImplementationFiles,
  findBusinessCoreUiRoleBypassImports,
  findDuplicateCoreUiRegistrations,
  findGeneratedFilterContractDrift,
  findHookPatternCandidates,
  findNativeSearchInputFiles,
  findPageDesignDriftFiles,
  findPlatformCoreUiRoleBypassImports,
  findUiForbiddenCoreUiTypeImports,
  findUiPatternCandidates,
  findUnregisteredCoreUiExports,
  findUnregisteredCoreUiImports,
  type BusinessCoreUiRoleBypassImport,
  type DuplicateCoreUiRegistration,
  type GeneratedFilterContractDrift,
  type HookPatternCandidate,
  type NativeSearchInputFile,
  type PageDesignDriftFile,
  type PlatformCoreUiRoleBypassImport,
  type UiForbiddenCoreUiTypeImport,
  type UiPatternCandidate,
  type UnregisteredCoreUiExport,
  type UnregisteredCoreUiImport,
} from "./structure-ui";
import {
  findBusinessVisualTokenHardcoding,
  findComponentLocalUiConfigs,
  findCoreBusinessFactLiterals,
  type BusinessVisualTokenHardcoding,
  type ComponentLocalUiConfig,
  type CoreBusinessFactLiteral,
} from "./structure-hardcoding";
import {
  findBusinessCommonRendererImports,
  findCoreUiOwnershipWarnings,
  findDomainSharedLayoutShells,
  findSurfaceOwnsPageChrome,
  type BusinessCommonRendererImport,
  type CoreUiCommonDomainDependency,
  type CoreUiInvalidOwnership,
  type CoreUiMissingOwnership,
  type CoreUiSiblingSubcategoryCoupling,
  type DomainSharedLayoutShell,
  type SurfaceOwnsPageChrome,
} from "./structure-core-ui-ownership";
import { registeredModuleDefinitions } from "../../packages/platform/module-registry";
type ImportRecord = { kind: "static" | "dynamic"; specifier: string };

type SourceInfo = {
  absPath: string;
  relPath: string;
  text: string;
  sourceFile: ts.SourceFile;
  imports: ImportRecord[];
  hasJsx: boolean;
};

type ApiRouteMethod = {
  file: string;
  path: string;
  method: ApiMethod;
  contractKey: string | null;
  contractAccess: ApiRouteAccessMode | null;
  contractSource: ApiContractSource | null;
  ownerPackage: string | null;
  resourceKey: string | null;
  action: string | null;
  hasAuthorizeSignal: boolean;
  hasValidationSignal: boolean;
  hasServiceSignal: boolean;
  hasCompatibilityProxySignal: boolean;
  hasGoneRouteSignal: boolean;
  hasDirectPrismaSignal: boolean;
};

type RoutePrimitiveSchemaKind = "route-id-params" | "update-field-body" | "rows-body";

type RoutePrimitiveSchemaCandidate = {
  file: string;
  schemaName: string;
  primitive: RoutePrimitiveSchemaKind;
  importsPlatformPrimitive: boolean;
};

type ApiRouteHelperKind = "bad-request-response" | "route-id-parser" | "service-response" | "validated-id-proxy";

type ApiRouteHelperCandidate = {
  file: string;
  helperName: string;
  kind: ApiRouteHelperKind;
};

type ServicePatternGroup = {
  name: string;
  files: string[];
  owners: string[];
  legacyRootFiles: string[];
  packageFiles: string[];
  sharedExports: string[];
  exactSharedExports: string[];
};

const ROOT = path.resolve(__dirname, "../..");
const HTTP_METHODS: ApiMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const HTTP_METHOD_SET = new Set<string>(HTTP_METHODS);
const SCAN_ROOTS = ["app", "packages", "server", "lib", "scripts"];
const SKIPPED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "generated",
  "node_modules",
  "out",
  "tmp",
]);
const API_VALIDATION_SIGNAL_REGEX = /\b(safeParse|parse)\s*\(|\bz\s*\.|\bparseJson\s*\(|\bvalidate(CompatibilityProxy|Passthrough)Body\s*\(|\bcreateValidatedIdProxyHandler\s*\(|\bparseRouteId(Params)?\s*\(|\bcreate(ApiRouteHandler|CommandRoute|InternalApiRoute)\s*\(/;
const ROUTE_PRIMITIVE_IMPORTS: Record<RoutePrimitiveSchemaKind, string[]> = {
  "route-id-params": ["routeIdParamsSchema", "routeStringIdParamsSchema"],
  "update-field-body": ["updateFieldBodySchema"],
  "rows-body": ["rowsRequestBodySchema"],
};
const API_ROUTE_HELPER_RULES: Array<{ kind: ApiRouteHelperKind; names: string[] }> = [
  { kind: "bad-request-response", names: ["badRequest", "errorResponse"] },
  { kind: "route-id-parser", names: ["parseId", "parseParams"] },
  { kind: "service-response", names: ["serviceResponse", "serviceResultResponse"] },
  { kind: "validated-id-proxy", names: ["proxyWithValidatedId"] },
];
const API_ROUTE_HELPER_KIND_BY_NAME = new Map(
  API_ROUTE_HELPER_RULES.flatMap((rule) => rule.names.map((name) => [name, rule.kind] as const)),
);

function toRelative(filePath: string) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function walk(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function walkGeneratedUiFiles() {
  const packagesDir = path.join(ROOT, "packages");
  if (!fs.existsSync(packagesDir)) return [];
  return fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .flatMap((entry) => walk(path.join(packagesDir, entry.name, "ui", "generated")));
}

function hasJsx(sourceFile: ts.SourceFile) {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function collectImports(sourceFile: ts.SourceFile) {
  const imports: ImportRecord[] = [];

  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push({ kind: "static", specifier: node.moduleSpecifier.text });
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      imports.push({ kind: "dynamic", specifier: node.arguments[0].text });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports.sort((left, right) => left.specifier.localeCompare(right.specifier));
}

function readSourceInfo(absPath: string): SourceInfo {
  const text = fs.readFileSync(absPath, "utf8");
  const sourceFile = ts.createSourceFile(
    absPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    absPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return {
    absPath,
    relPath: toRelative(absPath),
    text,
    sourceFile,
    imports: collectImports(sourceFile),
    hasJsx: hasJsx(sourceFile),
  };
}

function getPackageName(relPath: string) {
  const parts = relPath.split("/");
  return parts[0] === "packages" && parts[1] ? parts[1] : "app-root";
}

function hasExportModifier(node: ts.Node) {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

type ExportDetails = {
  symbols: string[];
  bodies: Map<string, string>;
};

function normalizeExportBody(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function collectExportDetails(file: SourceInfo): ExportDetails {
  const symbols = new Set<string>();
  const bodies = new Map<string, string>();

  const addSymbol = (name: string, node?: ts.Node) => {
    symbols.add(name);
    if (node) bodies.set(name, normalizeExportBody(node.getText(file.sourceFile)));
  };

  for (const statement of file.sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && hasExportModifier(statement)) {
      addSymbol(statement.name.text, statement);
      continue;
    }

    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          addSymbol(declaration.name.text, declaration.initializer ?? declaration);
        }
      }
      continue;
    }

    if (
      (
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)
      ) &&
      statement.name &&
      hasExportModifier(statement)
    ) {
      addSymbol(statement.name.text, statement);
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        addSymbol(element.name.text);
      }
    }
  }

  return {
    symbols: [...symbols].sort(),
    bodies,
  };
}

function isApiMethod(value: string): value is ApiMethod {
  return HTTP_METHOD_SET.has(value);
}

function getExportedHttpMethods(sourceFile: ts.SourceFile) {
  const methods = new Set<ApiMethod>();

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name && hasExportModifier(node) && isApiMethod(node.name.text)) {
      methods.add(node.name.text);
    }

    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && isApiMethod(declaration.name.text)) {
          methods.add(declaration.name.text);
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...methods].sort((left, right) => HTTP_METHODS.indexOf(left) - HTTP_METHODS.indexOf(right));
}

function routePathFromFile(relPath: string) {
  return relPath
    .replace(/^app\/api/, "/api")
    .replace(/\/route\.ts$/, "")
    .replace(/\/\[\.\.\.[^\]]+\]/g, "/:catchall")
    .replace(/\/\[[^\]]+\]/g, "/:param");
}

function hasServiceSignal(file: SourceInfo) {
  return file.imports.some((item) => {
    if (item.specifier.startsWith("@/server/services")) return true;
    if (item.specifier.startsWith("@workspace/") && item.specifier.includes("/server")) return true;
    return item.specifier.startsWith("./") || item.specifier.startsWith("../");
  });
}

function hasCompatibilityProxySignal(file: SourceInfo) {
  if (!/@deprecated/.test(file.text)) return false;
  if (/\bprisma\s*\./.test(file.text)) return false;

  const importsProxyHelper = file.imports.some((item) => (
    item.specifier === "@/lib/proxy-route" ||
    item.specifier === "@workspace/platform/server/api"
  ));
  const callsProxyHelper = /\bcreate(Compatibility|ValidatedId)?ProxyHandler\s*\(\s*["']\/api\//.test(file.text);
  const proxiesWithFetch =
    /\bfetch\s*\(/.test(file.text) &&
    /new URL\(\s*["']\/api\//.test(file.text);

  return (importsProxyHelper && callsProxyHelper) || proxiesWithFetch;
}

function hasGoneRouteSignal(file: SourceInfo) {
  return false;
}

function findApiRouteMethods(files: SourceInfo[]) {
  const routeMethods: ApiRouteMethod[] = [];

  for (const file of files) {
    if (!/^app\/api\/.*\/route\.ts$/.test(file.relPath)) continue;

    const apiPath = routePathFromFile(file.relPath);
    const compatibilityProxySignal = hasCompatibilityProxySignal(file);
    const goneRouteSignal = hasGoneRouteSignal(file);
    for (const method of getExportedHttpMethods(file.sourceFile)) {
      const contract = findApiContract(method, apiPath);
      routeMethods.push({
        file: file.relPath,
        path: apiPath,
        method,
        contractKey: contract?.key ?? null,
        contractAccess: contract?.access ?? null,
        contractSource: contract?.source ?? null,
        ownerPackage: contract?.ownerPackage ?? null,
        resourceKey: contract?.resourceKey ?? null,
        action: contract?.action ?? null,
        hasAuthorizeSignal: /\bauthorize\s*\(/.test(file.text),
        hasValidationSignal: API_VALIDATION_SIGNAL_REGEX.test(file.text),
        hasServiceSignal: hasServiceSignal(file),
        hasCompatibilityProxySignal: compatibilityProxySignal,
        hasGoneRouteSignal: goneRouteSignal,
        hasDirectPrismaSignal: /\bprisma\s*\./.test(file.text),
      });
    }
  }

  return routeMethods.sort((left, right) => `${left.path}:${left.method}`.localeCompare(`${right.path}:${right.method}`));
}

function propertyNameText(name: ts.PropertyName) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function findZObjectLiteral(node: ts.Node): ts.ObjectLiteralExpression | null {
  if (!ts.isCallExpression(node)) return null;

  if (
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "object" &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "z" &&
    node.arguments[0] &&
    ts.isObjectLiteralExpression(node.arguments[0])
  ) {
    return node.arguments[0];
  }

  if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isCallExpression(node.expression.expression)
  ) {
    return findZObjectLiteral(node.expression.expression);
  }

  return null;
}

function routePrimitiveKindFromKeys(keys: string[]): RoutePrimitiveSchemaKind | null {
  const keySet = new Set(keys);
  if (keys.length === 1 && keySet.has("id")) return "route-id-params";
  if (keySet.has("field") && keySet.has("value")) return "update-field-body";
  if (keySet.has("rows")) return "rows-body";
  return null;
}

function importsPlatformRoutePrimitive(file: SourceInfo, primitive: RoutePrimitiveSchemaKind) {
  const helpers = ROUTE_PRIMITIVE_IMPORTS[primitive];
  return file.imports.some((item) => item.specifier === "@workspace/platform/server/api") &&
    helpers.some((helper) => new RegExp(`\\b${helper}\\b`).test(file.text));
}

function findRoutePrimitiveSchemaCandidates(files: SourceInfo[]) {
  const candidates: RoutePrimitiveSchemaCandidate[] = [];

  for (const file of files) {
    if (!/^app\/api\/.*\/route\.ts$/.test(file.relPath)) continue;

    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const objectLiteral = findZObjectLiteral(node.initializer);
        if (objectLiteral) {
          const keys = objectLiteral.properties
            .map((property) => ts.isPropertyAssignment(property) ? propertyNameText(property.name) : null)
            .filter((key): key is string => Boolean(key))
            .sort();
          const primitive = routePrimitiveKindFromKeys(keys);
          if (primitive) {
            candidates.push({
              file: file.relPath,
              schemaName: node.name.text,
              primitive,
              importsPlatformPrimitive: importsPlatformRoutePrimitive(file, primitive),
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(file.sourceFile);
  }

  return candidates.sort((left, right) => `${left.primitive}:${left.file}:${left.schemaName}`.localeCompare(`${right.primitive}:${right.file}:${right.schemaName}`));
}

function findApiRouteHelperCandidates(files: SourceInfo[]) {
  const candidates: ApiRouteHelperCandidate[] = [];

  for (const file of files) {
    if (!/^app\/api\/.*\/route\.ts$/.test(file.relPath)) continue;

    for (const statement of file.sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        const kind = API_ROUTE_HELPER_KIND_BY_NAME.get(statement.name.text);
        if (kind) {
          candidates.push({
            file: file.relPath,
            helperName: statement.name.text,
            kind,
          });
        }
        continue;
      }

      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) continue;
          const kind = API_ROUTE_HELPER_KIND_BY_NAME.get(declaration.name.text);
          if (kind) {
            candidates.push({
              file: file.relPath,
              helperName: declaration.name.text,
              kind,
            });
          }
        }
      }
    }
  }

  return candidates.sort((left, right) => `${left.kind}:${left.file}:${left.helperName}`.localeCompare(`${right.kind}:${right.file}:${right.helperName}`));
}

function findRepeatedServiceGroups(files: SourceInfo[]) {
  const serviceFiles = files.filter((file) => {
    if (file.relPath.startsWith("server/services/")) return true;
    return /^packages\/[^/]+\/server\/.*\.ts$/.test(file.relPath);
  });
  const groups = new Map<string, SourceInfo[]>();

  for (const file of serviceFiles) {
    const name = path.basename(file.relPath, path.extname(file.relPath));
    if (["index", "types"].includes(name)) continue;
    const current = groups.get(name) ?? [];
    current.push(file);
    groups.set(name, current);
  }

  return [...groups.entries()]
    .map(([name, groupFiles]) => {
      const filesInGroup = groupFiles.map((file) => file.relPath).sort();
      const owners = [...new Set(groupFiles.map((file) => {
        if (file.relPath.startsWith("server/services/")) return "legacy-root";
        return getPackageName(file.relPath);
      }))].sort();
      const exportDetailsByFile = new Map(groupFiles.map((file) => [file.relPath, collectExportDetails(file)]));
      const ownersBySymbol = new Map<string, Set<string>>();
      const bodiesBySymbol = new Map<string, Map<string, Set<string>>>();

      for (const file of groupFiles) {
        const owner = file.relPath.startsWith("server/services/") ? "legacy-root" : getPackageName(file.relPath);
        const details = exportDetailsByFile.get(file.relPath);
        if (!details) continue;

        for (const symbol of details.symbols) {
          const symbolOwners = ownersBySymbol.get(symbol) ?? new Set<string>();
          symbolOwners.add(owner);
          ownersBySymbol.set(symbol, symbolOwners);

          const body = details.bodies.get(symbol);
          if (!body) continue;
          const bodyOwners = bodiesBySymbol.get(symbol) ?? new Map<string, Set<string>>();
          const matchingOwners = bodyOwners.get(body) ?? new Set<string>();
          matchingOwners.add(owner);
          bodyOwners.set(body, matchingOwners);
          bodiesBySymbol.set(symbol, bodyOwners);
        }
      }

      const sharedExports = [...ownersBySymbol.entries()]
        .filter(([, symbolOwners]) => symbolOwners.size > 1)
        .map(([symbol]) => symbol)
        .sort();
      const exactSharedExports = [...bodiesBySymbol.entries()]
        .filter(([, bodyOwners]) => [...bodyOwners.values()].some((symbolOwners) => symbolOwners.size > 1))
        .map(([symbol]) => symbol)
        .sort();

      return {
        name,
        files: filesInGroup,
        owners,
        legacyRootFiles: filesInGroup.filter((file) => file.startsWith("server/services/")),
        packageFiles: filesInGroup.filter((file) => file.startsWith("packages/")),
        sharedExports,
        exactSharedExports,
      };
    })
    .filter((group) => group.files.length > 1)
    .filter((group) => {
      if (group.legacyRootFiles.length > 0 && group.packageFiles.length > 0) return group.sharedExports.length > 0;
      return group.sharedExports.length >= 2 || group.exactSharedExports.length > 0;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function createStructureReport() {
  const sourceFiles = SCAN_ROOTS.flatMap((rootName) => walk(path.join(ROOT, rootName))).sort().map(readSourceInfo);
  const generatedUiSourceFiles = walkGeneratedUiFiles().sort().map(readSourceInfo);
  const businessUiSourceFiles = [...sourceFiles, ...generatedUiSourceFiles];

  const uiPatternCandidates = findUiPatternCandidates(sourceFiles);
  const apiRouteMethods = findApiRouteMethods(sourceFiles);
  const routePrimitiveSchemaCandidates = findRoutePrimitiveSchemaCandidates(sourceFiles);
  const apiRouteHelperCandidates = findApiRouteHelperCandidates(sourceFiles);
  const hookPatternCandidates = findHookPatternCandidates(sourceFiles);
  const unregisteredCoreUiImports = findUnregisteredCoreUiImports(sourceFiles);
  const unregisteredCoreUiExports = findUnregisteredCoreUiExports(sourceFiles);
  const duplicateCoreUiRegistrations = findDuplicateCoreUiRegistrations();
  const pageDesignDriftFiles = findPageDesignDriftFiles(sourceFiles);
  const nativeSearchInputFiles = findNativeSearchInputFiles(sourceFiles);
  const handwrittenSearchMatches = findHandwrittenSearchMatches(sourceFiles);
  const generatedFilterContractDrift = findGeneratedFilterContractDrift(generatedUiSourceFiles);
  const businessModuleViewUsages = findBusinessModuleViewUsages(businessUiSourceFiles);
  const businessPageLayoutPrimitiveUsages = findBusinessPageLayoutPrimitiveUsages(sourceFiles);
  const businessToolbarCompositionWarnings = findBusinessToolbarCompositionWarnings(sourceFiles);
  const businessCoreUiRoleBypassImports = findBusinessCoreUiRoleBypassImports(sourceFiles);
  const uiForbiddenCoreUiTypeImports = findUiForbiddenCoreUiTypeImports(sourceFiles);
  const businessVisualTokenHardcoding = findBusinessVisualTokenHardcoding(sourceFiles);
  const coreBusinessFactLiterals = findCoreBusinessFactLiterals(sourceFiles);
  const componentLocalUiConfigs = findComponentLocalUiConfigs(sourceFiles);
  const pageSurfaceLayoutProtocolWarnings = findPageSurfaceLayoutProtocolWarnings(sourceFiles);
  const platformCoreUiRoleBypassImports = findPlatformCoreUiRoleBypassImports(sourceFiles);
  const coreUiOwnershipWarnings = findCoreUiOwnershipWarnings();
  const businessCommonRendererImports = findBusinessCommonRendererImports(sourceFiles);
  const domainSharedLayoutShells = findDomainSharedLayoutShells(sourceFiles);
  const surfaceOwnsPageChrome = findSurfaceOwnsPageChrome(sourceFiles);
  const repeatedServiceGroups = findRepeatedServiceGroups(sourceFiles);
  const uncontractedApiRouteMethods = apiRouteMethods.filter((route) => route.contractKey === null);
  const apiRoutesWithDirectPrismaSignal = apiRouteMethods.filter((route) => route.hasDirectPrismaSignal);
  const compatibilityProxyRouteMethods = apiRouteMethods.filter((route) => route.hasCompatibilityProxySignal);
  const goneRouteMethods = apiRouteMethods.filter((route) => route.hasGoneRouteSignal);
  const apiRouteMethodsWithoutValidationSignal = apiRouteMethods
    .filter((route) => route.method !== "GET")
    .filter((route) => !route.hasGoneRouteSignal)
    .filter((route) => !route.hasCompatibilityProxySignal)
    .filter((route) => !route.hasValidationSignal);
  const apiRouteMethodsWithoutServiceSignal = apiRouteMethods
    .filter((route) => !route.hasServiceSignal)
    .filter((route) => !route.hasCompatibilityProxySignal);
  const routePrimitiveSchemaDuplicates = routePrimitiveSchemaCandidates.filter((candidate) => !candidate.importsPlatformPrimitive);
  const apiRouteHelperDuplicates = apiRouteHelperCandidates;
  const domainUiCandidatesWithoutCore = uiPatternCandidates.filter((candidate) => candidate.layer === "domain").filter((candidate) => !candidate.importsCoreUi);
  const domainHookCandidatesWithoutShared = hookPatternCandidates.filter((candidate) => candidate.layer === "domain").filter((candidate) => !candidate.importsCoreHooks && !candidate.importsPlatformHooks);
  const appHookFiles = findAppHookFiles(hookPatternCandidates);
  const appHookImplementationFiles = findAppHookImplementationFiles(hookPatternCandidates);
  const legacyServiceFiles = findLegacyServiceFiles(sourceFiles);
  const legacyAuthHubFiles = findLegacyAuthHubFiles(sourceFiles);
  const legacyRootAccessFiles = findLegacyRootAccessFiles(sourceFiles);
  const legacyRootUtilityFiles = findLegacyRootUtilityFiles(sourceFiles);
  const legacyRootWithAuthFiles = findLegacyRootWithAuthFiles(sourceFiles);
  const legacyRootWithAuthImports = findLegacyRootWithAuthImports(sourceFiles);
  const legacyRootPrismaFiles = findLegacyRootPrismaFiles(sourceFiles);
  const legacyRootPrismaImports = findLegacyRootPrismaImports(sourceFiles);
  const legacyRootPermissionsImplementationFiles = findLegacyRootPermissionsImplementationFiles(sourceFiles);
  const legacyRootPermissionsImports = findLegacyRootPermissionsImports(sourceFiles);
  const legacyRootPeriodImplementationFiles = findLegacyRootPeriodImplementationFiles(sourceFiles);
  const legacyRootPeriodImports = findLegacyRootPeriodImports(sourceFiles);
  const legacyRootSearchSchemaFiles = findLegacyRootSearchSchemaFiles(sourceFiles);

  return {
    kind: "structure",
    mode: "structure-intelligence",
    generatedAt: new Date(0).toISOString(),
    summary: {
      filesScanned: sourceFiles.length,
      moduleDefinitions: registeredModuleDefinitions.length,
      apiContracts: apiContracts.length,
      apiRouteMethods: apiRouteMethods.length,
      uncontractedApiRouteMethods: uncontractedApiRouteMethods.length,
      apiRouteMethodsWithDirectPrismaSignal: apiRoutesWithDirectPrismaSignal.length,
      apiRouteMethodsWithoutValidationSignal: apiRouteMethodsWithoutValidationSignal.length,
      apiRouteMethodsWithoutServiceSignal: apiRouteMethodsWithoutServiceSignal.length,
      compatibilityProxyRouteMethods: compatibilityProxyRouteMethods.length,
      goneRouteMethods: goneRouteMethods.length,
      uiPatternCandidates: uiPatternCandidates.length,
      uiPatternCandidatesWithoutCore: domainUiCandidatesWithoutCore.length,
      hookPatternCandidates: hookPatternCandidates.length,
      appHookFiles: appHookFiles.length,
      appHookImplementationFiles: appHookImplementationFiles.length,
      legacyServiceFiles: legacyServiceFiles.length,
      repeatedServiceGroups: repeatedServiceGroups.length,
      routePrimitiveSchemaDuplicates: routePrimitiveSchemaDuplicates.length,
      apiRouteHelperDuplicates: apiRouteHelperDuplicates.length,
      legacyAuthHubFiles: legacyAuthHubFiles.length,
      legacyRootAccessFiles: legacyRootAccessFiles.length,
      legacyRootUtilityFiles: legacyRootUtilityFiles.length,
      legacyRootWithAuthFiles: legacyRootWithAuthFiles.length,
      legacyRootWithAuthImports: legacyRootWithAuthImports.length,
      legacyRootPrismaFiles: legacyRootPrismaFiles.length,
      legacyRootPrismaImports: legacyRootPrismaImports.length,
      legacyRootPermissionsImplementationFiles: legacyRootPermissionsImplementationFiles.length,
      legacyRootPermissionsImports: legacyRootPermissionsImports.length,
      legacyRootPeriodImplementationFiles: legacyRootPeriodImplementationFiles.length,
      legacyRootPeriodImports: legacyRootPeriodImports.length,
      legacyRootSearchSchemaFiles: legacyRootSearchSchemaFiles.length,
      unregisteredCoreUiImports: unregisteredCoreUiImports.length,
      unregisteredCoreUiExports: unregisteredCoreUiExports.length,
      duplicateCoreUiRegistrations: duplicateCoreUiRegistrations.length,
      pageDesignDriftFiles: pageDesignDriftFiles.length,
      nativeSearchInputFiles: nativeSearchInputFiles.length,
      handwrittenSearchMatchFiles: new Set(handwrittenSearchMatches.map((candidate) => candidate.file)).size,
      generatedFilterContractDriftFiles: new Set(generatedFilterContractDrift.map((candidate) => candidate.file)).size,
      businessModuleViewUsages: businessModuleViewUsages.length,
      businessPageLayoutPrimitiveUsages: businessPageLayoutPrimitiveUsages.length,
      businessToolbarCompositionWarnings: businessToolbarCompositionWarnings.length,
      businessCoreUiRoleBypassImports: businessCoreUiRoleBypassImports.length,
      uiForbiddenCoreUiTypeImports: uiForbiddenCoreUiTypeImports.length,
      businessVisualTokenHardcoding: businessVisualTokenHardcoding.length,
      coreBusinessFactLiterals: coreBusinessFactLiterals.length,
      componentLocalUiConfigs: componentLocalUiConfigs.length,
      pageSurfaceLayoutProtocolWarnings: pageSurfaceLayoutProtocolWarnings.length,
      platformCoreUiRoleBypassImports: platformCoreUiRoleBypassImports.length,
      coreUiMissingOwnership: coreUiOwnershipWarnings.coreUiMissingOwnership.length,
      coreUiInvalidOwnership: coreUiOwnershipWarnings.coreUiInvalidOwnership.length,
      coreUiCommonDomainDependency: coreUiOwnershipWarnings.coreUiCommonDomainDependency.length,
      coreUiSiblingSubcategoryCoupling: coreUiOwnershipWarnings.coreUiSiblingSubcategoryCoupling.length,
      businessCommonRendererImports: businessCommonRendererImports.length,
      domainSharedLayoutShells: domainSharedLayoutShells.length,
      surfaceOwnsPageChrome: surfaceOwnsPageChrome.length,
    },
    registries: {
      modules: registeredModuleDefinitions
        .map((definition) => ({
          packageName: definition.packageName,
          layer: definition.layer,
          moduleKey: definition.moduleDef?.key ?? null,
          routeCount: definition.routes?.length ?? 0,
          apiGuardCount: definition.apiGuards?.length ?? 0,
        }))
        .sort((left, right) => left.packageName.localeCompare(right.packageName)),
      apiContractsByOwner: countApiContractsByOwner(apiContracts),
    },
    patterns: {
      uiPatternCandidates,
      hookPatternCandidates,
      apiRouteMethods,
      repeatedServiceGroups,
      routePrimitiveSchemaCandidates,
      apiRouteHelperCandidates,
      unregisteredCoreUiImports,
      unregisteredCoreUiExports,
      duplicateCoreUiRegistrations,
      pageDesignDriftFiles,
      nativeSearchInputFiles,
      handwrittenSearchMatches,
      generatedFilterContractDrift,
      businessModuleViewUsages,
      businessPageLayoutPrimitiveUsages,
      businessToolbarCompositionWarnings,
      businessCoreUiRoleBypassImports,
      uiForbiddenCoreUiTypeImports,
      businessVisualTokenHardcoding,
      coreBusinessFactLiterals,
      componentLocalUiConfigs,
      pageSurfaceLayoutProtocolWarnings,
      platformCoreUiRoleBypassImports,
      coreUiMissingOwnership: coreUiOwnershipWarnings.coreUiMissingOwnership,
      coreUiInvalidOwnership: coreUiOwnershipWarnings.coreUiInvalidOwnership,
      coreUiCommonDomainDependency: coreUiOwnershipWarnings.coreUiCommonDomainDependency,
      coreUiSiblingSubcategoryCoupling: coreUiOwnershipWarnings.coreUiSiblingSubcategoryCoupling,
      businessCommonRendererImports,
      domainSharedLayoutShells,
      surfaceOwnsPageChrome,
    },
    drift: {
      appJsxFiles: findAppJsxFiles(sourceFiles),
      appHookFiles,
      appHookImplementationFiles,
      uncontractedApiRouteMethods,
      apiRoutesWithDirectPrismaSignal,
      apiRouteMethodsWithoutValidationSignal,
      apiRouteMethodsWithoutServiceSignal,
      compatibilityProxyRouteMethods,
      goneRouteMethods,
      legacyServiceFiles,
      legacyAuthHubFiles,
      legacyRootAccessFiles,
      legacyRootUtilityFiles,
      legacyRootWithAuthFiles,
      legacyRootWithAuthImports,
      legacyRootPrismaFiles,
      legacyRootPrismaImports,
      legacyRootPermissionsImplementationFiles,
      legacyRootPermissionsImports,
      legacyRootPeriodImplementationFiles,
      legacyRootPeriodImports,
      legacyRootSearchSchemaFiles,
      unregisteredCoreUiImports,
      unregisteredCoreUiExports,
      duplicateCoreUiRegistrations,
      pageDesignDriftFiles,
      nativeSearchInputFiles,
      handwrittenSearchMatches,
      generatedFilterContractDrift,
      businessModuleViewUsages,
      businessPageLayoutPrimitiveUsages,
      businessToolbarCompositionWarnings,
      businessCoreUiRoleBypassImports,
      uiForbiddenCoreUiTypeImports,
      businessVisualTokenHardcoding,
      coreBusinessFactLiterals,
      componentLocalUiConfigs,
      pageSurfaceLayoutProtocolWarnings,
      platformCoreUiRoleBypassImports,
      coreUiMissingOwnership: coreUiOwnershipWarnings.coreUiMissingOwnership,
      coreUiInvalidOwnership: coreUiOwnershipWarnings.coreUiInvalidOwnership,
      coreUiCommonDomainDependency: coreUiOwnershipWarnings.coreUiCommonDomainDependency,
      coreUiSiblingSubcategoryCoupling: coreUiOwnershipWarnings.coreUiSiblingSubcategoryCoupling,
      businessCommonRendererImports,
      domainSharedLayoutShells,
      surfaceOwnsPageChrome,
      repeatedServiceGroups,
      routePrimitiveSchemaDuplicates,
      apiRouteHelperDuplicates,
      domainUiCandidatesWithoutCore,
      domainHookCandidatesWithoutShared,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    console.log(JSON.stringify(createStructureReport(), null, 2));
  } catch (error) {
    console.error("Structure scan report failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
