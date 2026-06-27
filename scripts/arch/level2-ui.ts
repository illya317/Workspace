import path from "node:path";
import ts from "typescript";

import {
  coreUiComponentRegistry,
  registeredCoreUiComponentNames,
} from "../../packages/core/ui/component-registry";

type ImportRecord = {
  kind: "static" | "dynamic";
  specifier: string;
};

type SourceInfo = {
  absPath: string;
  relPath: string;
  text: string;
  sourceFile: ts.SourceFile;
  imports: ImportRecord[];
  hasJsx: boolean;
};

export type UiPatternCandidate = {
  file: string;
  packageName: string;
  layer: "core" | "platform" | "domain" | "unknown";
  patterns: string[];
  importsCoreUi: boolean;
  importsPlatformUi: boolean;
};

export type HookPatternCandidate = {
  file: string;
  packageName: string;
  layer: "core" | "platform" | "domain" | "unknown";
  hookName: string;
  importsCoreHooks: boolean;
  importsPlatformHooks: boolean;
  hasLocalImplementation: boolean;
};

export type UnregisteredCoreUiImport = {
  file: string;
  importedName: string;
  specifier: string;
};

export type BusinessCoreUiSurfaceBypassImport = {
  file: string;
  importedName: string;
  specifier: string;
};

export type BusinessCoreUiTypeBypassImport = {
  file: string;
  importedName: string;
  specifier: string;
};

export type PageDesignDriftFile = {
  file: string;
  signals: string[];
};

export type NativeSearchInputFile = {
  file: string;
  signals: string[];
};

export type GeneratedFilterContractDrift = {
  file: string;
  expression: string;
  reason: string;
};

export type UnregisteredCoreUiExport = {
  exportedName: string;
};

export type DuplicateCoreUiRegistration = {
  name: string;
  count: number;
};

const UI_PATTERN_RULES: Array<{ name: string; regex: RegExp }> = [
  { name: "table", regex: /table/i },
  { name: "filter", regex: /filter/i },
  { name: "modal", regex: /modal|dialog/i },
  { name: "form", regex: /form/i },
  { name: "toolbar", regex: /toolbar/i },
  { name: "shell", regex: /shell/i },
  { name: "select", regex: /select|dropdown|picker|combobox/i },
  { name: "search", regex: /search/i },
  { name: "pagination", regex: /pagination|pager/i },
  { name: "tabs", regex: /tabs?|tabbar/i },
  { name: "date", regex: /date(input|picker|field)|calendar/i },
];

const CORE_UI_NON_COMPONENT_EXPORTS = new Set<string>([
  "FLOATING_OVERLAY_OPEN_EVENT",
  "announceFloatingOverlayOpen",
  "getFloatingOverlayOpenDetail",
]);
const BUSINESS_PACKAGE_NAMES = new Set([
  "administration",
  "external",
  "finance",
  "hr",
  "library",
  "production",
  "work",
]);
const CORE_UI_BUSINESS_SURFACE_IMPORT_ALLOWLIST = new Set([
  "DataSurface",
  "FormSurface",
  "NavigationSurface",
  "PageSurface",
  "useFeedback",
]);
const CORE_UI_BUSINESS_TYPE_IMPORT_DENYLIST = new Set([
  "DataTableColumn",
  "FkFieldOption",
  "ToolbarItem",
]);

const PAGE_DESIGN_INTRINSIC_TAGS = new Set([
  "article",
  "aside",
  "button",
  "div",
  "form",
  "header",
  "input",
  "main",
  "nav",
  "section",
  "select",
  "table",
  "textarea",
]);

function getPackageName(relPath: string) {
  const parts = relPath.split("/");
  return parts[0] === "packages" && parts[1] ? parts[1] : "app-root";
}

function getLayer(packageName: string): UiPatternCandidate["layer"] {
  if (packageName === "core") return "core";
  if (packageName === "platform") return "platform";
  if (packageName === "app-root") return "unknown";
  return "domain";
}

function importsCoreUi(imports: ImportRecord[]) {
  return imports.some((item) => item.specifier === "@workspace/core" || item.specifier.startsWith("@workspace/core/"));
}

function importsPlatformUi(imports: ImportRecord[]) {
  return imports.some((item) => item.specifier === "@workspace/platform" || item.specifier.startsWith("@workspace/platform/"));
}

function importsCoreHooks(imports: ImportRecord[]) {
  return imports.some((item) => item.specifier === "@workspace/core" || item.specifier.startsWith("@workspace/core/hooks"));
}

function importsPlatformHooks(imports: ImportRecord[]) {
  return imports.some((item) => item.specifier === "@workspace/platform" || item.specifier.startsWith("@workspace/platform/hooks"));
}

function hasLocalRuntimeImplementation(sourceFile: ts.SourceFile) {
  return sourceFile.statements.some((statement) => (
    ts.isFunctionDeclaration(statement) ||
    ts.isVariableStatement(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  ));
}

export function findUiPatternCandidates(files: SourceInfo[]) {
  const candidates: UiPatternCandidate[] = [];

  for (const file of files) {
    if (!file.relPath.startsWith("packages/") || !file.relPath.endsWith(".tsx")) continue;
    if (file.relPath.startsWith("packages/core/ui/")) continue;

    const name = path.basename(file.relPath, path.extname(file.relPath));
    const patterns = UI_PATTERN_RULES
      .filter((rule) => rule.regex.test(name))
      .map((rule) => rule.name)
      .sort();

    if (patterns.length === 0) continue;

    const packageName = getPackageName(file.relPath);
    candidates.push({
      file: file.relPath,
      packageName,
      layer: getLayer(packageName),
      patterns,
      importsCoreUi: importsCoreUi(file.imports),
      importsPlatformUi: importsPlatformUi(file.imports),
    });
  }

  return candidates.sort((left, right) => left.file.localeCompare(right.file));
}

export function findHookPatternCandidates(files: SourceInfo[]) {
  const candidates: HookPatternCandidate[] = [];

  for (const file of files) {
    const baseName = path.basename(file.relPath, path.extname(file.relPath));
    const isHookName = /^use[A-Z0-9]/.test(baseName);
    const isHookPath =
      file.relPath.startsWith("app/hooks/") ||
      /^packages\/[^/]+\/(ui\/)?hooks\//.test(file.relPath);
    if (!isHookName || !isHookPath) continue;

    const packageName = getPackageName(file.relPath);
    candidates.push({
      file: file.relPath,
      packageName,
      layer: getLayer(packageName),
      hookName: baseName,
      importsCoreHooks: importsCoreHooks(file.imports),
      importsPlatformHooks: importsPlatformHooks(file.imports),
      hasLocalImplementation: hasLocalRuntimeImplementation(file.sourceFile),
    });
  }

  return candidates.sort((left, right) => left.file.localeCompare(right.file));
}

function coreUiDeepImportName(specifier: string) {
  const prefix = "@workspace/core/ui/";
  if (!specifier.startsWith(prefix)) return null;
  const name = specifier.slice(prefix.length).split("/")[0];
  return name && name !== "component-registry" ? name : null;
}

function isBusinessUiSurfaceScanFile(file: SourceInfo) {
  if (!/\.(ts|tsx)$/.test(file.relPath)) return false;
  if (file.relPath.startsWith("app/(modules)/")) return true;

  const match = /^packages\/([^/]+)\/ui\//.exec(file.relPath);
  return Boolean(match && BUSINESS_PACKAGE_NAMES.has(match[1]));
}

function isBusinessCoreUiTypeScanFile(file: SourceInfo) {
  if (!/\.(ts|tsx)$/.test(file.relPath)) return false;
  if (file.relPath.startsWith("packages/core/")) return false;
  if (file.relPath.startsWith("app/")) return true;
  return /^packages\/[^/]+\/ui\//.test(file.relPath);
}

export function findUnregisteredCoreUiImports(files: SourceInfo[]) {
  const candidates: UnregisteredCoreUiImport[] = [];

  for (const file of files) {
    if (file.relPath.startsWith("packages/core/")) continue;

    for (const statement of file.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      const importClause = statement.importClause;
      if (!importClause || importClause.isTypeOnly) continue;

      if (specifier === "@workspace/core/ui") {
        const namedBindings = importClause.namedBindings;
        if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
        for (const element of namedBindings.elements) {
          if (element.isTypeOnly) continue;
          const importedName = element.propertyName?.text ?? element.name.text;
          if (
            !registeredCoreUiComponentNames.has(importedName) &&
            !CORE_UI_NON_COMPONENT_EXPORTS.has(importedName)
          ) {
            candidates.push({ file: file.relPath, importedName, specifier });
          }
        }
        continue;
      }

      const deepImportName = coreUiDeepImportName(specifier);
      if (deepImportName && !registeredCoreUiComponentNames.has(deepImportName)) {
        candidates.push({ file: file.relPath, importedName: deepImportName, specifier });
      }
    }
  }

  return candidates.sort((left, right) => `${left.file}:${left.importedName}`.localeCompare(`${right.file}:${right.importedName}`));
}

export function findBusinessCoreUiSurfaceBypassImports(files: SourceInfo[]) {
  const candidates: BusinessCoreUiSurfaceBypassImport[] = [];

  for (const file of files) {
    if (!isBusinessUiSurfaceScanFile(file)) continue;

    for (const statement of file.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (specifier !== "@workspace/core/ui") continue;

      const importClause = statement.importClause;
      if (!importClause || importClause.isTypeOnly) continue;

      if (importClause.name) {
        candidates.push({ file: file.relPath, importedName: importClause.name.text, specifier });
      }

      const namedBindings = importClause.namedBindings;
      if (!namedBindings) continue;

      if (ts.isNamespaceImport(namedBindings)) {
        candidates.push({ file: file.relPath, importedName: namedBindings.name.text, specifier });
        continue;
      }

      for (const element of namedBindings.elements) {
        if (element.isTypeOnly) continue;
        const importedName = element.propertyName?.text ?? element.name.text;
        if (!CORE_UI_BUSINESS_SURFACE_IMPORT_ALLOWLIST.has(importedName)) {
          candidates.push({ file: file.relPath, importedName, specifier });
        }
      }
    }
  }

  return candidates.sort((left, right) => `${left.file}:${left.importedName}`.localeCompare(`${right.file}:${right.importedName}`));
}

export function findBusinessCoreUiTypeBypassImports(files: SourceInfo[]) {
  const candidates: BusinessCoreUiTypeBypassImport[] = [];

  for (const file of files) {
    if (!isBusinessCoreUiTypeScanFile(file)) continue;

    for (const statement of file.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (specifier !== "@workspace/core/ui") continue;

      const importClause = statement.importClause;
      if (!importClause) continue;

      const namedBindings = importClause.namedBindings;
      if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;

      for (const element of namedBindings.elements) {
        const isTypeOnly = importClause.isTypeOnly || element.isTypeOnly;
        if (!isTypeOnly) continue;

        const importedName = element.propertyName?.text ?? element.name.text;
        if (CORE_UI_BUSINESS_TYPE_IMPORT_DENYLIST.has(importedName)) {
          candidates.push({ file: file.relPath, importedName, specifier });
        }
      }
    }
  }

  return candidates.sort((left, right) => `${left.file}:${left.importedName}`.localeCompare(`${right.file}:${right.importedName}`));
}

function collectCoreUiValueExports(files: SourceInfo[]) {
  const indexFile = files.find((file) => file.relPath === "packages/core/ui/index.ts");
  if (!indexFile) return [];

  const exports = new Set<string>();

  for (const statement of indexFile.sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;

    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly) continue;
      exports.add(element.name.text);
    }
  }

  return [...exports].sort();
}

export function findUnregisteredCoreUiExports(files: SourceInfo[]) {
  return collectCoreUiValueExports(files)
    .filter((exportedName) => !registeredCoreUiComponentNames.has(exportedName))
    .filter((exportedName) => !CORE_UI_NON_COMPONENT_EXPORTS.has(exportedName))
    .map((exportedName) => ({ exportedName }))
    .sort((left, right) => left.exportedName.localeCompare(right.exportedName));
}

export function findDuplicateCoreUiRegistrations() {
  const counts = new Map<string, number>();

  for (const component of coreUiComponentRegistry) {
    counts.set(component.name, (counts.get(component.name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function classNameText(attribute: ts.JsxAttribute, sourceFile: ts.SourceFile) {
  const initializer = attribute.initializer;
  if (!initializer) return "";
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return initializer.getText(sourceFile);
  if (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression)) {
    return initializer.expression.text;
  }
  return initializer.expression.getText(sourceFile);
}

function jsxAttributeText(
  attributes: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
  attributeName: string,
) {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) continue;
    if (property.name.text !== attributeName) continue;
    const initializer = property.initializer;
    if (!initializer) return "";
    if (ts.isStringLiteral(initializer)) return initializer.text;
    if (!ts.isJsxExpression(initializer) || !initializer.expression) return initializer.getText(sourceFile);
    if (ts.isStringLiteral(initializer.expression) || ts.isNoSubstitutionTemplateLiteral(initializer.expression)) {
      return initializer.expression.text;
    }
    return initializer.expression.getText(sourceFile);
  }
  return "";
}

function pageDesignSignals(tagName: string, className: string) {
  const signals: string[] = [];
  const hasSurfaceColor = /\bbg-white\b|\bbg-slate-50\b|\bbg-gray-50\b/.test(className);
  const hasSurfaceShape = /\brounded(?:-[a-z0-9[\]/.-]+)?\b/.test(className);
  const hasSurfaceDepth = /\bshadow(?:-[a-z0-9[\]/.-]+)?\b/.test(className);
  const hasSurfaceBorder = /\bborder(?:-[a-z0-9[\]/.-]+)?\b/.test(className);
  const hasSurfacePadding = /\bp(?:x|y|t|r|b|l)?-[0-9]/.test(className);

  if (tagName === "table") signals.push("handwritten-table");
  if (tagName === "form") signals.push("handwritten-form");
  if (["input", "select", "textarea"].includes(tagName)) signals.push("handwritten-form-control");
  if (hasSurfaceColor && hasSurfaceShape && (hasSurfaceDepth || hasSurfaceBorder) && hasSurfacePadding) signals.push("handwritten-surface");
  if (/\bsticky\b/.test(className) && /\btop-/.test(className) && /\bbg-/.test(className)) signals.push("handwritten-sticky-header");
  if (/\bgrid\b/.test(className) && /grid-cols-\[/.test(className) && hasSurfaceColor) signals.push("handwritten-layout-grid");
  if (/\bfixed\b/.test(className) && /\binset-0\b/.test(className) && /\bbg-(black|slate|gray)-/.test(className)) signals.push("handwritten-modal-overlay");
  if (/\boverflow-x-auto\b/.test(className)) signals.push("handwritten-table-scroll-shell");
  if (/\bflex\b/.test(className) && /\bitems-center\b/.test(className) && /\bjustify-between\b/.test(className)) signals.push("handwritten-toolbar-layout");
  if (tagName === "button" && hasSurfaceShape && /\b(px|py)-[0-9]/.test(className) && (hasSurfaceBorder || /\bbg-(emerald|red|blue|slate|gray)-/.test(className))) {
    signals.push("handwritten-action-button");
  }

  return signals;
}

export function findPageDesignDriftFiles(files: SourceInfo[]) {
  const drift: PageDesignDriftFile[] = [];

  for (const file of files) {
    if (!file.relPath.endsWith(".tsx")) continue;
    if (!file.relPath.startsWith("packages/")) continue;
    if (file.relPath.startsWith("packages/core/")) continue;
    if (!/\/ui\//.test(file.relPath)) continue;

    const signals = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(file.sourceFile);
        if (PAGE_DESIGN_INTRINSIC_TAGS.has(tagName)) {
          let className = "";
          for (const property of node.attributes.properties) {
            if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name) || property.name.text !== "className") continue;
            className = classNameText(property, file.sourceFile);
          }
          for (const signal of pageDesignSignals(tagName, className)) {
            signals.add(signal);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(file.sourceFile);
    if (signals.size > 0) {
      drift.push({ file: file.relPath, signals: [...signals].sort() });
    }
  }

  return drift.sort((left, right) => left.file.localeCompare(right.file));
}

function isAllowedNativeSearchInputFile(file: SourceInfo) {
  return file.relPath === "packages/core/ui/SearchInput.tsx";
}

function nativeSearchInputSignals(attributes: ts.JsxAttributes, sourceFile: ts.SourceFile) {
  const signals: string[] = [];
  const typeText = jsxAttributeText(attributes, sourceFile, "type");
  const placeholderText = jsxAttributeText(attributes, sourceFile, "placeholder");
  const ariaLabelText = jsxAttributeText(attributes, sourceFile, "aria-label");

  if (/^search$|["'`]search["'`]/i.test(typeText)) signals.push("native-type-search");
  if (/搜索|search/i.test(placeholderText)) signals.push("search-placeholder");
  if (/搜索|search/i.test(ariaLabelText)) signals.push("search-aria-label");

  return signals;
}

export function findNativeSearchInputFiles(files: SourceInfo[]) {
  const drift: NativeSearchInputFile[] = [];

  for (const file of files) {
    if (!file.relPath.endsWith(".tsx")) continue;
    if (!file.relPath.startsWith("app/") && !file.relPath.startsWith("packages/")) continue;
    if (isAllowedNativeSearchInputFile(file)) continue;

    const signals = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(file.sourceFile);
        if (tagName === "input") {
          for (const signal of nativeSearchInputSignals(node.attributes, file.sourceFile)) {
            signals.add(signal);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(file.sourceFile);
    if (signals.size > 0) {
      drift.push({ file: file.relPath, signals: [...signals].sort() });
    }
  }

  return drift.sort((left, right) => left.file.localeCompare(right.file));
}

function jsxAttributeExpressionNode(
  attributes: ts.JsxAttributes,
  attributeName: string,
) {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property) || !ts.isIdentifier(property.name)) continue;
    if (property.name.text !== attributeName) continue;
    const initializer = property.initializer;
    if (!initializer) return null;
    if (ts.isJsxExpression(initializer) && initializer.expression) {
      return initializer.expression;
    }
    return null;
  }
  return null;
}

function collectConstInitializers(sourceFile: ts.SourceFile) {
  const initializers = new Map<string, ts.Expression>();

  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node)) {
      const isConst = (node.declarationList.flags & ts.NodeFlags.Const) !== 0;
      if (isConst) {
        for (const declaration of node.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
          initializers.set(declaration.name.text, declaration.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return initializers;
}

function collectFieldValueFilterBindings(sourceFile: ts.SourceFile) {
  const localNames = new Set<string>();
  const namespaceNames = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (specifier === "@workspace/core/ui/FieldValueFilter" && clause.name) localNames.add(clause.name.text);
    if (specifier !== "@workspace/core/ui") continue;
    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) namespaceNames.add(bindings.name.text);
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const importedName = element.propertyName?.text ?? element.name.text;
        if (importedName === "FieldValueFilter") localNames.add(element.name.text);
      }
    }
  }
  return { localNames, namespaceNames };
}

function isFieldValueFilterTag(tagName: ts.JsxTagNameExpression, bindings: ReturnType<typeof collectFieldValueFilterBindings>) {
  if (ts.isIdentifier(tagName)) return bindings.localNames.has(tagName.text);
  return ts.isPropertyAccessExpression(tagName) &&
    ts.isIdentifier(tagName.expression) &&
    bindings.namespaceNames.has(tagName.expression.text) &&
    tagName.name.text === "FieldValueFilter";
}

function isEmptyArrayLiteral(node: ts.Expression) {
  return ts.isArrayLiteralExpression(node) && node.elements.length === 0;
}

function isPureFilterContractExpression(
  node: ts.Expression,
  initializers: Map<string, ts.Expression>,
  seen = new Set<string>(),
): boolean {
  if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) {
    return isPureFilterContractExpression(node.expression, initializers, seen);
  }
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) {
    return isPureFilterContractExpression(node.expression, initializers, seen);
  }
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return false;
    const initializer = initializers.get(node.text);
    return initializer ? isPureFilterContractExpression(initializer, initializers, new Set(seen).add(node.text)) : false;
  }
  if (ts.isPropertyAccessExpression(node)) return node.name.text === "filterFields" && ts.isIdentifier(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    return isPureFilterContractExpression(node.left, initializers, seen) && isEmptyArrayLiteral(node.right);
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    if (node.expression.text === "mapFilterFields") return node.arguments.length === 1 && isPureFilterContractExpression(node.arguments[0], initializers, seen);
    if (node.expression.text === "useMemo" && node.arguments.length > 0) {
      const callback = node.arguments[0];
      return ts.isArrowFunction(callback) && ts.isExpression(callback.body) && isPureFilterContractExpression(callback.body, initializers, seen);
    }
  }
  return false;
}

export function findGeneratedFilterContractDrift(files: SourceInfo[]) {
  const drift: GeneratedFilterContractDrift[] = [];

  for (const file of files) {
    if (!/^packages\/[^/]+\/ui\/generated\/.+\.tsx$/.test(file.relPath)) continue;
    const initializers = collectConstInitializers(file.sourceFile);
    const bindings = collectFieldValueFilterBindings(file.sourceFile);

    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        if (isFieldValueFilterTag(node.tagName, bindings)) {
          const expression = jsxAttributeExpressionNode(node.attributes, "fields");
          if (expression && !isPureFilterContractExpression(expression, initializers)) {
            drift.push({
              file: file.relPath,
              expression: expression.getText(file.sourceFile),
              reason: "generated UI FieldValueFilter fields must come from backend filterFields contract",
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(file.sourceFile);
  }

  return drift.sort((left, right) => `${left.file}:${left.expression}`.localeCompare(`${right.file}:${right.expression}`));
}

export function findAppHookFiles(hooks: HookPatternCandidate[]) {
  return hooks
    .filter((hook) => hook.file.startsWith("app/hooks/"))
    .map((hook) => hook.file)
    .sort();
}

export function findAppHookImplementationFiles(hooks: HookPatternCandidate[]) {
  return hooks
    .filter((hook) => hook.file.startsWith("app/hooks/"))
    .filter((hook) => hook.hasLocalImplementation)
    .map((hook) => hook.file)
    .sort();
}
