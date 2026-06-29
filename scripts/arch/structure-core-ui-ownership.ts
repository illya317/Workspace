import path from "node:path";
import ts from "typescript";

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

function getPackageName(relPath: string) {
  const parts = relPath.split("/");
  return parts[0] === "packages" && parts[1] ? parts[1] : "app-root";
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
  return {
    coreUiMissingOwnership: [],
    coreUiInvalidOwnership: [],
    coreUiCommonDomainDependency: [],
    coreUiSiblingSubcategoryCoupling: [],
  };
}

export function findBusinessCommonRendererImports(files: SourceInfo[]) {
  void files;
  return [];
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
    if (!file.hasJsx && !/PageSurface|PageSurfaceNavigationSpec|PageSurfaceToolbar|Toolbar|TabBar|NavigationRenderer/.test(file.text)) continue;
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
