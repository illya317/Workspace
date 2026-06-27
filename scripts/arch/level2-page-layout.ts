import ts from "typescript";

type SourceInfo = {
  absPath: string;
  relPath: string;
  text: string;
  sourceFile: ts.SourceFile;
  imports: Array<{ kind: "static" | "dynamic"; specifier: string }>;
  hasJsx: boolean;
};

export type BusinessPageLayoutPrimitiveUsage = {
  file: string;
  primitive: string;
  usage: "jsx" | "createElement" | "call";
};

export type BusinessToolbarCompositionWarning = {
  file: string;
  kind:
    | "embedded-page-surface-toolbar"
    | "inline-form-surface-toolbar"
    | "flex-control-toolbar"
    | "domain-toolbar-registration";
  detail: string;
};

export type PageSurfaceLayoutProtocolWarning = {
  file: string;
  kind:
    | "navigation-tabs"
    | "navigation-pagination"
    | "form-surface-toolbar"
    | "data-surface-toolbar"
    | "data-surface-pagination"
    | "page-surface-content-escape"
    | "app-shell-direct"
    | "page-shell-direct"
    | "shell-description"
    | "multiple-page-surfaces";
  detail: string;
};

type PageSurfaceFunctionScope = {
  name: string;
  pageSurfaceCount: number;
};

const PAGE_LAYOUT_PRIMITIVE_DENYLIST = new Set([
  "AppShell",
  "PageShell",
  "PageContent",
  "Toolbar",
  "TabBar",
  "Pagination",
]);

const PLATFORM_SYSTEM_SHELL_PAGE_DESIGN_FILES = new Set([
  "packages/platform/ui/AppShell.tsx",
  "packages/platform/ui/UserMenu.tsx",
]);

function isPageSurfaceLayoutProtocolScanFile(file: SourceInfo) {
  if (!/\.(ts|tsx)$/.test(file.relPath)) return false;
  if (file.relPath.startsWith("packages/core/")) return false;
  if (file.relPath.startsWith("app/")) return true;
  return /^packages\/[^/]+\/ui\//.test(file.relPath);
}

function isBusinessPageLayoutPrimitiveScanFile(file: SourceInfo) {
  if (!/\.(ts|tsx)$/.test(file.relPath)) return false;
  if (file.relPath.startsWith("packages/core/")) return false;
  if (PLATFORM_SYSTEM_SHELL_PAGE_DESIGN_FILES.has(file.relPath)) return false;
  if (file.relPath.startsWith("app/")) return true;
  return /^packages\/[^/]+\/ui\//.test(file.relPath);
}

function isBusinessToolbarCompositionScanFile(file: SourceInfo) {
  if (!/\.(ts|tsx)$/.test(file.relPath)) return false;
  if (file.relPath.startsWith("packages/core/")) return false;
  if (file.relPath.startsWith("app/")) return true;
  if (/^packages\/platform\/ui\/(admin|settings|docs|system)\//.test(file.relPath)) return true;
  return /^packages\/(administration|external|finance|hr|library|production|work)\/ui\//.test(file.relPath);
}

export function findBusinessPageLayoutPrimitiveUsages(files: SourceInfo[]) {
  const candidates: BusinessPageLayoutPrimitiveUsage[] = [];
  const addCandidate = (
    file: SourceInfo,
    primitive: string,
    usage: BusinessPageLayoutPrimitiveUsage["usage"],
  ) => {
    candidates.push({ file: file.relPath, primitive, usage });
  };

  for (const file of files) {
    if (!isBusinessPageLayoutPrimitiveScanFile(file)) continue;

    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(file.sourceFile);
        if (PAGE_LAYOUT_PRIMITIVE_DENYLIST.has(tagName)) addCandidate(file, tagName, "jsx");
      }

      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression) && PAGE_LAYOUT_PRIMITIVE_DENYLIST.has(node.expression.text)) {
          addCandidate(file, node.expression.text, "call");
        }

        if (ts.isIdentifier(node.expression) && node.expression.text === "createElement") {
          const firstArg = node.arguments[0];
          if (firstArg && ts.isIdentifier(firstArg) && PAGE_LAYOUT_PRIMITIVE_DENYLIST.has(firstArg.text)) {
            addCandidate(file, firstArg.text, "createElement");
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(file.sourceFile);
  }

  const uniqueCandidates = new Map<string, BusinessPageLayoutPrimitiveUsage>();
  for (const candidate of candidates) {
    uniqueCandidates.set(`${candidate.file}: ${candidate.primitive} ${candidate.usage}`, candidate);
  }

  return [...uniqueCandidates.values()].sort((left, right) => (
    `${left.file}:${left.primitive}:${left.usage}`.localeCompare(`${right.file}:${right.primitive}:${right.usage}`)
  ));
}

function jsxTagName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile) {
  return node.tagName.getText(sourceFile);
}

function jsxAttributeValueText(
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

function jsxOpeningAttributeText(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile,
  attributeName: string,
) {
  return jsxAttributeValueText(node.attributes, sourceFile, attributeName);
}

function jsxElementStartLine(node: ts.Node, sourceFile: ts.SourceFile) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function jsxHasAttribute(attributes: ts.JsxAttributes, attributeName: string) {
  return attributes.properties.some((property) => (
    ts.isJsxAttribute(property) &&
    ts.isIdentifier(property.name) &&
    property.name.text === attributeName
  ));
}

function addToolbarCompositionWarning(
  warnings: BusinessToolbarCompositionWarning[],
  file: SourceInfo,
  kind: BusinessToolbarCompositionWarning["kind"],
  node: ts.Node,
  detail: string,
) {
  warnings.push({
    file: file.relPath,
    kind,
    detail: `${detail} at line ${jsxElementStartLine(node, file.sourceFile)}`,
  });
}

function looksLikeInlineToolbarForm(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile) {
  const kind = jsxOpeningAttributeText(node, sourceFile, "kind");
  if (kind !== "inline") return false;
  const text = node.getText(sourceFile);
  const hasFields = /\bfields=/.test(text);
  const hasActions = /\bactions=/.test(text);
  const hasToolbarSignal = /search|keyword|filter|筛选|搜索|page-size|分页|权限类型|授权对象|模块开关|公司|年度|月份|状态|重分类|导出|刷新|生成|读取|新建|创建/.test(text);
  return (hasActions || hasFields) && hasToolbarSignal;
}

function looksLikeFlexControlToolbar(node: ts.JsxElement, sourceFile: ts.SourceFile) {
  const tagName = jsxTagName(node.openingElement, sourceFile);
  if (!["div", "form", "section", "header"].includes(tagName)) return false;
  const className = jsxOpeningAttributeText(node.openingElement, sourceFile, "className");
  if (/flex-col/.test(className)) return false;
  if (!/flex|items-center|justify-between|gap-|space-x|grid-cols-\[.*auto/.test(className)) return false;
  const text = node.getText(sourceFile);
  const controlSignals = text.match(/<(button|input|select|CommandButton|FormSurface|PageSurface|DataSurface)\b|kind:\s*["'](search|select|icon-button|action-group|button|submit)/g) ?? [];
  const labelSignals = text.match(/搜索|筛选|分页|新建|创建|生成|导出|刷新|保存|取消|全部|状态|公司|年度|月份/g) ?? [];
  return controlSignals.length >= 1 && labelSignals.length >= 1;
}

function looksLikeDomainToolbarRegistrationName(name: string) {
  return /^use[A-Z][A-Za-z0-9]*PageToolbar$/.test(name) || /^use[A-Z][A-Za-z0-9]*ToolbarRegistration$/.test(name);
}

export function findBusinessToolbarCompositionWarnings(files: SourceInfo[]) {
  const warnings: BusinessToolbarCompositionWarning[] = [];

  for (const file of files) {
    if (!isBusinessToolbarCompositionScanFile(file)) continue;

    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = jsxTagName(node, file.sourceFile);
        if (
          tagName === "PageSurface" &&
          jsxHasAttribute(node.attributes, "embedded") &&
          jsxHasAttribute(node.attributes, "toolbar")
        ) {
          addToolbarCompositionWarning(warnings, file, "embedded-page-surface-toolbar", node, "embedded PageSurface owns toolbar");
        }

        if (tagName === "FormSurface" && looksLikeInlineToolbarForm(node, file.sourceFile)) {
          addToolbarCompositionWarning(warnings, file, "inline-form-surface-toolbar", node, "inline FormSurface looks like toolbar/filter row");
        }
      }

      if (ts.isJsxElement(node) && looksLikeFlexControlToolbar(node, file.sourceFile)) {
        addToolbarCompositionWarning(warnings, file, "flex-control-toolbar", node, "flex/grid container groups page controls");
      }

      if (ts.isFunctionDeclaration(node) && node.name && looksLikeDomainToolbarRegistrationName(node.name.text)) {
        addToolbarCompositionWarning(warnings, file, "domain-toolbar-registration", node, "domain hook registers PageSurface toolbar outside page contract");
      }

      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && looksLikeDomainToolbarRegistrationName(node.expression.text)) {
        addToolbarCompositionWarning(warnings, file, "domain-toolbar-registration", node, "domain component registers PageSurface toolbar outside page contract");
      }

      ts.forEachChild(node, visit);
    };

    visit(file.sourceFile);
  }

  const uniqueWarnings = new Map<string, BusinessToolbarCompositionWarning>();
  for (const warning of warnings) {
    uniqueWarnings.set(`${warning.file}: ${warning.kind}: ${warning.detail}`, warning);
  }

  return [...uniqueWarnings.values()].sort((left, right) => (
    `${left.file}:${left.kind}:${left.detail}`.localeCompare(`${right.file}:${right.kind}:${right.detail}`)
  ));
}

function stringLiteralValue(node: ts.Expression) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function propNameText(name: ts.PropertyName) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function objectProperty(objectLiteral: ts.ObjectLiteralExpression, name: string) {
  for (const property of objectLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName = propNameText(property.name);
    if (propertyName === name) return property.initializer;
  }
  return null;
}

function objectStringProperty(objectLiteral: ts.ObjectLiteralExpression, name: string) {
  const initializer = objectProperty(objectLiteral, name);
  return initializer ? stringLiteralValue(initializer) : null;
}

function addLayoutWarning(
  warnings: PageSurfaceLayoutProtocolWarning[],
  file: string,
  kind: PageSurfaceLayoutProtocolWarning["kind"],
  detail: string,
) {
  warnings.push({ file, kind, detail });
}

export function pageSurfaceLayoutProtocolWarningKey(candidate: PageSurfaceLayoutProtocolWarning) {
  return `${candidate.file}: ${candidate.kind}: ${candidate.detail}`;
}

export function findPageSurfaceLayoutProtocolWarnings(files: SourceInfo[]) {
  const warnings: PageSurfaceLayoutProtocolWarning[] = [];

  for (const file of files) {
    if (!isPageSurfaceLayoutProtocolScanFile(file)) continue;

    let topLevelPageSurfaceCount = 0;
    const functionScopes: PageSurfaceFunctionScope[] = [];

    function functionScopeName(node: ts.Node): string {
      if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
      if ((ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
        return node.parent.name.text;
      }
      if ((ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && ts.isPropertyAssignment(node.parent)) {
        return node.parent.name.getText(file.sourceFile);
      }
      if (ts.isMethodDeclaration(node)) return node.name.getText(file.sourceFile);
      return "<anonymous>";
    }

    function isFunctionScopeNode(node: ts.Node): boolean {
      return ts.isFunctionDeclaration(node)
        || ts.isFunctionExpression(node)
        || ts.isArrowFunction(node)
        || ts.isMethodDeclaration(node);
    }

    const visit = (node: ts.Node) => {
      if (isFunctionScopeNode(node)) {
        const scope: PageSurfaceFunctionScope = {
          name: functionScopeName(node),
          pageSurfaceCount: 0,
        };
        functionScopes.push(scope);
        ts.forEachChild(node, visit);
        functionScopes.pop();
        if (scope.pageSurfaceCount > 1) {
          addLayoutWarning(warnings, file.relPath, "multiple-page-surfaces", `${scope.name} has ${scope.pageSurfaceCount} PageSurface JSX entries`);
        }
        return;
      }

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(file.sourceFile);
        if (tagName === "PageSurface") {
          const currentScope = functionScopes[functionScopes.length - 1];
          if (currentScope) currentScope.pageSurfaceCount += 1;
          else topLevelPageSurfaceCount += 1;
          const contentClassName = jsxAttributeValueText(node.attributes, file.sourceFile, "contentClassName");
          if (/\b!?(p|py|pt|pb)-0\b|\b!?max-w-none\b/.test(contentClassName)) {
            addLayoutWarning(warnings, file.relPath, "page-surface-content-escape", `PageSurface contentClassName=${JSON.stringify(contentClassName)}`);
          }
        }

        if (tagName === "NavigationSurface") {
          const kind = jsxAttributeValueText(node.attributes, file.sourceFile, "kind");
          if (kind === "tabs") addLayoutWarning(warnings, file.relPath, "navigation-tabs", "NavigationSurface kind=tabs direct layout entry");
          if (kind === "pagination") addLayoutWarning(warnings, file.relPath, "navigation-pagination", "NavigationSurface kind=pagination direct layout entry");
        }

        if (tagName === "FormSurface" && jsxHasAttribute(node.attributes, "toolbar")) {
          addLayoutWarning(warnings, file.relPath, "form-surface-toolbar", "FormSurface toolbar prop");
        }

        if (tagName === "DataSurface") {
          if (jsxHasAttribute(node.attributes, "toolbar")) addLayoutWarning(warnings, file.relPath, "data-surface-toolbar", "DataSurface toolbar prop");
          if (jsxHasAttribute(node.attributes, "pagination")) addLayoutWarning(warnings, file.relPath, "data-surface-pagination", "DataSurface pagination prop");
        }

        if (tagName === "AppShell") addLayoutWarning(warnings, file.relPath, "app-shell-direct", "AppShell direct page shell");
        if (tagName === "PageShell") addLayoutWarning(warnings, file.relPath, "page-shell-direct", "PageShell direct page shell");

        const description = jsxAttributeValueText(node.attributes, file.sourceFile, "description");
        if (description && /创建并管理|跟踪|支持|查看|维护|记录/.test(description) && /Shell|Page/.test(tagName)) {
          addLayoutWarning(warnings, file.relPath, "shell-description", `${tagName} description=${JSON.stringify(description)}`);
        }
      }

      if (ts.isObjectLiteralExpression(node)) {
        const kind = objectStringProperty(node, "kind");
        const surface = objectProperty(node, "surface");
        if (kind === "navigation" && surface && ts.isObjectLiteralExpression(surface)) {
          const surfaceKind = objectStringProperty(surface, "kind");
          if (surfaceKind === "tabs") addLayoutWarning(warnings, file.relPath, "navigation-tabs", "PageSurface block navigation surface kind=tabs");
          if (surfaceKind === "pagination") addLayoutWarning(warnings, file.relPath, "navigation-pagination", "PageSurface block navigation surface kind=pagination");
        }
        if (kind === "data" && surface && ts.isObjectLiteralExpression(surface)) {
          if (objectProperty(surface, "toolbar")) addLayoutWarning(warnings, file.relPath, "data-surface-toolbar", "PageSurface data block surface.toolbar");
          if (objectProperty(surface, "pagination")) addLayoutWarning(warnings, file.relPath, "data-surface-pagination", "PageSurface data block surface.pagination");
        }
        if (kind === "form" && surface && ts.isObjectLiteralExpression(surface) && objectProperty(surface, "toolbar")) {
          addLayoutWarning(warnings, file.relPath, "form-surface-toolbar", "PageSurface form block surface.toolbar");
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(file.sourceFile);
    if (topLevelPageSurfaceCount > 1) {
      addLayoutWarning(warnings, file.relPath, "multiple-page-surfaces", `${topLevelPageSurfaceCount} top-level PageSurface JSX entries`);
    }
  }

  const unique = new Map<string, PageSurfaceLayoutProtocolWarning>();
  for (const warning of warnings) {
    unique.set(pageSurfaceLayoutProtocolWarningKey(warning), warning);
  }
  return [...unique.values()].sort((left, right) => pageSurfaceLayoutProtocolWarningKey(left).localeCompare(pageSurfaceLayoutProtocolWarningKey(right)));
}
