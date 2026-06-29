import {
  coreUiComponentRegistry,
  getCoreUiDeclarationCategory,
  isCoreUiDeclarativeComponent,
  type CoreUiDeclarationCategory,
  type CoreUiComponentRegistration,
} from "../../packages/core/ui/registry/component-registry";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

type SurfaceBoundaryWarning = {
  source: string;
  target: string;
  sourceCategory: CoreUiDeclarationCategory;
  targetCategory: CoreUiDeclarationCategory;
  sourceSubcategory: string;
  targetSubcategory: string;
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
  reason: string;
};

type HostExposureWarning = {
  source: "filesystem";
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
    file: "packages/core/ui/DataSurface.types.ts",
    pattern: /\b(DataTableProps|DataTableColumn|renderExpandedRow|SelectionGridProps|StructuredTableProps|InputControlProps|DisclosureRecordAction)\b/,
    label: "renderer-props",
    reason: "DataSurface public contract must not expose renderer/internal component props.",
  },
  {
    file: "packages/core/ui/DataSurface.types.ts",
    pattern: /\bDataSurfaceVisual[A-Za-z0-9_]*\b/,
    label: "visualization-protocol",
    reason: "Visualization declarations belong to VisualizationSurface, not DataSurface.",
  },
  {
    file: "packages/core/ui/DataSurface.types.ts",
    pattern: /\bkind\s*:\s*["']raw["']/,
    label: "raw-cell",
    reason: "Raw display escape hatches belong to BlockSurface or a narrower explicit Surface spec.",
  },
];
const SURFACE_PUBLIC_CONTRACT_FILES = [
  "packages/core/ui/BodySurface.tsx",
  "packages/core/ui/BlockSurface.tsx",
  "packages/core/ui/DataSurface.types.ts",
  "packages/core/ui/DocumentSurface.tsx",
  "packages/core/ui/FormSurface.types.ts",
  "packages/core/ui/InputControl.tsx",
  "packages/core/ui/internal/input/InputControlTypes.ts",
  "packages/core/ui/NavigationRenderer.tsx",
  "packages/core/ui/PageSurface.types.ts",
  "packages/core/ui/SelectorSurface.tsx",
  "packages/core/ui/VisualizationSurfaceTypes.ts",
  "packages/core/ui/helpers/page-surface-builders.ts",
  "packages/core/ui/helpers/surface-compat-builders.tsx",
] as const;
const FORBIDDEN_PUBLIC_STYLE_PROPS = new Set([
  "className",
  "bodyClassName",
  "headerClassName",
  "cellClassName",
  "tableClassName",
  "rowClassName",
  "scrollClassName",
  "fieldClassName",
  "titleClassName",
  "subtitleClassName",
  "contentClassName",
  "gridClassName",
  "pageClassName",
  "style",
  "unstyled",
  "wrapperClassName",
  "fontRole",
  "visualVariant",
  "choiceOptionClassName",
  "choiceMarkerClassName",
  "fileInputClassName",
  "fileControlsClassName",
]);
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
  "createActionsSection",
  "createBlockSurfaceSection",
  "createEmptySection",
  "createSectionsSection",
  "createHeadingSection",
  "createMessageSection",
  "createModuleGridSection",
  "createPanelSection",
  "createPageDataSection",
  "createPageTableSection",
  "createSectionSection",
  "createVisualizationSection",
]);
const DEPRECATED_SURFACE_USAGE_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
  migrationTarget: string;
}> = [
  {
    label: "PageSurface.moduleView",
    pattern: /\bkind\s*(?::|=)\s*["']moduleView["']/,
    migrationTarget: "Use a typed Surface/helper, usually createBlockSurfaceSection or a domain Surface wrapper.",
  },
  {
    label: "DataSurface.raw",
    pattern: /\bkind\s*(?::|=)\s*["']raw["']/,
    migrationTarget: "Define a narrower Surface spec; BlockSurface.content is a legacy escape hatch.",
  },
  {
    label: "DataSurface kind=visual",
    pattern: /\bkind\s*(?::|=)\s*["']visual["']/,
    migrationTarget: "Use VisualizationSurface via createVisualizationSection.",
  },
];

const SURFACE_DECLARE_RULES: Record<string, {
  topLevel: readonly string[];
  deprecatedPaths?: readonly string[];
  maxTotalDeclares?: number;
}> = {
  BlockSurface: {
    topLevel: ["kind", "content", "blocks", "actions", "presentation"],
  },
  DataSurface: {
    topLevel: ["kind", "actions"],
  },
  MetricsSurface: {
    topLevel: ["metrics", "actions"],
  },
  RecordSurface: {
    topLevel: ["records", "actions"],
  },
  DocumentSurface: {
    topLevel: ["kind", "pages"],
  },
  FormSurface: {
    topLevel: ["kind", "content", "commands", "submit"],
  },
  InputControl: {
    topLevel: ["control", "valueType", "options", "format", "mask", "state", "validation", "usage", "dependencies"],
  },
  NavigationRenderer: {
    topLevel: ["kind", "tabs", "pagination", "selector", "grid", "steps", "active"],
    maxTotalDeclares: 48,
  },
  PageSurface: {
    topLevel: ["kind", "header", "navigation", "toolbar", "body", "footer", "embedded"],
    maxTotalDeclares: 72,
    deprecatedPaths: ["body.content"],
  },
  SelectorSurface: {
    topLevel: ["kind", "commands", "loading", "emptyText"],
  },
  VisualizationSurface: {
    topLevel: ["kind", "chart", "gantt"],
  },
};

function registryByName() {
  return new Map(coreUiComponentRegistry.map((component) => [component.name, component]));
}

function declarationCategory(component: CoreUiComponentRegistration) {
  return getCoreUiDeclarationCategory(component);
}

function isAllowedSurfaceComposition(source: CoreUiComponentRegistration, target: CoreUiComponentRegistration) {
  const sourceCategory = declarationCategory(source);
  const targetCategory = declarationCategory(target);
  if (targetCategory === "common") return true;
  if (sourceCategory === "page-layout" && targetCategory === "page-content") return true;
  return sourceCategory === targetCategory;
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

function memberNameText(name: ts.PropertyName | ts.BindingName | undefined) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function isForbiddenPublicStyleProp(name: string) {
  return FORBIDDEN_PUBLIC_STYLE_PROPS.has(name) || /ClassName$/.test(name);
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
  return /PageSurface|PageSurfaceSectionSpec|PageBlockSurface|createPage|createBlockSurfaceSection/.test(text);
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
            migrationTarget: "Wrap common containers with createBlockSurfaceSection, or move data/form/document/visualization to the owning Surface block.",
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
  const warnings: InternalPublicExportWarning[] = [];
  const sourceFile = createSourceFile(CORE_UI_PUBLIC_BARREL);

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.exportClause && statement.moduleSpecifier) {
      warnings.push({
        exportedName: statement.getText(sourceFile),
        reason: "public barrel should use explicit named exports",
      });
      continue;
    }
  }

  return warnings.sort((left, right) => left.exportedName.localeCompare(right.exportedName));
}

export function findHostExposureWarnings() {
  const warnings: HostExposureWarning[] = [];
  if (existsSync(CORE_UI_HOST_DIR)) {
    for (const file of walkSourceFiles(CORE_UI_HOST_DIR)) {
      if (path.basename(file) === "README.md") continue;
      warnings.push({ source: "filesystem", name: normalizeFilePath(file) });
    }
  }

  return warnings.sort((left, right) => `${left.source}:${left.name}`.localeCompare(`${right.source}:${right.name}`));
}

export function findLayerPlacementWarnings() {
  return [] as LayerPlacementWarning[];
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

  for (const file of SURFACE_PUBLIC_CONTRACT_FILES) {
    if (!existsSync(file)) continue;
    const sourceFile = createSourceFile(file);
    function scan(node: ts.Node) {
      if (ts.isPropertySignature(node)) {
        const propertyName = memberNameText(node.name);
        if (propertyName && isForbiddenPublicStyleProp(propertyName)) {
          warnings.push({
            file,
            pattern: `public-style-prop:${propertyName}`,
            reason: "Public Surface/Input declarations must use typed semantic variance instead of className/style escape hatches.",
          });
        }
      }
      ts.forEachChild(node, scan);
    }
    scan(sourceFile);
  }

  const pageSurfaceTypesFile = "packages/core/ui/PageSurface.types.ts";
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
    if (!isCoreUiDeclarativeComponent(source)) continue;
    const sourceCategory = declarationCategory(source);

    for (const targetName of source.composes ?? []) {
      const target = byName.get(targetName);
      if (!target || !isCoreUiDeclarativeComponent(target)) continue;
      if (isAllowedSurfaceComposition(source, target)) continue;
      const targetCategory = declarationCategory(target);

      warnings.push({
        source: source.name,
        target: target.name,
        sourceCategory,
        targetCategory,
        sourceSubcategory: source.name,
        targetSubcategory: target.name,
      });
    }
  }

  return warnings.sort((left, right) => warningKey(left).localeCompare(warningKey(right)));
}

export function findSurfaceDeclareBoundaryWarnings() {
  const warnings: SurfaceDeclareBoundaryWarning[] = [];

  for (const component of coreUiComponentRegistry) {
    if (!isCoreUiDeclarativeComponent(component)) continue;
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

    const maxTotalDeclares = rule.maxTotalDeclares ?? MAX_SURFACE_TOTAL_DECLARES;
    if (totalDeclares > maxTotalDeclares) {
      warnings.push({
        surface: component.name,
        declarePath: "*",
        reason: `too many nested declares (${totalDeclares}/${maxTotalDeclares})`,
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

  if (declareBoundaryWarnings.length > 0) {
    console.warn(`⚠ Surface declare boundary warning: ${declareBoundaryWarnings.length} declare boundary issue(s) detected.`);
    console.warn("  Rule: Page owns page-wide layout/chrome; Form/Data/Visualization/Document own only typed domain declarations.");
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
    console.warn(`⚠ PageSurface section warning: ${legacyPageBlockWarnings.length} legacy page section shape(s) detected outside Core UI.`);
    console.warn("  Rule: PageSurface.body.sections should use typed section helpers; common containers belong to BlockSurface.");
    for (const warning of legacyPageBlockWarnings.slice(0, 40)) {
      console.warn(`  - ${warning.file}:${warning.line}: ${warning.pattern} -> ${warning.migrationTarget}`);
    }
    if (legacyPageBlockWarnings.length > 40) {
      console.warn(`  ... ${legacyPageBlockWarnings.length - 40} more`);
    }
  }

  if (internalPublicExportWarnings.length > 0) {
    console.warn(`⚠ Core UI public export warning: ${internalPublicExportWarnings.length} broad export(s) still exposed from @workspace/core/ui.`);
    console.warn("  Rule: the public barrel should use explicit named exports so structure checks can inspect every Core UI entry.");
    for (const warning of internalPublicExportWarnings.slice(0, 60)) {
      console.warn(`  - ${warning.exportedName}: ${warning.reason}`);
    }
    if (internalPublicExportWarnings.length > 60) {
      console.warn(`  ... ${internalPublicExportWarnings.length - 60} more`);
    }
  }

  if (hostExposureWarnings.length > 0) {
    console.warn(`⚠ Core UI host warning: ${hostExposureWarnings.length} host exposure(s) detected.`);
    console.warn("  Rule: host remains reserved and empty by default.");
    for (const warning of hostExposureWarnings.slice(0, 40)) {
      console.warn(`  - ${warning.source}: ${warning.name}`);
    }
    if (hostExposureWarnings.length > 40) {
      console.warn(`  ... ${hostExposureWarnings.length - 40} more`);
    }
  }

  if (layerPlacementWarnings.length > 0) {
    console.warn(`⚠ Core UI layer placement warning: ${layerPlacementWarnings.length} required layer file(s) missing.`);
    console.warn("  Rule: required Core UI declaration files must stay present.");
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
