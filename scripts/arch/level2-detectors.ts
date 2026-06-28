import type { createLevel2Report } from "./level2";

export type Level2Report = ReturnType<typeof createLevel2Report>;
export type Level2Baseline = Record<string, string[]>;

export type Level2RatchetCheck = {
  name: string;
  current: string[];
};

type Level2DetectorDefinition = {
  baselineKey: string;
  current: (report: Level2Report) => string[];
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

function coreUiSiblingL2CouplingKey(candidate: { sourceSubcategory: string; targetSubcategory: string; edgeCount: number; sourceDependencyCount: number }) {
  return `${candidate.sourceSubcategory} -> ${candidate.targetSubcategory}: ${candidate.edgeCount}/${candidate.sourceDependencyCount}`;
}

function businessCommonRendererImportKey(candidate: { file: string; importedName: string; subcategory: string; specifier: string }) {
  return `${candidate.file}: ${candidate.importedName} (${candidate.subcategory}) from ${candidate.specifier}`;
}

function domainSharedL2LayoutShellKey(candidate: { file: string; reason: string }) {
  return `${candidate.file}: ${candidate.reason}`;
}

function surfaceOwnsPageChromeKey(candidate: { file: string; componentName: string; propName: string; detail: string }) {
  return `${candidate.file}: ${candidate.componentName}.${candidate.propName}: ${candidate.detail}`;
}

export const level2DetectorRegistry: Level2DetectorDefinition[] = [
  { baselineKey: "uncontractedApiRouteMethods", current: (report) => report.drift.uncontractedApiRouteMethods.map(apiRouteMethodKey) },
  { baselineKey: "apiRouteMethodsWithDirectPrismaSignal", current: (report) => report.drift.apiRoutesWithDirectPrismaSignal.map(apiRouteMethodKey) },
  { baselineKey: "apiRouteMethodsWithoutValidationSignal", current: (report) => report.drift.apiRouteMethodsWithoutValidationSignal.map(apiRouteMethodKey) },
  { baselineKey: "apiRouteMethodsWithoutServiceSignal", current: (report) => report.drift.apiRouteMethodsWithoutServiceSignal.map(apiRouteMethodKey) },
  { baselineKey: "appHookFiles", current: (report) => report.drift.appHookFiles },
  { baselineKey: "appHookImplementationFiles", current: (report) => report.drift.appHookImplementationFiles },
  { baselineKey: "domainUiCandidatesWithoutCore", current: (report) => report.drift.domainUiCandidatesWithoutCore.map((candidate) => candidate.file) },
  { baselineKey: "legacyServiceFiles", current: (report) => report.drift.legacyServiceFiles },
  { baselineKey: "legacyAuthHubFiles", current: (report) => report.drift.legacyAuthHubFiles },
  { baselineKey: "legacyRootAccessFiles", current: (report) => report.drift.legacyRootAccessFiles },
  { baselineKey: "legacyRootUtilityFiles", current: (report) => report.drift.legacyRootUtilityFiles },
  { baselineKey: "legacyRootWithAuthFiles", current: (report) => report.drift.legacyRootWithAuthFiles },
  { baselineKey: "legacyRootWithAuthImports", current: (report) => report.drift.legacyRootWithAuthImports },
  { baselineKey: "legacyRootPrismaFiles", current: (report) => report.drift.legacyRootPrismaFiles },
  { baselineKey: "legacyRootPrismaImports", current: (report) => report.drift.legacyRootPrismaImports },
  { baselineKey: "legacyRootPermissionsImplementationFiles", current: (report) => report.drift.legacyRootPermissionsImplementationFiles },
  { baselineKey: "legacyRootPermissionsImports", current: (report) => report.drift.legacyRootPermissionsImports },
  { baselineKey: "legacyRootPeriodImplementationFiles", current: (report) => report.drift.legacyRootPeriodImplementationFiles },
  { baselineKey: "legacyRootPeriodImports", current: (report) => report.drift.legacyRootPeriodImports },
  { baselineKey: "legacyRootSearchSchemaFiles", current: (report) => report.drift.legacyRootSearchSchemaFiles },
  { baselineKey: "unregisteredCoreUiImports", current: (report) => report.drift.unregisteredCoreUiImports.map(unregisteredCoreUiImportKey) },
  { baselineKey: "unregisteredCoreUiExports", current: (report) => report.drift.unregisteredCoreUiExports.map(unregisteredCoreUiExportKey) },
  { baselineKey: "duplicateCoreUiRegistrations", current: (report) => report.drift.duplicateCoreUiRegistrations.map(duplicateCoreUiRegistrationKey) },
  { baselineKey: "pageDesignDriftFiles", current: (report) => report.drift.pageDesignDriftFiles.map(pageDesignDriftFileKey) },
  { baselineKey: "nativeSearchInputFiles", current: (report) => report.drift.nativeSearchInputFiles.map(nativeSearchInputFileKey) },
  { baselineKey: "handwrittenSearchMatches", current: (report) => report.drift.handwrittenSearchMatches.map(handwrittenSearchMatchKey) },
  { baselineKey: "generatedFilterContractDrift", current: (report) => report.drift.generatedFilterContractDrift.map(generatedFilterContractDriftKey) },
  { baselineKey: "businessModuleViewUsages", current: (report) => report.drift.businessModuleViewUsages.map(businessModuleViewUsageKey) },
  { baselineKey: "businessPageLayoutPrimitiveUsages", current: (report) => report.drift.businessPageLayoutPrimitiveUsages.map(businessPageLayoutPrimitiveUsageKey) },
  { baselineKey: "businessToolbarCompositionWarnings", current: (report) => report.drift.businessToolbarCompositionWarnings.map(businessToolbarCompositionWarningKey) },
  { baselineKey: "businessCoreUiSurfaceBypassImports", current: (report) => report.drift.businessCoreUiSurfaceBypassImports.map(businessCoreUiSurfaceBypassImportKey) },
  { baselineKey: "uiForbiddenCoreUiTypeImports", current: (report) => report.drift.uiForbiddenCoreUiTypeImports.map(uiForbiddenCoreUiTypeImportKey) },
  { baselineKey: "businessVisualTokenHardcoding", current: (report) => report.drift.businessVisualTokenHardcoding.map(businessVisualTokenHardcodingKey) },
  { baselineKey: "coreBusinessFactLiterals", current: (report) => report.drift.coreBusinessFactLiterals.map(coreBusinessFactLiteralKey) },
  { baselineKey: "componentLocalUiConfigs", current: (report) => report.drift.componentLocalUiConfigs.map(componentLocalUiConfigKey) },
  { baselineKey: "pageSurfaceLayoutProtocolWarnings", current: (report) => report.drift.pageSurfaceLayoutProtocolWarnings.map(pageSurfaceLayoutProtocolWarningKey) },
  { baselineKey: "platformCoreUiRuntimeBypassImports", current: (report) => report.drift.platformCoreUiRuntimeBypassImports.map(platformCoreUiRuntimeBypassImportKey) },
  { baselineKey: "coreUiMissingOwnership", current: (report) => report.drift.coreUiMissingOwnership.map(coreUiMissingOwnershipKey) },
  { baselineKey: "coreUiInvalidOwnership", current: (report) => report.drift.coreUiInvalidOwnership.map(coreUiInvalidOwnershipKey) },
  { baselineKey: "coreUiCommonDomainDependency", current: (report) => report.drift.coreUiCommonDomainDependency.map(coreUiCommonDomainDependencyKey) },
  { baselineKey: "coreUiSiblingL2Coupling", current: (report) => report.drift.coreUiSiblingL2Coupling.map(coreUiSiblingL2CouplingKey) },
  { baselineKey: "businessCommonRendererImports", current: (report) => report.drift.businessCommonRendererImports.map(businessCommonRendererImportKey) },
  { baselineKey: "domainSharedL2LayoutShells", current: (report) => report.drift.domainSharedL2LayoutShells.map(domainSharedL2LayoutShellKey) },
  { baselineKey: "surfaceOwnsPageChrome", current: (report) => report.drift.surfaceOwnsPageChrome.map(surfaceOwnsPageChromeKey) },
  { baselineKey: "repeatedServiceGroups", current: (report) => report.drift.repeatedServiceGroups.map(repeatedServiceGroupKey) },
  { baselineKey: "routePrimitiveSchemaDuplicates", current: (report) => report.drift.routePrimitiveSchemaDuplicates.map(routePrimitiveSchemaKey) },
  { baselineKey: "apiRouteHelperDuplicates", current: (report) => report.drift.apiRouteHelperDuplicates.map(apiRouteHelperKey) },
];

export function collectLevel2RatchetChecks(report: Level2Report): Level2RatchetCheck[] {
  return level2DetectorRegistry.map((detector) => ({
    name: detector.baselineKey,
    current: detector.current(report),
  }));
}
