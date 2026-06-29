import path from "node:path";
import ts from "typescript";

type SourceInfo = {
  absPath: string;
  relPath: string;
  text: string;
  sourceFile: ts.SourceFile;
  imports: Array<{ kind: "static" | "dynamic"; specifier: string }>;
  hasJsx: boolean;
};

export type BusinessModuleViewUsageCategory =
  | "analysis-visual"
  | "complex-editor"
  | "content-wrapper"
  | "navigation-composition"
  | "report-document"
  | "shell-host"
  | "split-side";

export type BusinessModuleViewMigrationTarget =
  | "data-visual-spec"
  | "document-block-spec"
  | "navigation-surface-spec"
  | "page-content-slot"
  | "page-module-host-spec"
  | "page-split-slot"
  | "surface-composition-spec";

export type BusinessModuleViewUsage = {
  file: string;
  line: number;
  key: string;
  occurrence: number;
  category: BusinessModuleViewUsageCategory;
  migrationTarget: BusinessModuleViewMigrationTarget;
  container: "blocks" | "drawerBlocks" | "unknown";
  viewSignal: string;
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

function isBusinessUiSurfaceScanFile(file: SourceInfo) {
  if (!/\.(ts|tsx)$/.test(file.relPath)) return false;
  if (file.relPath.startsWith("app/(modules)/")) return true;

  const match = /^packages\/([^/]+)\/ui\//.exec(file.relPath);
  return Boolean(match && BUSINESS_PACKAGE_NAMES.has(match[1]));
}

function propertyNameText(name: ts.PropertyName | ts.JsxAttributeName, sourceFile: ts.SourceFile) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sourceFile);
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyAssignment(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find((property): property is ts.PropertyAssignment => (
    ts.isPropertyAssignment(property) &&
    propertyNameText(property.name, object.getSourceFile()) === name
  ));
}

function propertyStringValue(object: ts.ObjectLiteralExpression, name: string) {
  const property = propertyAssignment(object, name);
  if (!property) return null;
  const value = unwrapExpression(property.initializer);
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) ? value.text : null;
}

function propertyExpressionSignal(object: ts.ObjectLiteralExpression, name: string) {
  const property = propertyAssignment(object, name);
  if (!property) return "unknown";

  const value = unwrapExpression(property.initializer);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isJsxElement(value)) return value.openingElement.tagName.getText(object.getSourceFile());
  if (ts.isJsxSelfClosingElement(value)) return value.tagName.getText(object.getSourceFile());
  if (ts.isJsxFragment(value)) return "fragment";
  if (ts.isIdentifier(value)) return value.text;
  if (ts.isCallExpression(value)) return value.expression.getText(object.getSourceFile());
  if (ts.isConditionalExpression(value)) return "conditional";
  return value.getText(object.getSourceFile()).replace(/\s+/g, " ").slice(0, 80);
}

function moduleViewContainer(node: ts.Node) {
  let current: ts.Node | undefined = node;
  while (current) {
    const parent: ts.Node | undefined = current.parent;
    if (!parent) break;

    if (ts.isPropertyAssignment(parent)) {
      const name = propertyNameText(parent.name, parent.getSourceFile());
      if (name === "blocks" || name === "drawerBlocks") return name;
    }

    if (ts.isJsxAttribute(parent)) {
      const name = propertyNameText(parent.name, parent.getSourceFile());
      if (name === "blocks" || name === "drawerBlocks") return name;
    }

    current = parent;
  }

  return "unknown";
}

function classifyBusinessModuleViewUsage(file: SourceInfo, key: string, viewSignal: string): BusinessModuleViewUsageCategory {
  const relPath = file.relPath;
  const baseName = path.basename(relPath, path.extname(relPath));

  if (key === "desktop" || key === "drawer" || relPath.includes("active-workspace") || relPath.includes("organization-view") || relPath.includes("organization-mode-panel")) {
    return "split-side";
  }

  if (relPath.includes("/production/ui/qc/") && !/ModuleShell$/.test(baseName)) return "report-document";
  if (relPath.includes("/finance/ui/statements/")) return "report-document";
  if (key === "activeTab" || /Shell$/.test(baseName) || /renderedModuleView|UserMenu/i.test(viewSignal)) {
    return "shell-host";
  }
  if (relPath.includes("/analytics/") || /bars|chart|matrix|trend|distribution|reasons/i.test(key)) return "analysis-visual";

  if (relPath.includes("navigation-panels") || viewSignal === "NavigationSurface" || /navigation|selector|positions|departments/i.test(key)) {
    return "navigation-composition";
  }

  if (/\bchildren\b/.test(viewSignal) || key === "content" || relPath.includes("FieldRegion") || relPath.includes("archive-browser")) {
    return "content-wrapper";
  }

  if (/Table|Form|Editor|Panel/.test(viewSignal)) return "complex-editor";
  return "complex-editor";
}

function migrationTargetForCategory(category: BusinessModuleViewUsageCategory): BusinessModuleViewMigrationTarget {
  if (category === "analysis-visual") return "data-visual-spec";
  if (category === "report-document") return "document-block-spec";
  if (category === "navigation-composition") return "navigation-surface-spec";
  if (category === "content-wrapper") return "page-content-slot";
  if (category === "shell-host") return "page-module-host-spec";
  if (category === "split-side") return "page-split-slot";
  return "surface-composition-spec";
}

export function findBusinessModuleViewUsages(files: SourceInfo[]) {
  const usages: BusinessModuleViewUsage[] = [];
  const counts = new Map<string, number>();

  for (const file of files) {
    if (!isBusinessUiSurfaceScanFile(file)) continue;

    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node) && propertyStringValue(node, "kind") === "moduleView") {
        const key = propertyExpressionSignal(node, "key");
        const viewSignal = propertyExpressionSignal(node, "view");
        const category = classifyBusinessModuleViewUsage(file, key, viewSignal);
        const migrationTarget = migrationTargetForCategory(category);
        const container = moduleViewContainer(node);
        const identity = `${file.relPath}:${category}:${migrationTarget}:${container}:${key}`;
        const occurrence = (counts.get(identity) ?? 0) + 1;
        const { line } = file.sourceFile.getLineAndCharacterOfPosition(node.getStart(file.sourceFile));
        counts.set(identity, occurrence);
        usages.push({ file: file.relPath, line: line + 1, key, occurrence, category, migrationTarget, container, viewSignal });
      }

      ts.forEachChild(node, visit);
    };

    visit(file.sourceFile);
  }

  return usages.sort((left, right) => `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`));
}
