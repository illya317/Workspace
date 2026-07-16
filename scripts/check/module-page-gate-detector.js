const ts = require("typescript");

const AUTH_SOURCE = "@workspace/platform/server/auth";
const PROTECTED_PAGE_SOURCE = "@workspace/platform/ui/protected-page";
const MODULE_HOME_SOURCE = "@workspace/platform/ui/ModuleHomePage";
const PERMISSION_ACTION_KEYS = new Set([
  "entry", "read", "create", "update", "delete",
  "archive", "revise", "reverse", "lock", "unlock",
  "submit", "approve", "reject",
  "import", "export", "apiUse", "share",
  "grant", "configure", "audit",
]);

function parseSource(text) {
  return ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function namedImportBindings(sourceFile, moduleSource, importedName) {
  const bindings = new Set();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== moduleSource) continue;
    const elements = statement.importClause?.namedBindings;
    if (!elements || !ts.isNamedImports(elements)) continue;
    for (const element of elements.elements) {
      if ((element.propertyName?.text ?? element.name.text) === importedName) bindings.add(element.name.text);
    }
  }
  return bindings;
}

function defaultImportBinding(sourceFile, moduleSource) {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== moduleSource) continue;
    if (statement.importClause?.name) return statement.importClause.name.text;
  }
  return null;
}

function stringValue(node) {
  return node && ts.isStringLiteral(node) ? node.text : null;
}

function objectStringProperty(object, propertyName) {
  if (!object || !ts.isObjectLiteralExpression(object)) return null;
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
      ? property.name.text
      : null;
    if (name === propertyName) return stringValue(property.initializer);
  }
  return null;
}

function isFunctionLike(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node);
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind));
}

function defaultExportedFunctions(sourceFile) {
  const namedFunctions = new Map();
  const result = new Set();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      if (statement.name) namedFunctions.set(statement.name.text, statement);
      if (
        hasModifier(statement, ts.SyntaxKind.ExportKeyword)
        && hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
      ) result.add(statement);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name)
        && declaration.initializer
        && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
      ) namedFunctions.set(declaration.name.text, declaration.initializer);
    }
  }
  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement) || statement.isExportEquals) continue;
    if (isFunctionLike(statement.expression)) result.add(statement.expression);
    if (ts.isIdentifier(statement.expression)) {
      const declaration = namedFunctions.get(statement.expression.text);
      if (declaration) result.add(declaration);
    }
  }
  return result;
}

function isConditionalExecutionAncestor(node) {
  return ts.isIfStatement(node)
    || ts.isConditionalExpression(node)
    || ts.isSwitchStatement(node)
    || ts.isCaseClause(node)
    || ts.isDefaultClause(node)
    || ts.isForStatement(node)
    || ts.isForInStatement(node)
    || ts.isForOfStatement(node)
    || ts.isWhileStatement(node)
    || ts.isDoStatement(node)
    || (ts.isBinaryExpression(node) && [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(node.operatorToken.kind));
}

function bindingNameMatches(name, binding) {
  if (ts.isIdentifier(name)) return name.text === binding;
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    return name.elements.some((element) => (
      ts.isBindingElement(element) && bindingNameMatches(element.name, binding)
    ));
  }
  return false;
}

function functionShadowsBinding(fn, binding) {
  if (fn.parameters.some((parameter) => bindingNameMatches(parameter.name, binding))) return true;
  let shadowed = false;
  function visit(node) {
    if (shadowed) return;
    if (node !== fn && isFunctionLike(node)) {
      if (node.name && ts.isIdentifier(node.name) && node.name.text === binding) shadowed = true;
      return;
    }
    if (ts.isVariableDeclaration(node) && bindingNameMatches(node.name, binding)) {
      shadowed = true;
      return;
    }
    if ((ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.text === binding) {
      shadowed = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  if (fn.body) visit(fn.body);
  return shadowed;
}

function unwrapParentheses(node) {
  let current = node;
  while (current.parent && ts.isParenthesizedExpression(current.parent)) current = current.parent;
  return current;
}

function directGateExecutionNode(call) {
  const direct = unwrapParentheses(call);
  if (direct.parent && (ts.isAwaitExpression(direct.parent) || ts.isReturnStatement(direct.parent))) {
    return direct.parent;
  }
  if (!direct.parent || !ts.isArrayLiteralExpression(direct.parent)) return null;
  const array = direct.parent;
  const promiseCall = unwrapParentheses(array).parent;
  if (
    !promiseCall
    || !ts.isCallExpression(promiseCall)
    || promiseCall.arguments[0] !== array
    || !ts.isPropertyAccessExpression(promiseCall.expression)
    || !ts.isIdentifier(promiseCall.expression.expression)
    || promiseCall.expression.expression.text !== "Promise"
    || promiseCall.expression.name.text !== "all"
  ) return null;
  const awaitedPromiseAll = unwrapParentheses(promiseCall).parent;
  return awaitedPromiseAll && ts.isAwaitExpression(awaitedPromiseAll) ? awaitedPromiseAll : null;
}

function isSafeDefaultExecution(call, sourceFile, binding) {
  const executionNode = directGateExecutionNode(call);
  if (!executionNode) return false;
  const exportedFunctions = defaultExportedFunctions(sourceFile);
  let current = executionNode.parent;
  while (current && current !== sourceFile) {
    if (isFunctionLike(current)) {
      return exportedFunctions.has(current) && !functionShadowsBinding(current, binding);
    }
    if (isConditionalExecutionAncestor(current) || ts.isTryStatement(current) || ts.isCatchClause(current)) return false;
    current = current.parent;
  }
  return false;
}

function hasBlockingImportedCall(sourceFile, bindings, predicate) {
  let found = false;
  function visit(node) {
    if (found) return;
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && bindings.has(node.expression.text)
      && predicate(node)
      && isSafeDefaultExecution(node, sourceFile, node.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function jsxAttributeValue(attributes, attributeName) {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property) || property.name.text !== attributeName) continue;
    if (!property.initializer) return "";
    if (ts.isStringLiteral(property.initializer)) return property.initializer.text;
    if (ts.isJsxExpression(property.initializer)) return stringValue(property.initializer.expression);
  }
  return null;
}

function hasProtectedPageExport(sourceFile, gatePath) {
  const bindings = namedImportBindings(sourceFile, PROTECTED_PAGE_SOURCE, "createProtectedModulePage");
  return sourceFile.statements.some((statement) => (
    ts.isExportAssignment(statement)
    && !statement.isExportEquals
    && ts.isCallExpression(statement.expression)
    && ts.isIdentifier(statement.expression.expression)
    && bindings.has(statement.expression.expression.text)
    && objectStringProperty(statement.expression.arguments[0], "route") === gatePath
  ));
}

function hasModuleHomePageAst(sourceFile, moduleKey) {
  if (!moduleKey) return false;
  const binding = defaultImportBinding(sourceFile, MODULE_HOME_SOURCE);
  if (!binding) return false;
  if (hasBlockingImportedCall(sourceFile, new Set([binding]), (call) => (
    objectStringProperty(call.arguments[0], "moduleKey") === moduleKey
  ))) return true;

  let found = false;
  function visit(node) {
    if (found) return;
    const element = ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node) ? node : null;
    if (
      element
      && ts.isIdentifier(element.tagName)
      && element.tagName.text === binding
      && jsxAttributeValue(element.attributes, "moduleKey") === moduleKey
      && (() => {
        const rendered = unwrapParentheses(element);
        if (!rendered.parent || !ts.isReturnStatement(rendered.parent)) return false;
        const exportedFunctions = defaultExportedFunctions(sourceFile);
        let current = rendered.parent.parent;
        while (current && current !== sourceFile) {
          if (isFunctionLike(current)) return exportedFunctions.has(current) && !functionShadowsBinding(current, binding);
          if (isConditionalExecutionAncestor(current) || ts.isTryStatement(current) || ts.isCatchClause(current)) return false;
          current = current.parent;
        }
        return false;
      })()
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function hasModuleHomePage(text, moduleKey) {
  return hasModuleHomePageAst(parseSource(text), moduleKey);
}

function hasRouteAccessGate(text, gatePath, moduleKey) {
  const sourceFile = parseSource(text);
  const routeBindings = namedImportBindings(sourceFile, AUTH_SOURCE, "requireRouteAccess");
  if (hasBlockingImportedCall(sourceFile, routeBindings, (call) => (
    stringValue(call.arguments[0]) === gatePath
  ))) return true;

  const actionBindings = namedImportBindings(sourceFile, AUTH_SOURCE, "requireRouteActionAccess");
  if (hasBlockingImportedCall(sourceFile, actionBindings, (call) => {
    const actionKey = stringValue(call.arguments[1]);
    return stringValue(call.arguments[0]) === gatePath
      && actionKey !== null
      && PERMISSION_ACTION_KEYS.has(actionKey);
  })) return true;

  if (hasProtectedPageExport(sourceFile, gatePath)) return true;
  return hasModuleHomePageAst(sourceFile, moduleKey);
}

module.exports = { hasModuleHomePage, hasRouteAccessGate };
