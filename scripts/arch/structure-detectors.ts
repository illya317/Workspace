import type { createStructureReport } from "./structure";

export type StructureReport = ReturnType<typeof createStructureReport>;
export type StructureBaseline = Record<string, string[]>;

export type StructureRatchetCheck = {
  name: string;
  current: string[];
};

export type StructureDetectorScope = "domain-blocker" | "ui-blocker" | "hygiene" | "all";

type StructureDetectorDefinition = {
  baselineKey: string;
  scope: Exclude<StructureDetectorScope, "all">;
  current: (report: StructureReport) => string[];
};

function repeatedServiceGroupKey(group: { name: string; files: string[] }) {
  return `${group.name}: ${group.files.join(" | ")}`;
}

function apiRouteMethodKey(route: { method: string; path: string }) {
  return `${route.method} ${route.path}`;
}

function routePrimitiveSchemaKey(candidate: { primitive: string; file: string; schemaName: string }) {
  return `${candidate.primitive}: ${candidate.file}#${candidate.schemaName}`;
}

function apiRouteHelperKey(candidate: { kind: string; file: string; helperName: string }) {
  return `${candidate.kind}: ${candidate.file}#${candidate.helperName}`;
}

function unregisteredCoreUiImportKey(candidate: { file: string; importedName: string; specifier: string }) {
  return `${candidate.file}: ${candidate.importedName} from ${candidate.specifier}`;
}

function unregisteredCoreUiExportKey(candidate: { exportedName: string }) {
  return candidate.exportedName;
}

function duplicateCoreUiRegistrationKey(candidate: { name: string; count: number }) {
  return `${candidate.name}: ${candidate.count}`;
}

function pageDesignDriftFileKey(candidate: { file: string; signals: string[] }) {
  return `${candidate.file}: ${candidate.signals.join(",")}`;
}

function nativeSearchInputFileKey(candidate: { file: string; signals: string[] }) {
  return `${candidate.file}: ${candidate.signals.join(",")}`;
}

function handwrittenSearchMatchKey(candidate: { file: string; line: number; signal: string }) {
  return `${candidate.file}:${candidate.line}: ${candidate.signal}`;
}

function generatedFilterContractDriftKey(candidate: { file: string; expression: string; reason: string }) {
  return `${candidate.file}: ${candidate.expression} (${candidate.reason})`;
}

function businessModuleViewUsageKey(candidate: { file: string; category: string; migrationTarget: string; container: string; key: string; occurrence: number }) {
  return `${candidate.file}: ${candidate.category}->${candidate.migrationTarget}/${candidate.container}/${candidate.key}#${candidate.occurrence}`;
}

function businessPageLayoutPrimitiveUsageKey(candidate: { file: string; primitive: string; usage: string }) {
  return `${candidate.file}: ${candidate.primitive} ${candidate.usage}`;
}

function businessToolbarCompositionWarningKey(candidate: { file: string; kind: string; detail: string }) {
  return `${candidate.file}: ${candidate.kind}: ${candidate.detail}`;
}

function businessCoreUiSurfaceBypassImportKey(candidate: { file: string; importedName: string; specifier: string }) {
  return `${candidate.file}: ${candidate.importedName} from ${candidate.specifier}`;
}

function uiForbiddenCoreUiTypeImportKey(candidate: { file: string; importedName: string; specifier: string }) {
  return `${candidate.file}: ${candidate.importedName} from ${candidate.specifier}`;
}

function businessVisualTokenHardcodingKey(candidate: { file: string; signals: string[] }) {
  return `${candidate.file}: ${candidate.signals.join(",")}`;
}

function coreBusinessFactLiteralKey(candidate: { file: string; literal: string; signal: string }) {
  return `${candidate.file}: ${candidate.signal}: ${candidate.literal}`;
}

function componentLocalUiConfigKey(candidate: { file: string; name: string; kind: string; itemCount: number }) {
  return `${candidate.file}: ${candidate.name} (${candidate.kind}, ${candidate.itemCount})`;
}

function platformCoreUiRuntimeBypassImportKey(candidate: { file: string; importedName: string; specifier: string }) {
  return `${candidate.file}: ${candidate.importedName} from ${candidate.specifier}`;
}

function pageSurfaceLayoutProtocolWarningKey(candidate: { file: string; kind: string; detail: string }) {
  return `${candidate.file}: ${candidate.kind}: ${candidate.detail}`;
}

function coreUiMissingOwnershipKey(candidate: { name: string; missing: string[] }) {
  return `${candidate.name}: missing ${candidate.missing.join(",")}`;
}

function coreUiInvalidOwnershipKey(candidate: { name: string; reason: string }) {
  return `${candidate.name}: ${candidate.reason}`;
}

function coreUiCommonDomainDependencyKey(candidate: { source: string; target: string; sourceSubcategory: string; targetSubcategory: string }) {
  return `${candidate.source} -> ${candidate.target}: ${candidate.sourceSubcategory} -> ${candidate.targetSubcategory}`;
}

function coreUiSiblingSubcategoryCouplingKey(candidate: { sourceSubcategory: string; targetSubcategory: string; edgeCount: number; sourceDependencyCount: number }) {
  return `${candidate.sourceSubcategory} -> ${candidate.targetSubcategory}: ${candidate.edgeCount}/${candidate.sourceDependencyCount}`;
}

function businessCommonRendererImportKey(candidate: { file: string; importedName: string; subcategory: string; specifier: string }) {
  return `${candidate.file}: ${candidate.importedName} (${candidate.subcategory}) from ${candidate.specifier}`;
}

function domainSharedLayoutShellKey(candidate: { file: string; reason: string }) {
  return `${candidate.file}: ${candidate.reason}`;
}

function surfaceOwnsPageChromeKey(candidate: { file: string; componentName: string; propName: string; detail: string }) {
  return `${candidate.file}: ${candidate.componentName}.${candidate.propName}: ${candidate.detail}`;
}

export const structureDetectorRegistry: StructureDetectorDefinition[] = [
  { baselineKey: "uncontractedApiRouteMethods", scope: "domain-blocker", current: (report) => report.drift.uncontractedApiRouteMethods.map(apiRouteMethodKey) },
  { baselineKey: "apiRouteMethodsWithDirectPrismaSignal", scope: "domain-blocker", current: (report) => report.drift.apiRoutesWithDirectPrismaSignal.map(apiRouteMethodKey) },
  { baselineKey: "apiRouteMethodsWithoutValidationSignal", scope: "domain-blocker", current: (report) => report.drift.apiRouteMethodsWithoutValidationSignal.map(apiRouteMethodKey) },
  { baselineKey: "apiRouteMethodsWithoutServiceSignal", scope: "domain-blocker", current: (report) => report.drift.apiRouteMethodsWithoutServiceSignal.map(apiRouteMethodKey) },
  { baselineKey: "appHookFiles", scope: "domain-blocker", current: (report) => report.drift.appHookFiles },
  { baselineKey: "appHookImplementationFiles", scope: "domain-blocker", current: (report) => report.drift.appHookImplementationFiles },
  { baselineKey: "domainUiCandidatesWithoutCore", scope: "ui-blocker", current: (report) => report.drift.domainUiCandidatesWithoutCore.map((candidate) => candidate.file) },
  { baselineKey: "legacyServiceFiles", scope: "domain-blocker", current: (report) => report.drift.legacyServiceFiles },
  { baselineKey: "legacyAuthHubFiles", scope: "domain-blocker", current: (report) => report.drift.legacyAuthHubFiles },
  { baselineKey: "legacyRootAccessFiles", scope: "domain-blocker", current: (report) => report.drift.legacyRootAccessFiles },
  { baselineKey: "legacyRootUtilityFiles", scope: "domain-blocker", current: (report) => report.drift.legacyRootUtilityFiles },
  { baselineKey: "legacyRootWithAuthFiles", scope: "domain-blocker", current: (report) => report.drift.legacyRootWithAuthFiles },
  { baselineKey: "legacyRootWithAuthImports", scope: "domain-blocker", current: (report) => report.drift.legacyRootWithAuthImports },
  { baselineKey: "legacyRootPrismaFiles", scope: "domain-blocker", current: (report) => report.drift.legacyRootPrismaFiles },
  { baselineKey: "legacyRootPrismaImports", scope: "domain-blocker", current: (report) => report.drift.legacyRootPrismaImports },
  { baselineKey: "legacyRootPermissionsImplementationFiles", scope: "domain-blocker", current: (report) => report.drift.legacyRootPermissionsImplementationFiles },
  { baselineKey: "legacyRootPermissionsImports", scope: "domain-blocker", current: (report) => report.drift.legacyRootPermissionsImports },
  { baselineKey: "legacyRootPeriodImplementationFiles", scope: "domain-blocker", current: (report) => report.drift.legacyRootPeriodImplementationFiles },
  { baselineKey: "legacyRootPeriodImports", scope: "domain-blocker", current: (report) => report.drift.legacyRootPeriodImports },
  { baselineKey: "legacyRootSearchSchemaFiles", scope: "domain-blocker", current: (report) => report.drift.legacyRootSearchSchemaFiles },
  { baselineKey: "unregisteredCoreUiImports", scope: "ui-blocker", current: (report) => report.drift.unregisteredCoreUiImports.map(unregisteredCoreUiImportKey) },
  { baselineKey: "unregisteredCoreUiExports", scope: "ui-blocker", current: (report) => report.drift.unregisteredCoreUiExports.map(unregisteredCoreUiExportKey) },
  { baselineKey: "duplicateCoreUiRegistrations", scope: "ui-blocker", current: (report) => report.drift.duplicateCoreUiRegistrations.map(duplicateCoreUiRegistrationKey) },
  { baselineKey: "pageDesignDriftFiles", scope: "ui-blocker", current: (report) => report.drift.pageDesignDriftFiles.map(pageDesignDriftFileKey) },
  { baselineKey: "nativeSearchInputFiles", scope: "ui-blocker", current: (report) => report.drift.nativeSearchInputFiles.map(nativeSearchInputFileKey) },
  { baselineKey: "handwrittenSearchMatches", scope: "domain-blocker", current: (report) => report.drift.handwrittenSearchMatches.map(handwrittenSearchMatchKey) },
  { baselineKey: "generatedFilterContractDrift", scope: "ui-blocker", current: (report) => report.drift.generatedFilterContractDrift.map(generatedFilterContractDriftKey) },
  { baselineKey: "businessModuleViewUsages", scope: "ui-blocker", current: (report) => report.drift.businessModuleViewUsages.map(businessModuleViewUsageKey) },
  { baselineKey: "businessPageLayoutPrimitiveUsages", scope: "ui-blocker", current: (report) => report.drift.businessPageLayoutPrimitiveUsages.map(businessPageLayoutPrimitiveUsageKey) },
  { baselineKey: "businessToolbarCompositionWarnings", scope: "ui-blocker", current: (report) => report.drift.businessToolbarCompositionWarnings.map(businessToolbarCompositionWarningKey) },
  { baselineKey: "businessCoreUiSurfaceBypassImports", scope: "ui-blocker", current: (report) => report.drift.businessCoreUiSurfaceBypassImports.map(businessCoreUiSurfaceBypassImportKey) },
  { baselineKey: "uiForbiddenCoreUiTypeImports", scope: "ui-blocker", current: (report) => report.drift.uiForbiddenCoreUiTypeImports.map(uiForbiddenCoreUiTypeImportKey) },
  { baselineKey: "businessVisualTokenHardcoding", scope: "hygiene", current: (report) => report.drift.businessVisualTokenHardcoding.map(businessVisualTokenHardcodingKey) },
  { baselineKey: "coreBusinessFactLiterals", scope: "hygiene", current: (report) => report.drift.coreBusinessFactLiterals.map(coreBusinessFactLiteralKey) },
  { baselineKey: "componentLocalUiConfigs", scope: "hygiene", current: (report) => report.drift.componentLocalUiConfigs.map(componentLocalUiConfigKey) },
  { baselineKey: "pageSurfaceLayoutProtocolWarnings", scope: "ui-blocker", current: (report) => report.drift.pageSurfaceLayoutProtocolWarnings.map(pageSurfaceLayoutProtocolWarningKey) },
  { baselineKey: "platformCoreUiRuntimeBypassImports", scope: "ui-blocker", current: (report) => report.drift.platformCoreUiRuntimeBypassImports.map(platformCoreUiRuntimeBypassImportKey) },
  { baselineKey: "coreUiMissingOwnership", scope: "ui-blocker", current: (report) => report.drift.coreUiMissingOwnership.map(coreUiMissingOwnershipKey) },
  { baselineKey: "coreUiInvalidOwnership", scope: "ui-blocker", current: (report) => report.drift.coreUiInvalidOwnership.map(coreUiInvalidOwnershipKey) },
  { baselineKey: "coreUiCommonDomainDependency", scope: "ui-blocker", current: (report) => report.drift.coreUiCommonDomainDependency.map(coreUiCommonDomainDependencyKey) },
  { baselineKey: "coreUiSiblingSubcategoryCoupling", scope: "ui-blocker", current: (report) => report.drift.coreUiSiblingSubcategoryCoupling.map(coreUiSiblingSubcategoryCouplingKey) },
  { baselineKey: "businessCommonRendererImports", scope: "ui-blocker", current: (report) => report.drift.businessCommonRendererImports.map(businessCommonRendererImportKey) },
  { baselineKey: "domainSharedLayoutShells", scope: "ui-blocker", current: (report) => report.drift.domainSharedLayoutShells.map(domainSharedLayoutShellKey) },
  { baselineKey: "surfaceOwnsPageChrome", scope: "ui-blocker", current: (report) => report.drift.surfaceOwnsPageChrome.map(surfaceOwnsPageChromeKey) },
  { baselineKey: "repeatedServiceGroups", scope: "domain-blocker", current: (report) => report.drift.repeatedServiceGroups.map(repeatedServiceGroupKey) },
  { baselineKey: "routePrimitiveSchemaDuplicates", scope: "domain-blocker", current: (report) => report.drift.routePrimitiveSchemaDuplicates.map(routePrimitiveSchemaKey) },
  { baselineKey: "apiRouteHelperDuplicates", scope: "domain-blocker", current: (report) => report.drift.apiRouteHelperDuplicates.map(apiRouteHelperKey) },
];

export function collectStructureRatchetChecks(
  report: StructureReport,
  scope: StructureDetectorScope = "all",
): StructureRatchetCheck[] {
  return structureDetectorRegistry
    .filter((detector) => scope === "all" || detector.scope === scope)
    .map((detector) => ({
      name: detector.baselineKey,
      current: detector.current(report),
    }));
}
