import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

type DeprecatedPageSurfacePropWarning = {
  file: string;
  line: number;
  prop: string;
  migrationTarget: string;
};

const SOURCE_ROOTS = ["app", "packages"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const CORE_UI_IMPLEMENTATION_PREFIX = `packages${path.sep}core${path.sep}ui${path.sep}`;
const DEPRECATED_PAGE_SURFACE_PROPS = new Map<string, string>([
  ["blocks", "Use body.blocks or createPageBody(blocks)."],
  ["empty", "Use body.empty or createPageBody(blocks, { empty })."],
  ["actions", "Use body.commands for local commands, or toolbar.items for page-level actions."],
  ["tabs", "Use navigation={createPageTabsNavigation(...)}."],
  ["activeTab", "Use navigation.active."],
  ["activeChild", "Use navigation.activeChild."],
  ["onTabChange", "Use navigation.onChange."],
  ["onChildChange", "Use navigation.onChildChange."],
]);
const CREATE_PAGE_SURFACE_PROPS_COMPAT_OPTIONS = new Map<string, string>([
  ["blocks", "Pass body: createPageBody(blocks) instead."],
  ["empty", "Pass body: createPageBody(blocks, { empty }) instead."],
  ["actions", "Pass body.commands or toolbar.items instead."],
]);

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

function jsxTagName(name: ts.JsxTagNameExpression) {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isPropertyAccessExpression(name)) return name.name.text;
  return undefined;
}

function objectPropertyName(name: ts.PropertyName | undefined) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

export function findDeprecatedPageSurfacePropWarnings() {
  const warnings: DeprecatedPageSurfacePropWarning[] = [];
  const files = SOURCE_ROOTS.flatMap(walkSourceFiles);

  for (const file of files) {
    if (file.startsWith(CORE_UI_IMPLEMENTATION_PREFIX)) continue;
    const text = readFileSync(file, "utf8");
    if (!text.includes("PageSurface") && !text.includes("createPageSurfaceProps")) continue;
    const sourceFile = createSourceFile(file);

    function scan(node: ts.Node) {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        if (jsxTagName(node.tagName) === "PageSurface") {
          for (const attribute of node.attributes.properties) {
            if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
            const migrationTarget = DEPRECATED_PAGE_SURFACE_PROPS.get(attribute.name.text);
            if (!migrationTarget) continue;
            warnings.push({
              file: normalizeFilePath(file),
              line: nodeLine(sourceFile, attribute),
              prop: attribute.name.text,
              migrationTarget,
            });
          }
        }
      }

      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "createPageSurfaceProps"
      ) {
        const [options] = node.arguments;
        if (options && ts.isObjectLiteralExpression(options)) {
          for (const property of options.properties) {
            if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
            const propName = objectPropertyName(property.name);
            if (!propName) continue;
            const migrationTarget = CREATE_PAGE_SURFACE_PROPS_COMPAT_OPTIONS.get(propName);
            if (!migrationTarget) continue;
            warnings.push({
              file: normalizeFilePath(file),
              line: nodeLine(sourceFile, property),
              prop: `createPageSurfaceProps.${propName}`,
              migrationTarget,
            });
          }
        }
      }

      ts.forEachChild(node, scan);
    }

    scan(sourceFile);
  }

  return warnings.sort((left, right) => `${left.file}:${left.line}:${left.prop}`.localeCompare(`${right.file}:${right.line}:${right.prop}`));
}

function printReport(warnings: DeprecatedPageSurfacePropWarning[]) {
  if (warnings.length === 0) {
    console.log("✓ PageSurface adoption warning check passed.");
    return;
  }

  console.warn(`⚠ PageSurface adoption warning: ${warnings.length} deprecated top-level prop usage(s) detected outside Core UI.`);
  console.warn("  Rule: new PageSurface code should declare navigation/body explicitly; top-level compat props are migration debt only.");
  for (const warning of warnings.slice(0, 80)) {
    console.warn(`  - ${warning.file}:${warning.line}: ${warning.prop} -> ${warning.migrationTarget}`);
  }
  if (warnings.length > 80) {
    console.warn(`  ... ${warnings.length - 80} more`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const warnings = findDeprecatedPageSurfacePropWarnings();
  printReport(warnings);
  process.exit(warnings.length === 0 ? 0 : 1);
}
