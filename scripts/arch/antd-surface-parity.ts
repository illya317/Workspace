import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
export const RETIRED_GENERAL_RENDERERS = [
  "packages/core/ui/internal/data/DataSurface.renderers.tsx",
  "packages/core/ui/internal/page/PageSurface.commands.tsx",
  "packages/core/ui/internal/input/input-surface-choice-renderers.tsx",
  "packages/core/ui/internal/toolbar/Toolbar.parts.tsx",
  "packages/core/ui/internal/toolbar/ToolbarOptionGroup.tsx",
  "packages/core/ui/internal/form/FormSurface.renderers.tsx",
  "packages/core/ui/internal/create/InlineCreatePanel.tsx",
  "packages/core/ui/internal/create/CreatePresentationPanel.tsx",
] as const;

const REQUIRED_ANT_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["packages/core/ui/InputSurface.tsx", "<AntdInputSurface"],
  ["packages/core/ui/DataSurface.tsx", "<AntdDataSurface data={props} />"],
  ["packages/core/ui/SelectorSurface.tsx", "<AntdSelectorSurface"],
  ["packages/core/ui/BodySurface.tsx", "<AntdBodySurface body={props} />"],
  ["packages/core/ui/FormSurface.tsx", "<AntdFormSurface"],
  ["packages/core/ui/CreateSurface.tsx", "<AntdCreatePanel"],
  ["packages/core/ui/PageSurface.tsx", "AntdPageBody"],
  ["packages/core/ui/Toolbar.tsx", "AntdToolbarItemRenderer"],
  ["packages/core/ui/internal/page/antd-page.tsx", "<AntdBodySurface body={body} />"],
];

const RETIRED_IMPORT_BASENAMES = new Set([
  "DataSurface.renderers",
  "PageSurface.commands",
  "input-surface-choice-renderers",
  "Toolbar.parts",
  "ToolbarOptionGroup",
  "FormSurface.renderers",
  "InlineCreatePanel",
  "CreatePresentationPanel",
]);

const RETIRED_REGISTRY_COMPONENTS = new Set([
  "ToolbarOptionGroup",
  "InlineCreatePanel",
  "CreatePresentationPanel",
]);

const DEPRECATED_ANT_PROPS = new Map<string, ReadonlySet<string>>([
  ["Select", new Set(["dropdownRender", "dropdownStyle", "popupClassName", "onDropdownVisibleChange"])],
  ["Divider", new Set(["type"])],
  ["Drawer", new Set(["height", "maskClosable"])],
  ["Modal", new Set(["maskClosable"])],
]);

function read(root: string, relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function runtimeFiles(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) runtimeFiles(absolute, files);
    else if (/\.(ts|tsx)$/.test(entry.name)
      && !/\.(test|contract\.test)\.(ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

function retiredRegistryReferences(file: string, source: string) {
  if (!file.includes("/registry/")) return [];
  return [...RETIRED_REGISTRY_COMPONENTS].filter((component) => (
    new RegExp(`[\"']${component}[\"']`).test(source)
  ));
}

function retiredImports(file: string, source: string) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)) {
      const base = path.posix.basename(node.moduleSpecifier.text);
      if (RETIRED_IMPORT_BASENAMES.has(base)) imports.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return imports;
}

function hasExactJsxTag(file: string, source: string, tagName: string) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let found = false;
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.tagName.getText(parsed) === tagName) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

function deprecatedAntProps(file: string, source: string) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(parsed).split(".").at(-1) ?? "";
      const forbidden = DEPRECATED_ANT_PROPS.get(tag);
      if (forbidden) {
        for (const property of node.attributes.properties) {
          if (ts.isJsxAttribute(property) && forbidden.has(property.name.getText(parsed))) {
            violations.push(`${tag}.${property.name.getText(parsed)}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return violations;
}

export function findAntdSurfaceParityViolations(root = ROOT) {
  const violations: string[] = [];
  for (const relativePath of RETIRED_GENERAL_RENDERERS) {
    if (fs.existsSync(path.join(root, relativePath))) violations.push(`${relativePath}: retired general renderer still exists`);
  }
  for (const [relativePath, marker] of REQUIRED_ANT_ROUTES) {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute) || !read(root, relativePath).includes(marker)) {
      violations.push(`${relativePath}: public route is not bound to its total Ant renderer`);
    }
  }

  const governedRuntimeFiles = [
    ...runtimeFiles(path.join(root, "packages/core/ui")),
    ...runtimeFiles(path.join(root, "packages/core/showcase")),
  ];
  for (const file of governedRuntimeFiles) {
    const source = fs.readFileSync(file, "utf8");
    const relativePath = path.relative(root, file).replace(/\\/g, "/");
    for (const reference of retiredImports(relativePath, source)) violations.push(`${relativePath}: imports retired ${reference}`);
    for (const component of retiredRegistryReferences(relativePath, source)) violations.push(`${relativePath}: registers retired ${component}`);
    for (const property of deprecatedAntProps(relativePath, source)) violations.push(`${relativePath}: uses deprecated Ant property ${property}`);
  }

  const body = read(root, "packages/core/ui/internal/body/antd-body.tsx");
  if (hasExactJsxTag("packages/core/ui/internal/body/antd-body.tsx", body, "BodySurface")) {
    violations.push("packages/core/ui/internal/body/antd-body.tsx: recursively delegates to BodySurface");
  }
  if (!body.includes('<DocumentSurface {...body.document} />')) violations.push("packages/core/ui/internal/body/antd-body.tsx: document specialized seam was lost");
  if (!body.includes('<VisualizationSurface {...body.visualization} />')) violations.push("packages/core/ui/internal/body/antd-body.tsx: visualization specialized seam was lost");

  const selectorTypes = read(root, "packages/core/ui/SelectorSurface.types.ts");
  if (selectorTypes.includes("showToggle")) violations.push("packages/core/ui/SelectorSurface.types.ts: retired selector compatibility flag remains");

  const dataCell = read(root, "packages/core/ui/internal/data/antd-data-cell.tsx");
  for (const kind of ["input", "group", "data", "form", "create-trigger", "create-anchor", "interactive", "selectionGrid", "action", "actions"]) {
    if (!dataCell.includes(`\"${kind}\"`)) violations.push(`packages/core/ui/internal/data/antd-data-cell.tsx: missing ${kind} cell route`);
  }
  return [...new Set(violations)].sort();
}

export function checkAntdSurfaceParity() {
  const violations = findAntdSurfaceParityViolations();
  if (!violations.length) {
    console.log("✓ Ant Surface parity gate passed: public render routes are total and retired fallbacks stay removed.");
    return true;
  }
  console.error(`✗ Ant Surface parity gate: ${violations.length} violation(s) found.`);
  for (const violation of violations) console.error(`  - ${violation}`);
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkAntdSurfaceParity() ? 0 : 1);
}
