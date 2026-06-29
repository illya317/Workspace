import path from "node:path";
import ts from "typescript";

import {
  coreUiComponentRegistry,
  coreUiComponentRegistryRaw,
  type CoreUiComponentCategory,
} from "../../packages/core/ui/registry/component-registry";

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
  sourceSubcategory: string;
  targetSubcategory: string;
};

export type CoreUiSiblingSubcategoryCoupling = {
  sourceSubcategory: string;
  targetSubcategory: string;
  edgeCount: number;
  sourceDependencyCount: number;
  ratio: number;
  targets: string[];
};

export type CoreUiOwnershipWarnings = {
  coreUiMissingOwnership: CoreUiMissingOwnership[];
  coreUiInvalidOwnership: CoreUiInvalidOwnership[];
  coreUiCommonDomainDependency: CoreUiCommonDomainDependency[];
  coreUiSiblingSubcategoryCoupling: CoreUiSiblingSubcategoryCoupling[];
};

export type BusinessCommonRendererImport = {
  file: string;
  importedName: string;
  subcategory: string;
  specifier: string;
};

export type DomainSharedLayoutShell = {
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

function categoryFromSubcategory(subcategory: string | undefined): CoreUiComponentCategory | null {
  if (!subcategory) return null;
  const prefix = subcategory.split(".")[0];
  if (
    prefix === "page"
    || prefix === "data"
    || prefix === "form"
    || prefix === "document"
    || prefix === "visualization"
    || prefix === "common"
    || prefix === "feedback"
  ) {
    return prefix;
  }
  return null;
}

function relationshipTargets(component: { composes?: readonly string[] }) {
  return component.composes ?? [];
}

const CORE_UI_ENCAPSULATION_L2_EDGES = new Set([
  "data.surface -> data.table",
  "page.surface -> data.surface",
  "page.surface -> document.surface",
  "page.surface -> form.surface",
  "page.surface -> visualization.surface",
  "feedback.service -> feedback.renderer",
  "page.surface -> page.blocks",
  "page.surface -> page.frame",
]);

function isCoreUiEncapsulationEdge(
  source: { subcategory?: string },
  target: { subcategory?: string },
) {
  if (!source.subcategory || !target.subcategory) return false;
  return CORE_UI_ENCAPSULATION_L2_EDGES.has(`${source.subcategory} -> ${target.subcategory}`);
}

export function coreUiOwnershipWarningKey(candidate:
  | CoreUiMissingOwnership
  | CoreUiInvalidOwnership
  | CoreUiCommonDomainDependency
  | CoreUiSiblingSubcategoryCoupling
) {
  if ("missing" in candidate) return `${candidate.name}: missing ${candidate.missing.join(",")}`;
  if ("reason" in candidate) return `${candidate.name}: ${candidate.reason}`;
  if ("source" in candidate) return `${candidate.source} -> ${candidate.target}: ${candidate.sourceSubcategory} -> ${candidate.targetSubcategory}`;
  return `${candidate.sourceSubcategory} -> ${candidate.targetSubcategory}: ${candidate.edgeCount}/${candidate.sourceDependencyCount}`;
}

export function findCoreUiOwnershipWarnings(): CoreUiOwnershipWarnings {
  const byName = registryByName();
  const coreUiMissingOwnership: CoreUiMissingOwnership[] = [];
  const coreUiInvalidOwnership: CoreUiInvalidOwnership[] = [];
  const coreUiCommonDomainDependency: CoreUiCommonDomainDependency[] = [];
  const edgeCounts = new Map<string, {
    sourceSubcategory: string;
    targetSubcategory: string;
    edgeCount: number;
    targets: Set<string>;
  }>();
  const dependencyCounts = new Map<string, number>();

  for (const raw of coreUiComponentRegistryRaw) {
    const missing = ["category", "subcategory"]
      .filter((fieldName) => raw[fieldName as keyof typeof raw] === undefined);
    if (missing.length > 0) coreUiMissingOwnership.push({ name: raw.name, missing });
  }

  for (const component of coreUiComponentRegistry) {
    const category = component.category;
    const subcategory = component.subcategory;
    const expectedCategory = categoryFromSubcategory(subcategory);
    if (!category || !subcategory) {
      coreUiInvalidOwnership.push({ name: component.name, reason: "enriched registry entry still has missing ownership fields" });
      continue;
    }
    if (expectedCategory !== category) {
      coreUiInvalidOwnership.push({ name: component.name, reason: `subcategory ${subcategory} does not belong to category ${category}` });
    }
    const targets = relationshipTargets(component);
    dependencyCounts.set(subcategory, (dependencyCounts.get(subcategory) ?? 0) + targets.length);
    for (const targetName of targets) {
      const target = byName.get(targetName);
      if (!target?.category || !target.subcategory) continue;
      if (category === "common" && target.category !== "common") {
        coreUiCommonDomainDependency.push({
          source: component.name,
          target: target.name,
          sourceSubcategory: subcategory,
          targetSubcategory: target.subcategory,
        });
      }
      if (
        subcategory !== target.subcategory &&
        category !== "common" &&
        target.category !== "common" &&
        !isCoreUiEncapsulationEdge(component, target)
      ) {
        const key = `${subcategory} -> ${target.subcategory}`;
        const edge = edgeCounts.get(key) ?? {
          sourceSubcategory: subcategory,
          targetSubcategory: target.subcategory,
          edgeCount: 0,
          targets: new Set<string>(),
        };
        edge.edgeCount += 1;
        edge.targets.add(`${component.name}->${target.name}`);
        edgeCounts.set(key, edge);
      }
    }
  }

  const coreUiSiblingSubcategoryCoupling = [...edgeCounts.values()]
    .map((edge) => {
      const sourceDependencyCount = dependencyCounts.get(edge.sourceSubcategory) ?? 0;
      return {
        sourceSubcategory: edge.sourceSubcategory,
        targetSubcategory: edge.targetSubcategory,
        edgeCount: edge.edgeCount,
        sourceDependencyCount,
        ratio: sourceDependencyCount === 0 ? 0 : edge.edgeCount / sourceDependencyCount,
        targets: [...edge.targets].sort(),
      };
    })
    .filter((edge) => {
      const reverse = edgeCounts.get(`${edge.targetSubcategory} -> ${edge.sourceSubcategory}`);
      return edge.edgeCount >= 3 || edge.ratio > 0.25 || Boolean(reverse);
    });

  return {
    coreUiMissingOwnership: coreUiMissingOwnership.sort((left, right) => left.name.localeCompare(right.name)),
    coreUiInvalidOwnership: coreUiInvalidOwnership.sort((left, right) => left.name.localeCompare(right.name)),
    coreUiCommonDomainDependency: coreUiCommonDomainDependency.sort((left, right) => coreUiOwnershipWarningKey(left).localeCompare(coreUiOwnershipWarningKey(right))),
    coreUiSiblingSubcategoryCoupling: coreUiSiblingSubcategoryCoupling.sort((left, right) => coreUiOwnershipWarningKey(left).localeCompare(coreUiOwnershipWarningKey(right))),
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
        if (component?.role === "surface" || component?.role === "helper" || component?.role === "service") continue;
        if (component?.exposure?.mode === "runtime") continue;
        const isCommonRenderer = component?.category === "common" && component.subcategory !== "common.foundation";
        if (!isCommonRenderer && !CORE_UI_COMMON_RENDERER_IMPORT_NAMES.has(importedName)) continue;
        candidates.push({
          file: file.relPath,
          importedName,
          subcategory: component?.subcategory ?? "common.unknown",
          specifier,
        });
      }
    }
  }

  return candidates.sort((left, right) => `${left.file}:${left.importedName}`.localeCompare(`${right.file}:${right.importedName}`));
}

export function findDomainSharedLayoutShells(files: SourceInfo[]) {
  const candidates: DomainSharedLayoutShell[] = [];

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
        : "domain shared layout shell must stay as route/module adapter debt, not Core/Page API registry",
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
