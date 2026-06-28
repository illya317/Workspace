import fs from "node:fs";
import path from "node:path";

import { createLevel2Report } from "./level2";

type Level2Baseline = {
  uncontractedApiRouteMethods: string[];
  apiRouteMethodsWithDirectPrismaSignal: string[];
  apiRouteMethodsWithoutValidationSignal: string[];
  apiRouteMethodsWithoutServiceSignal: string[];
  appHookFiles: string[];
  appHookImplementationFiles: string[];
  domainUiCandidatesWithoutCore: string[];
  legacyServiceFiles: string[];
  legacyAuthHubFiles: string[];
  legacyRootAccessFiles: string[];
  legacyRootUtilityFiles: string[];
  legacyRootWithAuthFiles: string[];
  legacyRootWithAuthImports: string[];
  legacyRootPrismaFiles: string[];
  legacyRootPrismaImports: string[];
  legacyRootPermissionsImplementationFiles: string[];
  legacyRootPermissionsImports: string[];
  legacyRootPeriodImplementationFiles: string[];
  legacyRootPeriodImports: string[];
  legacyRootSearchSchemaFiles: string[];
  unregisteredCoreUiImports: string[];
  unregisteredCoreUiExports: string[];
  duplicateCoreUiRegistrations: string[];
  pageDesignDriftFiles: string[];
  nativeSearchInputFiles: string[];
  handwrittenSearchMatches: string[];
  generatedFilterContractDrift: string[];
  businessModuleViewUsages: string[];
  businessPageLayoutPrimitiveUsages: string[];
  businessToolbarCompositionWarnings: string[];
  businessCoreUiSurfaceBypassImports: string[];
  uiForbiddenCoreUiTypeImports: string[];
  pageSurfaceLayoutProtocolWarnings: string[];
  platformCoreUiRuntimeBypassImports: string[];
  coreUiMissingOwnership: string[];
  coreUiInvalidOwnership: string[];
  coreUiCommonDomainDependency: string[];
  coreUiSiblingL2Coupling: string[];
  businessCommonRendererImports: string[];
  domainSharedL2LayoutShells: string[];
  surfaceOwnsPageChrome: string[];
  repeatedServiceGroups: string[];
  routePrimitiveSchemaDuplicates: string[];
  apiRouteHelperDuplicates: string[];
};

const ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "scripts/arch/level2-baseline.json");

function readBaseline(): Level2Baseline {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Level2Baseline;
}

function uniqueSorted(items: string[]) {
  return [...new Set(items)].sort();
}

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

function coreUiCommonDomainDependencyKey(candidate: { source: string; target: string; sourceOwnerL2: string; targetOwnerL2: string }) {
  return `${candidate.source} -> ${candidate.target}: ${candidate.sourceOwnerL2} -> ${candidate.targetOwnerL2}`;
}

function coreUiSiblingL2CouplingKey(candidate: { sourceOwnerL2: string; targetOwnerL2: string; edgeCount: number; sourceDependencyCount: number }) {
  return `${candidate.sourceOwnerL2} -> ${candidate.targetOwnerL2}: ${candidate.edgeCount}/${candidate.sourceDependencyCount}`;
}

function businessCommonRendererImportKey(candidate: { file: string; importedName: string; ownerL2: string; specifier: string }) {
  return `${candidate.file}: ${candidate.importedName} (${candidate.ownerL2}) from ${candidate.specifier}`;
}

function domainSharedL2LayoutShellKey(candidate: { file: string; reason: string }) {
  return `${candidate.file}: ${candidate.reason}`;
}

function surfaceOwnsPageChromeKey(candidate: { file: string; componentName: string; propName: string; detail: string }) {
  return `${candidate.file}: ${candidate.componentName}.${candidate.propName}: ${candidate.detail}`;
}

function diff(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function checkRatchet(name: keyof Level2Baseline, current: string[], baseline: string[]) {
  const normalizedCurrent = uniqueSorted(current);
  const normalizedBaseline = uniqueSorted(baseline);
  const additions = diff(normalizedCurrent, normalizedBaseline);
  const stale = diff(normalizedBaseline, normalizedCurrent);

  if (additions.length > 0) {
    console.error(`✗ Level 2 baseline ratchet failed: new ${name} item(s) detected.`);
    for (const item of additions) console.error(`  + ${item}`);
    return false;
  }

  if (stale.length > 0) {
    console.error(`✗ Level 2 baseline ratchet failed: stale ${name} baseline item(s).`);
    console.error("  Remove migrated items from scripts/arch/level2-baseline.json.");
    for (const item of stale) console.error(`  - ${item}`);
    return false;
  }

  return true;
}

export function checkLevel2Ratchet() {
  try {
    const baseline = readBaseline();
    const report = createLevel2Report();

    const checks: Array<[keyof Level2Baseline, string[]]> = [
      [
        "uncontractedApiRouteMethods",
        report.drift.uncontractedApiRouteMethods.map(apiRouteMethodKey),
      ],
      [
        "apiRouteMethodsWithDirectPrismaSignal",
        report.drift.apiRoutesWithDirectPrismaSignal.map(apiRouteMethodKey),
      ],
      [
        "apiRouteMethodsWithoutValidationSignal",
        report.drift.apiRouteMethodsWithoutValidationSignal.map(apiRouteMethodKey),
      ],
      [
        "apiRouteMethodsWithoutServiceSignal",
        report.drift.apiRouteMethodsWithoutServiceSignal.map(apiRouteMethodKey),
      ],
      ["appHookFiles", report.drift.appHookFiles],
      ["appHookImplementationFiles", report.drift.appHookImplementationFiles],
      [
        "domainUiCandidatesWithoutCore",
        report.drift.domainUiCandidatesWithoutCore.map((candidate) => candidate.file),
      ],
      ["legacyServiceFiles", report.drift.legacyServiceFiles],
      ["legacyAuthHubFiles", report.drift.legacyAuthHubFiles],
      ["legacyRootAccessFiles", report.drift.legacyRootAccessFiles],
      ["legacyRootUtilityFiles", report.drift.legacyRootUtilityFiles],
      ["legacyRootWithAuthFiles", report.drift.legacyRootWithAuthFiles],
      ["legacyRootWithAuthImports", report.drift.legacyRootWithAuthImports],
      ["legacyRootPrismaFiles", report.drift.legacyRootPrismaFiles],
      ["legacyRootPrismaImports", report.drift.legacyRootPrismaImports],
      [
        "legacyRootPermissionsImplementationFiles",
        report.drift.legacyRootPermissionsImplementationFiles,
      ],
      ["legacyRootPermissionsImports", report.drift.legacyRootPermissionsImports],
      ["legacyRootPeriodImplementationFiles", report.drift.legacyRootPeriodImplementationFiles],
      ["legacyRootPeriodImports", report.drift.legacyRootPeriodImports],
      ["legacyRootSearchSchemaFiles", report.drift.legacyRootSearchSchemaFiles],
      [
        "unregisteredCoreUiImports",
        report.drift.unregisteredCoreUiImports.map(unregisteredCoreUiImportKey),
      ],
      [
        "unregisteredCoreUiExports",
        report.drift.unregisteredCoreUiExports.map(unregisteredCoreUiExportKey),
      ],
      [
        "duplicateCoreUiRegistrations",
        report.drift.duplicateCoreUiRegistrations.map(duplicateCoreUiRegistrationKey),
      ],
      [
        "pageDesignDriftFiles",
        report.drift.pageDesignDriftFiles.map(pageDesignDriftFileKey),
      ],
      [
        "nativeSearchInputFiles",
        report.drift.nativeSearchInputFiles.map(nativeSearchInputFileKey),
      ],
      [
        "handwrittenSearchMatches",
        report.drift.handwrittenSearchMatches.map(handwrittenSearchMatchKey),
      ],
      [
        "generatedFilterContractDrift",
        report.drift.generatedFilterContractDrift.map(generatedFilterContractDriftKey),
      ],
      [
        "businessModuleViewUsages",
        report.drift.businessModuleViewUsages.map(businessModuleViewUsageKey),
      ],
      [
        "businessPageLayoutPrimitiveUsages",
        report.drift.businessPageLayoutPrimitiveUsages.map(businessPageLayoutPrimitiveUsageKey),
      ],
      [
        "businessToolbarCompositionWarnings",
        report.drift.businessToolbarCompositionWarnings.map(businessToolbarCompositionWarningKey),
      ],
      [
        "businessCoreUiSurfaceBypassImports",
        report.drift.businessCoreUiSurfaceBypassImports.map(businessCoreUiSurfaceBypassImportKey),
      ],
      [
        "uiForbiddenCoreUiTypeImports",
        report.drift.uiForbiddenCoreUiTypeImports.map(uiForbiddenCoreUiTypeImportKey),
      ],
      [
        "pageSurfaceLayoutProtocolWarnings",
        report.drift.pageSurfaceLayoutProtocolWarnings.map(pageSurfaceLayoutProtocolWarningKey),
      ],
      [
        "platformCoreUiRuntimeBypassImports",
        report.drift.platformCoreUiRuntimeBypassImports.map(platformCoreUiRuntimeBypassImportKey),
      ],
      [
        "coreUiMissingOwnership",
        report.drift.coreUiMissingOwnership.map(coreUiMissingOwnershipKey),
      ],
      [
        "coreUiInvalidOwnership",
        report.drift.coreUiInvalidOwnership.map(coreUiInvalidOwnershipKey),
      ],
      [
        "coreUiCommonDomainDependency",
        report.drift.coreUiCommonDomainDependency.map(coreUiCommonDomainDependencyKey),
      ],
      [
        "coreUiSiblingL2Coupling",
        report.drift.coreUiSiblingL2Coupling.map(coreUiSiblingL2CouplingKey),
      ],
      [
        "businessCommonRendererImports",
        report.drift.businessCommonRendererImports.map(businessCommonRendererImportKey),
      ],
      [
        "domainSharedL2LayoutShells",
        report.drift.domainSharedL2LayoutShells.map(domainSharedL2LayoutShellKey),
      ],
      [
        "surfaceOwnsPageChrome",
        report.drift.surfaceOwnsPageChrome.map(surfaceOwnsPageChromeKey),
      ],
      [
        "repeatedServiceGroups",
        report.drift.repeatedServiceGroups.map(repeatedServiceGroupKey),
      ],
      [
        "routePrimitiveSchemaDuplicates",
        report.drift.routePrimitiveSchemaDuplicates.map(routePrimitiveSchemaKey),
      ],
      [
        "apiRouteHelperDuplicates",
        report.drift.apiRouteHelperDuplicates.map(apiRouteHelperKey),
      ],
    ];

    for (const [name, current] of checks) {
      if (!checkRatchet(name, current, baseline[name])) return false;
    }

    console.log("✓ Level 2 baseline ratchet passed.");
    return true;
  } catch (error) {
    console.error("✗ Level 2 baseline ratchet failed.");
    console.error(error instanceof Error ? `  ${error.message}` : error);
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkLevel2Ratchet() ? 0 : 1);
}
