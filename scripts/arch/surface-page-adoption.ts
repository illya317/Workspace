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
  ["blocks", "Use body.sections or createPageBody(sections)."],
  ["empty", "Use body.empty or createPageBody(sections, { empty })."],
  ["actions", "Use body.commands for local commands, or toolbar.items for page-level actions."],
  ["tabs", "Use tabbar={createPageTabBar(...)}."],
  ["activeTab", "Use tabbar.active."],
  ["activeChild", "Use tabbar.activeChild."],
  ["onTabChange", "Use tabbar.onChange."],
  ["onChildChange", "Use tabbar.onChildChange."],
]);
const MANUAL_TABS_NAVIGATION_TARGET = "Use createPageTabBar(...) instead of handwritten tabbar kind=\"tabs\".";

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

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression)) return unwrapExpression(expression.expression);
  if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) return unwrapExpression(expression.expression);
  return expression;
}

function propertyInitializer(property: ts.ObjectLiteralElementLike) {
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  return undefined;
}

function isTabsLiteral(expression: ts.Expression) {
  const unwrapped = unwrapExpression(expression);
  return ts.isStringLiteral(unwrapped) && unwrapped.text === "tabs";
}

function objectLiteralHasTabsKind(object: ts.ObjectLiteralExpression) {
  return object.properties.some((property) => {
    if (!ts.isPropertyAssignment(property)) return false;
    return objectPropertyName(property.name) === "kind" && isTabsLiteral(property.initializer);
  });
}

function expressionContainsTabsNavigationObject(expression: ts.Expression): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(unwrapped)) return objectLiteralHasTabsKind(unwrapped);
  if (ts.isConditionalExpression(unwrapped)) {
    return expressionContainsTabsNavigationObject(unwrapped.whenTrue)
      || expressionContainsTabsNavigationObject(unwrapped.whenFalse);
  }
  if (ts.isBinaryExpression(unwrapped) && unwrapped.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    return expressionContainsTabsNavigationObject(unwrapped.left)
      || expressionContainsTabsNavigationObject(unwrapped.right);
  }
  return false;
}

function jsxAttributeExpression(attribute: ts.JsxAttribute) {
  if (!attribute.initializer || !ts.isJsxExpression(attribute.initializer)) return undefined;
  return attribute.initializer.expression;
}

function maybeAddManualTabsNavigationWarning(
  warnings: DeprecatedPageSurfacePropWarning[],
  sourceFile: ts.SourceFile,
  file: string,
  node: ts.Node,
  expression: ts.Expression | undefined,
) {
  if (!expression || !expressionContainsTabsNavigationObject(expression)) return;
  warnings.push({
    file: normalizeFilePath(file),
    line: nodeLine(sourceFile, node),
    prop: "tabbar.kind=tabs",
    migrationTarget: MANUAL_TABS_NAVIGATION_TARGET,
  });
}

export function findDeprecatedPageSurfacePropWarnings() {
  const warnings: DeprecatedPageSurfacePropWarning[] = [];
  const files = SOURCE_ROOTS.flatMap(walkSourceFiles);

  for (const file of files) {
    if (file.startsWith(CORE_UI_IMPLEMENTATION_PREFIX)) continue;
    const text = readFileSync(file, "utf8");
    if (!text.includes("PageSurface")) continue;
    const sourceFile = createSourceFile(file);

    function scan(node: ts.Node) {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        if (jsxTagName(node.tagName) === "PageSurface") {
          for (const attribute of node.attributes.properties) {
            if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
            if (attribute.name.text === "tabbar") {
              maybeAddManualTabsNavigationWarning(
                warnings,
                sourceFile,
                file,
                attribute,
                jsxAttributeExpression(attribute),
              );
            }
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

      if (ts.isObjectLiteralExpression(node)) {
        for (const property of node.properties) {
          if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
          if (objectPropertyName(property.name) !== "tabbar") continue;
          maybeAddManualTabsNavigationWarning(
            warnings,
            sourceFile,
            file,
            property,
            propertyInitializer(property),
          );
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

  console.warn(`⚠ PageSurface adoption warning: ${warnings.length} deprecated/manual PageSurface usage(s) detected outside Core UI.`);
  console.warn("  Rule: new PageSurface code should use body helpers and createPageTabBar for tab navigation.");
  for (const warning of warnings.slice(0, 80)) {
    console.warn(`  - ${warning.file}:${warning.line}: ${warning.prop} -> ${warning.migrationTarget}`);
  }
  if (warnings.length > 80) {
    console.warn(`  ... ${warnings.length - 80} more`);
  }
}

export function checkPageSurfaceAdoption() {
  const warnings = findDeprecatedPageSurfacePropWarnings();
  printReport(warnings);
  return warnings.length === 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  process.exit(checkPageSurfaceAdoption() ? 0 : 1);
}
