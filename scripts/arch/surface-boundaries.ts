import {
  coreUiComponentRegistry,
  type CoreUiComponentCategory,
  type CoreUiComponentRegistration,
} from "../../packages/core/ui/component-registry";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

type SurfaceBoundaryWarning = {
  source: string;
  target: string;
  sourceCategory: CoreUiComponentCategory;
  targetCategory: CoreUiComponentCategory;
  sourceSubcategory: string;
  targetSubcategory: string;
};

type NonSurfaceDeclareWarning = {
  name: string;
  role: string;
  subcategory: string;
  declareCount: number;
};

type SurfaceDeclareBoundaryWarning = {
  surface: string;
  declarePath: string;
  reason: string;
};

type DeprecatedSurfaceUsageWarning = {
  file: string;
  line: number;
  pattern: string;
  migrationTarget: string;
};

type InternalPublicExportWarning = {
  exportedName: string;
  role: string;
  subcategory: string;
};

type HostExposureWarning = {
  source: "registry" | "filesystem";
  name: string;
};

type LayerPlacementWarning = {
  layer: "surface" | "helper" | "service";
  expectedPath: string;
};

type CoreUiEntryExposureWarning = {
  source: "package-exports" | "top-level-barrel";
  entry: string;
  reason: string;
};

type SurfacePublicContractWarning = {
  file: string;
  pattern: string;
  reason: string;
};

type DeclareItem = NonNullable<CoreUiComponentRegistration["declares"]>[number];

const SURFACE_CATEGORIES = new Set<CoreUiComponentCategory>([
  "page",
  "data",
  "form",
  "document",
  "visualization",
]);

const MAX_SURFACE_TOP_LEVEL_DECLARES = 7;
const MAX_SURFACE_TOTAL_DECLARES = 24;

const SOURCE_ROOTS = ["app", "packages"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const CORE_UI_IMPLEMENTATION_PREFIX = `packages${path.sep}core${path.sep}ui${path.sep}`;
const CORE_UI_PUBLIC_BARREL = path.join("packages", "core", "ui", "index.ts");
const CORE_PACKAGE_JSON = path.join("packages", "core", "package.json");
const CORE_TOP_LEVEL_BARREL = path.join("packages", "core", "index.ts");
const CORE_UI_HOST_DIR = path.join("packages", "core", "ui", "host");
const SURFACE_PUBLIC_CONTRACT_RULES: Array<{
  file: string;
  pattern: RegExp;
  label: string;
  reason: string;
}> = [
  {
    file: "packages/core/ui/surface/DataSurface.types.ts",
    pattern: /\b(DataTableProps|DataTableColumn|renderExpandedRow|SelectionGridProps|StructuredTableProps|InputControlProps|DisclosureRecordAction)\b/,
    label: "renderer-props",
    reason: "DataSurface public contract must not expose renderer/internal component props.",
  },
  {
    file: "packages/core/ui/surface/DataSurface.types.ts",
    pattern: /\bDataSurfaceVisual[A-Za-z0-9_]*\b/,
    label: "visualization-protocol",
    reason: "Visualization declarations belong to VisualizationSurface, not DataSurface.",
  },
  {
    file: "packages/core/ui/surface/DataSurface.types.ts",
    pattern: /\bkind\s*:\s*["']raw["']/,
    label: "raw-cell",
    reason: "Raw display escape hatches belong to BlockSurface or a narrower explicit Surface spec.",
  },
];
const REQUIRED_LAYER_FILES: LayerPlacementWarning[] = [
  { layer: "surface", expectedPath: "packages/core/ui/surface/PageSurface.types.ts" },
  { layer: "surface", expectedPath: "packages/core/ui/surface/DataSurface.types.ts" },
  { layer: "surface", expectedPath: "packages/core/ui/surface/FormSurface.types.ts" },
  { layer: "surface", expectedPath: "packages/core/ui/surface/SurfaceContractTypes.ts" },
  { layer: "helper", expectedPath: "packages/core/ui/helpers/page-surface-builders.ts" },
  { layer: "helper", expectedPath: "packages/core/ui/helpers/surface-compat-builders.tsx" },
  { layer: "service", expectedPath: "packages/core/ui/services/FeedbackProvider.tsx" },
];
const LEGACY_PAGE_BLOCK_KINDS = new Set([
  "actions",
  "analysis",
  "empty",
  "heading",
  "message",
  "metrics",
  "moduleGrid",
  "panel",
  "section",
  "surfaceGroup",
]);
const PAGE_BLOCK_HELPER_NAMES = new Set([
  "createActionsBlock",
  "createBlockSurfaceBlock",
  "createEmptyBlock",
  "createGroupBlock",
  "createHeadingBlock",
  "createMessageBlock",
  "createModuleGridBlock",
  "createPanelBlock",
  "createPageDataBlock",
  "createPageTableBlock",
  "createSectionBlock",
  "createVisualizationBlock",
]);
const DEPRECATED_SURFACE_USAGE_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
  migrationTarget: string;
}> = [
  {
    label: "PageSurface.moduleView",
    pattern: /\bkind\s*(?::|=)\s*["']moduleView["']/,
    migrationTarget: "Use a typed Surface/helper, usually createBlockSurfaceBlock or a domain Surface wrapper.",
  },
  {
    label: "DataSurface.raw",
    pattern: /\bkind\s*(?::|=)\s*["']raw["']/,
    migrationTarget: "Use BlockSurface.content for arbitrary React content, or define a narrower Surface spec.",
  },
  {
    label: "DataSurface kind=visual",
    pattern: /\bkind\s*(?::|=)\s*["']visual["']/,
    migrationTarget: "Use VisualizationSurface via createVisualizationBlock.",
  },
];

const SURFACE_DECLARE_RULES: Record<string, {
  topLevel: readonly string[];
  deprecatedPaths?: readonly string[];
}> = {
  BlockSurface: {
    topLevel: ["kind", "content", "blocks", "actions", "presentation"],
  },
  DataSurface: {
    topLevel: ["kind", "rows", "columns", "records", "metrics", "actions"],
  },
  DocumentSurface: {
    // Document owns paper/print layout; page-level style overrides are allowed here by design.
    topLevel: ["kind", "pages", "pageClassName", "style", "className"],
  },
  FormSurface: {
    topLevel: ["kind", "fields", "field", "columns", "mode", "actions"],
  },
  InputControl: {
    topLevel: ["control", "valueType", "options", "format", "mask", "state", "validation", "usage", "dependencies"],
  },
  PageSurface: {
    topLevel: ["kind", "header", "navigation", "toolbar", "body", "footer"],
    deprecatedPaths: ["body.content"],
  },
  VisualizationSurface: {
    topLevel: ["kind", "visual", "gantt", "framed", "title", "subtitle"],
  },
};

function registryByName() {
  return new Map(coreUiComponentRegistry.map((component) => [component.name, component]));
}

function isSurfaceCategory(category: CoreUiComponentCategory | undefined) {
  return Boolean(category && SURFACE_CATEGORIES.has(category));
}

function isSurfaceRole(component: CoreUiComponentRegistration) {
  return component.role === "surface";
}

function isAllowedCrossCategoryTarget(target: CoreUiComponentRegistration) {
  return target.category === "common";
}

function warningKey(warning: SurfaceBoundaryWarning) {
  return `${warning.source} -> ${warning.target}: ${warning.sourceSubcategory} -> ${warning.targetSubcategory}`;
}

function countDeclareItems(items: readonly DeclareItem[] | undefined): number {
  if (!items) return 0;
  return items.reduce((total, item) => total + 1 + countDeclareItems(item.children), 0);
}

function collectDeclarePaths(items: readonly DeclareItem[] | undefined, parentPath = ""): string[] {
  if (!items) return [];
  return items.flatMap((item) => {
    const itemPath = parentPath ? `${parentPath}.${item.name}` : item.name;
    return [itemPath, ...collectDeclarePaths(item.children, itemPath)];
  });
}

function walkSourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const stat = statSync(root);
  if (!stat.isDirectory()) return SOURCE_EXTENSIONS.has(path.extname(root)) ? [root] : [];
  return readdirSync(root)
    .filter((entry) => !entry.startsWith(".") && entry !== "node_modules")
    .flatMap((entry) => walkSourceFiles(path.join(root, entry)));
}

function normalizeFilePath(file: string) {
  return file.split(path.sep).join("/");
}

function createSourceFile(file: string) {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function nodeLine(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function objectStringProperty(object: ts.ObjectLiteralExpression, name: string) {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName = property.name;
    if (!ts.isIdentifier(propertyName) && !ts.isStringLiteral(propertyName)) continue;
    if (propertyName.text !== name) continue;
    const initializer = property.initializer;
    return ts.isStringLiteral(initializer) ? initializer.text : null;
  }
  return null;
}

function hasObjectProperty(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.some((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return false;
    const propertyName = property.name;
    return (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) && propertyName.text === name;
  });
}

function hasPageBlockShape(object: ts.ObjectLiteralExpression, kind: string) {
  if (kind === "section" || kind === "panel" || kind === "analysis" || kind === "surfaceGroup") {
    return hasObjectProperty(object, "blocks");
  }
  return true;
}

function isInsidePageBlockHelper(node: ts.Node) {
  let current: ts.Node | undefined = node;
  while (current?.parent) {
    current = current.parent;
    if (!ts.isCallExpression(current)) continue;
    if (!ts.isIdentifier(current.expression) || !PAGE_BLOCK_HELPER_NAMES.has(current.expression.text)) continue;
    return current.arguments.some((argument) => argument.pos <= node.pos && node.end <= argument.end);
  }
  return false;
}

function looksLikePageSurfaceConsumer(text: string) {
  return /PageSurface|PageSurfaceBlockSpec|PageBlockSurface|createPage|createBlockSurfaceBlock/.test(text);
}

export function findLegacyPageBlockUsageWarnings() {
  const warnings: DeprecatedSurfaceUsageWarning[] = [];
  const files = SOURCE_ROOTS.flatMap(walkSourceFiles);

  for (const file of files) {
    if (file.startsWith(CORE_UI_IMPLEMENTATION_PREFIX)) continue;
    const text = readFileSync(file, "utf8");
    if (!looksLikePageSurfaceConsumer(text)) continue;
    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    function scan(node: ts.Node) {
      if (ts.isObjectLiteralExpression(node)) {
        const kind = objectStringProperty(node, "kind");
        const key = objectStringProperty(node, "key");
        if (key && kind && LEGACY_PAGE_BLOCK_KINDS.has(kind) && hasPageBlockShape(node, kind) && !isInsidePageBlockHelper(node)) {
          warnings.push({
            file: normalizeFilePath(file),
            line: nodeLine(sourceFile, node),
            pattern: `PageSurface legacy block kind="${kind}"`,
            migrationTarget: "Wrap common containers with createBlockSurfaceBlock, or move data/form/document/visualization to the owning Surface block.",
          });
        }
      }
      ts.forEachChild(node, scan);
    }

    scan(sourceFile);
  }

  return warnings.sort((left, right) => `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`));
}

export function findInternalPublicExportWarnings() {
  const byName = registryByName();
  const warnings: InternalPublicExportWarning[] = [];
  const sourceFile = createSourceFile(CORE_UI_PUBLIC_BARREL);

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.exportClause && statement.moduleSpecifier) {
      warnings.push({
        exportedName: statement.getText(sourceFile),
        role: "unknown",
        subcategory: "public-barrel",
      });
      continue;
    }
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;

    for (const element of statement.exportClause.elements) {
      const exportedName = element.name.text;
      const component = byName.get(exportedName);
      if (!component || component.role !== "internal") continue;
      warnings.push({
        exportedName,
        role: component.role,
        subcategory: component.subcategory ?? "unknown",
      });
    }
  }

  return warnings.sort((left, right) => left.exportedName.localeCompare(right.exportedName));
}

export function findHostExposureWarnings() {
  const warnings: HostExposureWarning[] = [];
  for (const component of coreUiComponentRegistry) {
    if (component.role !== "host") continue;
    warnings.push({ source: "registry", name: component.name });
  }

  if (existsSync(CORE_UI_HOST_DIR)) {
    for (const file of walkSourceFiles(CORE_UI_HOST_DIR)) {
      if (path.basename(file) === "README.md") continue;
      warnings.push({ source: "filesystem", name: normalizeFilePath(file) });
    }
  }

  return warnings.sort((left, right) => `${left.source}:${left.name}`.localeCompare(`${right.source}:${right.name}`));
}

export function findLayerPlacementWarnings() {
  return REQUIRED_LAYER_FILES
    .filter((entry) => !existsSync(entry.expectedPath))
    .sort((left, right) => left.expectedPath.localeCompare(right.expectedPath));
}

export function findCoreUiEntryExposureWarnings() {
  const warnings: CoreUiEntryExposureWarning[] = [];

  if (existsSync(CORE_PACKAGE_JSON)) {
    const packageJson = JSON.parse(readFileSync(CORE_PACKAGE_JSON, "utf8")) as {
      exports?: Record<string, unknown>;
    };
    for (const entry of Object.keys(packageJson.exports ?? {}).sort()) {
      if (!entry.startsWith("./ui/")) continue;
      warnings.push({
        source: "package-exports",
        entry,
        reason: "Core UI must expose the public barrel only; deep UI subpaths bypass surface/helper/service contracts.",
      });
    }
  }

  if (existsSync(CORE_TOP_LEVEL_BARREL)) {
    const sourceFile = createSourceFile(CORE_TOP_LEVEL_BARREL);
    for (const statement of sourceFile.statements) {
      if (!ts.isExportDeclaration(statement)) continue;
      const moduleSpecifier = statement.moduleSpecifier;
      if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue;
      if (moduleSpecifier.text !== "./ui" && moduleSpecifier.text !== "./showcase") continue;
      warnings.push({
        source: "top-level-barrel",
        entry: moduleSpecifier.text,
        reason: "Core UI/showcase must be imported through explicit subpaths, not re-exported from @workspace/core.",
      });
    }
  }

  return warnings.sort((left, right) => `${left.source}:${left.entry}`.localeCompare(`${right.source}:${right.entry}`));
}

export function findSurfacePublicContractWarnings() {
  const warnings: SurfacePublicContractWarning[] = [];

  for (const rule of SURFACE_PUBLIC_CONTRACT_RULES) {
    if (!existsSync(rule.file)) continue;
    const text = readFileSync(rule.file, "utf8");
    if (!rule.pattern.test(text)) continue;
    warnings.push({
      file: rule.file,
      pattern: rule.label,
      reason: rule.reason,
    });
  }

  const pageSurfaceTypesFile = "packages/core/ui/surface/PageSurface.types.ts";
  if (existsSync(pageSurfaceTypesFile)) {
    const sourceFile = createSourceFile(pageSurfaceTypesFile);
    const legacyBaseProps = new Set(["tabs", "activeTab", "activeChild", "onTabChange", "onChildChange", "actions", "empty", "blocks"]);
    for (const statement of sourceFile.statements) {
      if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== "PageSurfaceBaseProps") continue;
      const hasLegacyBaseProp = statement.members.some((member) => (
        ts.isPropertySignature(member) &&
        member.name &&
        ts.isIdentifier(member.name) &&
        legacyBaseProps.has(member.name.text)
      ));
      if (!hasLegacyBaseProp) continue;
      warnings.push({
        file: pageSurfaceTypesFile,
        pattern: "page-compat-props",
        reason: "PageSurface public contract only exposes body/navigation for content and page navigation.",
      });
    }
  }

  return warnings.sort((left, right) => `${left.file}:${left.pattern}`.localeCompare(`${right.file}:${right.pattern}`));
}

export function findDeprecatedSurfaceUsageWarnings() {
  const warnings: DeprecatedSurfaceUsageWarning[] = [];
  const files = SOURCE_ROOTS.flatMap(walkSourceFiles);

  for (const file of files) {
    if (file.startsWith(CORE_UI_IMPLEMENTATION_PREFIX)) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const rule of DEPRECATED_SURFACE_USAGE_PATTERNS) {
        if (!rule.pattern.test(line)) continue;
        warnings.push({
          file: normalizeFilePath(file),
          line: index + 1,
          pattern: rule.label,
          migrationTarget: rule.migrationTarget,
        });
      }
    }
  }

  return warnings.sort((left, right) => `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`));
}

export function findSurfaceBoundaryWarnings() {
  const byName = registryByName();
  const warnings: SurfaceBoundaryWarning[] = [];

  for (const source of coreUiComponentRegistry) {
    if (!isSurfaceRole(source)) continue;
    if (!isSurfaceCategory(source.category)) continue;
    if (!source.category || !source.subcategory) continue;

    for (const targetName of source.composes ?? []) {
      const target = byName.get(targetName);
      if (!target?.category || !target.subcategory) continue;
      if (!isSurfaceRole(target)) continue;
      if (target.category === source.category) continue;
      if (isAllowedCrossCategoryTarget(target)) continue;
      if (!isSurfaceCategory(target.category)) continue;

      warnings.push({
        source: source.name,
        target: target.name,
        sourceCategory: source.category,
        targetCategory: target.category,
        sourceSubcategory: source.subcategory,
        targetSubcategory: target.subcategory,
      });
    }
  }

  return warnings.sort((left, right) => warningKey(left).localeCompare(warningKey(right)));
}

export function findNonSurfaceDeclareWarnings() {
  return coreUiComponentRegistry
    .filter((component) => component.role !== "surface" && (component.declares?.length ?? 0) > 0)
    .map((component) => ({
      name: component.name,
      role: component.role ?? "unknown",
      subcategory: component.subcategory ?? "unknown",
      declareCount: component.declares?.length ?? 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function findSurfaceDeclareBoundaryWarnings() {
  const warnings: SurfaceDeclareBoundaryWarning[] = [];

  for (const component of coreUiComponentRegistry) {
    if (!isSurfaceRole(component)) continue;
    const declares = component.declares ?? [];
    const rule = SURFACE_DECLARE_RULES[component.name];
    const topLevelNames = declares.map((item) => item.name);
    const totalDeclares = countDeclareItems(declares);

    if (!rule) {
      warnings.push({
        surface: component.name,
        declarePath: "*",
        reason: "missing declare boundary rule",
      });
      continue;
    }

    if (topLevelNames.length > MAX_SURFACE_TOP_LEVEL_DECLARES) {
      warnings.push({
        surface: component.name,
        declarePath: "*",
        reason: `too many top-level declares (${topLevelNames.length}/${MAX_SURFACE_TOP_LEVEL_DECLARES})`,
      });
    }

    if (totalDeclares > MAX_SURFACE_TOTAL_DECLARES) {
      warnings.push({
        surface: component.name,
        declarePath: "*",
        reason: `too many nested declares (${totalDeclares}/${MAX_SURFACE_TOTAL_DECLARES})`,
      });
    }

    const allowedTopLevel = new Set(rule.topLevel);
    for (const name of topLevelNames) {
      if (!allowedTopLevel.has(name)) {
        warnings.push({
          surface: component.name,
          declarePath: name,
          reason: "top-level declare is outside this surface boundary",
        });
      }
    }

    const paths = new Set(collectDeclarePaths(declares));
    for (const path of rule.deprecatedPaths ?? []) {
      if (paths.has(path)) {
        warnings.push({
          surface: component.name,
          declarePath: path,
          reason: "compatibility declare should migrate to the owning surface/helper",
        });
      }
    }
  }

  return warnings.sort((left, right) => `${left.surface}.${left.declarePath}`.localeCompare(`${right.surface}.${right.declarePath}`));
}

export function checkSurfaceBoundaries() {
  const warnings = findSurfaceBoundaryWarnings();
  const declareWarnings = findNonSurfaceDeclareWarnings();
  const declareBoundaryWarnings = findSurfaceDeclareBoundaryWarnings();
  const deprecatedUsageWarnings = findDeprecatedSurfaceUsageWarnings();
  const legacyPageBlockWarnings = findLegacyPageBlockUsageWarnings();
  const internalPublicExportWarnings = findInternalPublicExportWarnings();
  const hostExposureWarnings = findHostExposureWarnings();
  const layerPlacementWarnings = findLayerPlacementWarnings();
  const coreUiEntryExposureWarnings = findCoreUiEntryExposureWarnings();
  const surfacePublicContractWarnings = findSurfacePublicContractWarnings();

  if (
    warnings.length === 0
    && declareWarnings.length === 0
    && declareBoundaryWarnings.length === 0
    && deprecatedUsageWarnings.length === 0
    && legacyPageBlockWarnings.length === 0
    && internalPublicExportWarnings.length === 0
    && hostExposureWarnings.length === 0
    && layerPlacementWarnings.length === 0
    && coreUiEntryExposureWarnings.length === 0
    && surfacePublicContractWarnings.length === 0
  ) {
    console.log("✓ Surface boundary warning check passed.");
    return true;
  }

  if (warnings.length > 0) {
    console.warn(`⚠ Surface boundary warning: ${warnings.length} cross-surface relationship(s) detected.`);
    console.warn("  Rule: surface categories may depend on common, but should not compose other surface categories directly.");
    console.warn("  Move shared capability to common, or expose a smaller declaration/helper boundary.");
    for (const warning of warnings.slice(0, 40)) {
      console.warn(`  - ${warningKey(warning)}`);
    }
    if (warnings.length > 40) {
      console.warn(`  ... ${warnings.length - 40} more`);
    }
  }

  if (declareWarnings.length > 0) {
    console.warn(`⚠ Surface declare warning: ${declareWarnings.length} non-surface entry/entries still declare public fields.`);
    console.warn("  Rule: UI declares belong only on role=surface. Move the declaration to a Surface, or describe non-UI services with capabilities.");
    for (const warning of declareWarnings.slice(0, 40)) {
      console.warn(`  - ${warning.name}: role=${warning.role}, subcategory=${warning.subcategory}, declares=${warning.declareCount}`);
    }
    if (declareWarnings.length > 40) {
      console.warn(`  ... ${declareWarnings.length - 40} more`);
    }
  }

  if (declareBoundaryWarnings.length > 0) {
    console.warn(`⚠ Surface declare boundary warning: ${declareBoundaryWarnings.length} declare boundary issue(s) detected.`);
    console.warn("  Rule: Page owns page-wide layout/chrome; Form/Data/Visualization/Document own only their domain declarations. Document may own paper style overrides.");
    for (const warning of declareBoundaryWarnings.slice(0, 40)) {
      console.warn(`  - ${warning.surface}.${warning.declarePath}: ${warning.reason}`);
    }
    if (declareBoundaryWarnings.length > 40) {
      console.warn(`  ... ${declareBoundaryWarnings.length - 40} more`);
    }
  }

  if (deprecatedUsageWarnings.length > 0) {
    console.warn(`⚠ Deprecated surface usage warning: ${deprecatedUsageWarnings.length} compatibility usage(s) detected outside Core UI.`);
    console.warn("  Rule: business code should use explicit Surface/helper declarations, not raw/moduleView/visual escape hatches.");
    for (const warning of deprecatedUsageWarnings.slice(0, 40)) {
      console.warn(`  - ${warning.file}:${warning.line}: ${warning.pattern} -> ${warning.migrationTarget}`);
    }
    if (deprecatedUsageWarnings.length > 40) {
      console.warn(`  ... ${deprecatedUsageWarnings.length - 40} more`);
    }
  }

  if (legacyPageBlockWarnings.length > 0) {
    console.warn(`⚠ PageSurface block warning: ${legacyPageBlockWarnings.length} legacy page block usage(s) detected outside Core UI.`);
    console.warn("  Rule: PageSurface.body.blocks should route to typed Surface wrappers; common containers belong to BlockSurface.");
    for (const warning of legacyPageBlockWarnings.slice(0, 40)) {
      console.warn(`  - ${warning.file}:${warning.line}: ${warning.pattern} -> ${warning.migrationTarget}`);
    }
    if (legacyPageBlockWarnings.length > 40) {
      console.warn(`  ... ${legacyPageBlockWarnings.length - 40} more`);
    }
  }

  if (internalPublicExportWarnings.length > 0) {
    console.warn(`⚠ Core UI public export warning: ${internalPublicExportWarnings.length} internal renderer export(s) still exposed from @workspace/core/ui.`);
    console.warn("  Rule: the public barrel should expose Surface/helper/service entries; internal renderers stay behind Surface implementations or explicit private imports.");
    for (const warning of internalPublicExportWarnings.slice(0, 60)) {
      console.warn(`  - ${warning.exportedName}: role=${warning.role}, subcategory=${warning.subcategory}`);
    }
    if (internalPublicExportWarnings.length > 60) {
      console.warn(`  ... ${internalPublicExportWarnings.length - 60} more`);
    }
  }

  if (hostExposureWarnings.length > 0) {
    console.warn(`⚠ Core UI host warning: ${hostExposureWarnings.length} host exposure(s) detected.`);
    console.warn("  Rule: host is reserved and empty by default. Add a host only with an explicit allowlist decision.");
    for (const warning of hostExposureWarnings.slice(0, 40)) {
      console.warn(`  - ${warning.source}: ${warning.name}`);
    }
    if (hostExposureWarnings.length > 40) {
      console.warn(`  ... ${hostExposureWarnings.length - 40} more`);
    }
  }

  if (layerPlacementWarnings.length > 0) {
    console.warn(`⚠ Core UI layer placement warning: ${layerPlacementWarnings.length} required layer file(s) missing.`);
    console.warn("  Rule: surface/helper/service declarations live under their layer directories; root files should be compatibility shims only.");
    for (const warning of layerPlacementWarnings) {
      console.warn(`  - ${warning.layer}: expected ${warning.expectedPath}`);
    }
  }

  if (coreUiEntryExposureWarnings.length > 0) {
    console.warn(`⚠ Core UI entry exposure warning: ${coreUiEntryExposureWarnings.length} package/barrel exposure issue(s) detected.`);
    console.warn("  Rule: business code imports Core UI through @workspace/core/ui public declarations; deep UI subpaths and top-level re-exports stay closed.");
    for (const warning of coreUiEntryExposureWarnings) {
      console.warn(`  - ${warning.source}: ${warning.entry} -> ${warning.reason}`);
    }
  }

  if (surfacePublicContractWarnings.length > 0) {
    console.warn(`⚠ Surface public contract warning: ${surfacePublicContractWarnings.length} public contract issue(s) detected.`);
    console.warn("  Rule: public Surface types must expose the Surface declaration contract, not renderer props or legacy cross-surface protocols.");
    for (const warning of surfacePublicContractWarnings) {
      console.warn(`  - ${warning.file}: ${warning.pattern} -> ${warning.reason}`);
    }
  }
  return false;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  process.exit(checkSurfaceBoundaries() ? 0 : 1);
}
