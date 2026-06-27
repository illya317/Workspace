import path from "node:path";
import ts from "typescript";

import {
  coreUiComponentRegistry,
  coreUiComponentRegistryRaw,
  type CoreUiComponentOwnerL1,
} from "../../packages/core/ui/component-registry";

type SourceInfo = {
  relPath: string;
  text: string;
  sourceFile: ts.SourceFile;
  hasJsx: boolean;
};

export type CoreUiMissingOwnership = {
  name: string;
  missing: string[];
};

export type CoreUiInvalidOwnership = {
  name: string;
  reason: string;
};

export type CoreUiCommonDomainDependency = {
  source: string;
  target: string;
  sourceOwnerL2: string;
  targetOwnerL2: string;
};

export type CoreUiSiblingL2Coupling = {
  sourceOwnerL2: string;
  targetOwnerL2: string;
  edgeCount: number;
  sourceDependencyCount: number;
  ratio: number;
  targets: string[];
};

export type CoreUiOwnershipWarnings = {
  coreUiMissingOwnership: CoreUiMissingOwnership[];
  coreUiInvalidOwnership: CoreUiInvalidOwnership[];
  coreUiCommonDomainDependency: CoreUiCommonDomainDependency[];
  coreUiSiblingL2Coupling: CoreUiSiblingL2Coupling[];
};

export type BusinessCommonRendererImport = {
  file: string;
  importedName: string;
  ownerL2: string;
  specifier: string;
};

export type DomainSharedL2LayoutShell = {
  file: string;
  packageName: string;
  reason: string;
};

export type SurfaceOwnsPageChrome = {
  file: string;
  componentName: string;
  propName: string;
  detail: string;
};

const BUSINESS_PACKAGE_NAMES = new Set([
  "administration",
  "external",
  "finance",
  "hr",
  "library",
  "production",
  "work",
]);

const CORE_UI_COMMON_RENDERER_IMPORT_NAMES = new Set([
  "ActionButton",
  "ActionGlyph",
  "Badge",
  "CalendarDateInput",
  "CommandButton",
  "FieldValueFilter",
  "FileField",
  "InputControl",
  "NavigationSurface",
  "OptionPicker",
  "Pagination",
  "SearchInput",
  "SelectField",
  "SelectorPanel",
  "TabBar",
  "TextField",
  "Toolbar",
]);

function getPackageName(relPath: string) {
  const parts = relPath.split("/");
  return parts[0] === "packages" && parts[1] ? parts[1] : "app-root";
}

function isBusinessUiSurfaceScanFile(file: SourceInfo) {
  if (!/\.(ts|tsx)$/.test(file.relPath)) return false;
  if (file.relPath.startsWith("app/(modules)/")) return true;

  const match = /^packages\/([^/]+)\/ui\//.exec(file.relPath);
  return Boolean(match && BUSINESS_PACKAGE_NAMES.has(match[1]));
}

function registryByName() {
  return new Map(coreUiComponentRegistry.map((component) => [component.name, component]));
}

function ownerL1FromOwnerL2(ownerL2: string | undefined): CoreUiComponentOwnerL1 | null {
  if (!ownerL2) return null;
  const prefix = ownerL2.split(".")[0];
  if (prefix === "page" || prefix === "data" || prefix === "form" || prefix === "common" || prefix === "feedback") {
    return prefix;
  }
  return null;
}

function relationshipTargets(component: { composes?: readonly string[]; includes?: readonly string[]; foundations?: readonly string[] }) {
  return [
    ...(component.composes ?? component.includes ?? []),
    ...(component.foundations ?? []),
  ];
}

export function coreUiOwnershipWarningKey(candidate:
  | CoreUiMissingOwnership
  | CoreUiInvalidOwnership
  | CoreUiCommonDomainDependency
  | CoreUiSiblingL2Coupling
) {
  if ("missing" in candidate) return `${candidate.name}: missing ${candidate.missing.join(",")}`;
  if ("reason" in candidate) return `${candidate.name}: ${candidate.reason}`;
  if ("source" in candidate) return `${candidate.source} -> ${candidate.target}: ${candidate.sourceOwnerL2} -> ${candidate.targetOwnerL2}`;
  return `${candidate.sourceOwnerL2} -> ${candidate.targetOwnerL2}: ${candidate.edgeCount}/${candidate.sourceDependencyCount}`;
}

export function findCoreUiOwnershipWarnings(): CoreUiOwnershipWarnings {
  const byName = registryByName();
  const coreUiMissingOwnership: CoreUiMissingOwnership[] = [];
  const coreUiInvalidOwnership: CoreUiInvalidOwnership[] = [];
  const coreUiCommonDomainDependency: CoreUiCommonDomainDependency[] = [];
  const edgeCounts = new Map<string, {
    sourceOwnerL2: string;
    targetOwnerL2: string;
    edgeCount: number;
    targets: Set<string>;
  }>();
  const dependencyCounts = new Map<string, number>();

  for (const raw of coreUiComponentRegistryRaw) {
    const missing = ["ownerL1", "ownerL2", "role", "publicUse"]
      .filter((fieldName) => raw[fieldName as keyof typeof raw] === undefined);
    if (missing.length > 0) coreUiMissingOwnership.push({ name: raw.name, missing });
  }

  for (const component of coreUiComponentRegistry) {
    const ownerL1 = component.ownerL1;
    const ownerL2 = component.ownerL2;
    const expectedOwnerL1 = ownerL1FromOwnerL2(ownerL2);
    if (!ownerL1 || !ownerL2 || !component.role || !component.publicUse) {
      coreUiInvalidOwnership.push({ name: component.name, reason: "enriched registry entry still has missing ownership fields" });
      continue;
    }
    if (expectedOwnerL1 !== ownerL1) {
      coreUiInvalidOwnership.push({ name: component.name, reason: `ownerL2 ${ownerL2} does not belong to ownerL1 ${ownerL1}` });
    }
    if (component.uiLevel === 1 && component.role !== "entry") {
      coreUiInvalidOwnership.push({ name: component.name, reason: "uiLevel 1 must use role=entry" });
    }

    const targets = relationshipTargets(component);
    dependencyCounts.set(ownerL2, (dependencyCounts.get(ownerL2) ?? 0) + targets.length);
    for (const targetName of targets) {
      const target = byName.get(targetName);
      if (!target?.ownerL1 || !target.ownerL2) continue;
      if (ownerL1 === "common" && target.ownerL1 !== "common") {
        coreUiCommonDomainDependency.push({
          source: component.name,
          target: target.name,
          sourceOwnerL2: ownerL2,
          targetOwnerL2: target.ownerL2,
        });
      }
      if (ownerL2 !== target.ownerL2 && ownerL1 !== "common" && target.ownerL1 !== "common") {
        const key = `${ownerL2} -> ${target.ownerL2}`;
        const edge = edgeCounts.get(key) ?? {
          sourceOwnerL2: ownerL2,
          targetOwnerL2: target.ownerL2,
          edgeCount: 0,
          targets: new Set<string>(),
        };
        edge.edgeCount += 1;
        edge.targets.add(`${component.name}->${target.name}`);
        edgeCounts.set(key, edge);
      }
    }
  }

  const coreUiSiblingL2Coupling = [...edgeCounts.values()]
    .map((edge) => {
      const sourceDependencyCount = dependencyCounts.get(edge.sourceOwnerL2) ?? 0;
      return {
        sourceOwnerL2: edge.sourceOwnerL2,
        targetOwnerL2: edge.targetOwnerL2,
        edgeCount: edge.edgeCount,
        sourceDependencyCount,
        ratio: sourceDependencyCount === 0 ? 0 : edge.edgeCount / sourceDependencyCount,
        targets: [...edge.targets].sort(),
      };
    })
    .filter((edge) => {
      const reverse = edgeCounts.get(`${edge.targetOwnerL2} -> ${edge.sourceOwnerL2}`);
      return edge.edgeCount >= 3 || edge.ratio > 0.25 || Boolean(reverse);
    });

  return {
    coreUiMissingOwnership: coreUiMissingOwnership.sort((left, right) => left.name.localeCompare(right.name)),
    coreUiInvalidOwnership: coreUiInvalidOwnership.sort((left, right) => left.name.localeCompare(right.name)),
    coreUiCommonDomainDependency: coreUiCommonDomainDependency.sort((left, right) => coreUiOwnershipWarningKey(left).localeCompare(coreUiOwnershipWarningKey(right))),
    coreUiSiblingL2Coupling: coreUiSiblingL2Coupling.sort((left, right) => coreUiOwnershipWarningKey(left).localeCompare(coreUiOwnershipWarningKey(right))),
  };
}

export function findBusinessCommonRendererImports(files: SourceInfo[]) {
  const candidates: BusinessCommonRendererImport[] = [];
  const byName = registryByName();

  for (const file of files) {
    if (!isBusinessUiSurfaceScanFile(file)) continue;

    for (const statement of file.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (specifier !== "@workspace/core/ui") continue;

      const importClause = statement.importClause;
      if (!importClause || importClause.isTypeOnly) continue;

      const namedBindings = importClause.namedBindings;
      if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;

      for (const element of namedBindings.elements) {
        if (element.isTypeOnly) continue;
        const importedName = element.propertyName?.text ?? element.name.text;
        const component = byName.get(importedName);
        if (component?.agentExposure?.mode === "direct") continue;
        const isCommonRenderer = component?.ownerL1 === "common" && component.role !== "foundation";
        if (!isCommonRenderer && !CORE_UI_COMMON_RENDERER_IMPORT_NAMES.has(importedName)) continue;
        candidates.push({
          file: file.relPath,
          importedName,
          ownerL2: component?.ownerL2 ?? "common.unknown",
          specifier,
        });
      }
    }
  }

  return candidates.sort((left, right) => `${left.file}:${left.importedName}`.localeCompare(`${right.file}:${right.importedName}`));
}

export function findDomainSharedL2LayoutShells(files: SourceInfo[]) {
  const candidates: DomainSharedL2LayoutShell[] = [];

  for (const file of files) {
    if (!/^packages\/[^/]+\/ui\//.test(file.relPath)) continue;
    const packageName = getPackageName(file.relPath);
    if (!BUSINESS_PACKAGE_NAMES.has(packageName)) continue;
    if (!/\.(ts|tsx)$/.test(file.relPath)) continue;
    const baseName = path.basename(file.relPath, path.extname(file.relPath));
    const isSharedLayoutShell = /(Shell|ToolbarProvider)$/.test(baseName);
    const isSharedPageChrome = /page-chrome/i.test(baseName)
      || /(?:export\s+)?function\s+use[A-Z][A-Za-z0-9]*PageChrome/.test(file.text)
      || /(?:export\s+)?const\s+use[A-Z][A-Za-z0-9]*PageChrome\s*=/.test(file.text);
    if (!isSharedLayoutShell && !isSharedPageChrome) continue;
    if (!file.hasJsx && !/PageSurface|PageSurfaceNavigationSpec|PageSurfaceToolbar|Toolbar|TabBar|NavigationSurface/.test(file.text)) continue;
    candidates.push({
      file: file.relPath,
      packageName,
      reason: isSharedPageChrome
        ? "domain shared page chrome hook must become route/module PageSurface props or a thin spec adapter, not Core/Page API registry"
        : "domain shared L2 layout shell must stay as route/module adapter debt, not Core/Page API registry",
    });
  }

  return candidates.sort((left, right) => left.file.localeCompare(right.file));
}

export function findSurfaceOwnsPageChrome(files: SourceInfo[]) {
  const warnings: SurfaceOwnsPageChrome[] = [];
  const surfaceTypeFiles = files.filter((file) => /^packages\/core\/ui\/(DataSurface|FormSurface)\.types\.ts$/.test(file.relPath));

  for (const file of surfaceTypeFiles) {
    const checks: Array<{ componentName: string; propName: string; pattern: RegExp; detail: string }> = [
      {
        componentName: "DataSurface",
        propName: "toolbar",
        pattern: /DataSurfaceToolbarSpec|toolbar\??:/,
        detail: "DataSurface still declares page toolbar ownership; page chrome belongs to PageSurface.toolbar",
      },
      {
        componentName: "DataSurface",
        propName: "pagination",
        pattern: /DataSurfacePaginationSpec|pagination\??:/,
        detail: "DataSurface still declares page pagination ownership; page chrome belongs to PageSurface.footer.pagination",
      },
      {
        componentName: "FormSurface",
        propName: "toolbar",
        pattern: /FormSurfaceToolbarSpec|toolbar\??:/,
        detail: "FormSurface still declares page toolbar ownership; page chrome belongs to PageSurface.toolbar",
      },
    ];

    for (const check of checks) {
      if (!file.relPath.includes(check.componentName)) continue;
      if (!check.pattern.test(file.text)) continue;
      warnings.push({
        file: file.relPath,
        componentName: check.componentName,
        propName: check.propName,
        detail: check.detail,
      });
    }
  }

  return warnings.sort((left, right) => `${left.file}:${left.propName}`.localeCompare(`${right.file}:${right.propName}`));
}
