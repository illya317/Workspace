import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ACTION_GLYPH_ACTION_BY_KEY } from "../../packages/core/ui/internal/action/ActionGlyphs";
import { orderFormSurfaceActions } from "../../packages/core/ui/internal/form/form-surface-actions";

const ROOT = path.resolve(__dirname, "../..");
const SOURCE_ROOTS = ["app", "packages"];
const SOURCE_EXTENSION = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "generated", "node_modules", "tmp"]);
const FORM_KINDS = new Set(["fields", "filters", "detail", "login"]);
const FORBIDDEN_ACTION_PROPERTIES = new Set(["icon", "variant", "size", "presentation", "order", "section", "commandPlacement"]);
const LIFECYCLE_ICONS = new Set(["save", "send", "cancel", "archive", "restore", "approve", "reject"]);
const LIFECYCLE_TOOLBAR_KINDS = new Set(["save", "submit", "cancel", "archive", "unarchive", "restore", "approve", "reject"]);
const LIFECYCLE_LABEL = /保存|提交|取消|归档|恢复|批准|同意|驳回|拒绝/;
const LIFECYCLE_KEY = /(?:^|[-_.])(?:save|submit|cancel|archive|unarchive|restore|approve|reject)(?:$|[-_.])/;

type Violation = { file: string; line: number; reason: string };

function walk(directory: string, files: string[] = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (SOURCE_EXTENSION.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function sourceFiles() {
  return SOURCE_ROOTS.flatMap((root) => walk(path.join(ROOT, root))).filter((filePath) => {
    const relative = path.relative(ROOT, filePath).replace(/\\/g, "/");
    return !relative.startsWith("packages/core/") && !relative.includes("/__tests__/") && !/\.(test|spec)\.[jt]sx?$/.test(relative);
  });
}

function propertyName(property: ts.ObjectLiteralElementLike) {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)) return property.name.text;
  return null;
}

function property(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find((candidate) => propertyName(candidate) === name);
}

function initializer(propertyNode: ts.ObjectLiteralElementLike | undefined) {
  return propertyNode && (ts.isPropertyAssignment(propertyNode) || ts.isShorthandPropertyAssignment(propertyNode))
    ? ts.isPropertyAssignment(propertyNode) ? propertyNode.initializer : propertyNode.name
    : undefined;
}

function stringValue(node: ts.Node | undefined) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}

function callName(node: ts.CallExpression) {
  return ts.isIdentifier(node.expression) ? node.expression.text : null;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

type ExpressionResolver = (name: string) => ts.Expression | undefined;

function commandObjects(
  node: ts.Node | undefined,
  resolve: ExpressionResolver,
  seen = new Set<string>(),
): ts.ObjectLiteralExpression[] {
  if (!node) return [];
  if (ts.isObjectLiteralExpression(node)) return [node];
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return [];
    const resolved = resolve(node.text);
    return resolved ? commandObjects(resolved, resolve, new Set(seen).add(node.text)) : [];
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((element) => commandObjects(element, resolve, seen));
  if (ts.isSpreadElement(node)) return commandObjects(node.expression, resolve, seen);
  if (ts.isConditionalExpression(node)) return [...commandObjects(node.whenTrue, resolve, seen), ...commandObjects(node.whenFalse, resolve, seen)];
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return commandObjects(node.expression, resolve, seen);
  return [];
}

function collectionExpressions(
  node: ts.Node | undefined,
  resolve: ExpressionResolver,
  seen = new Set<string>(),
): ts.Expression[] {
  if (!node || !ts.isExpression(node)) return [];
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return [];
    const resolved = resolve(node.text);
    return resolved ? collectionExpressions(resolved, resolve, new Set(seen).add(node.text)) : [];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => ts.isSpreadElement(element)
      ? collectionExpressions(element.expression, resolve, seen)
      : collectionExpressions(element, resolve, seen));
  }
  if (ts.isConditionalExpression(node)) {
    return [...collectionExpressions(node.whenTrue, resolve, seen), ...collectionExpressions(node.whenFalse, resolve, seen)];
  }
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return collectionExpressions(node.expression, resolve, seen);
  }
  return [node];
}

function objectExpressions(node: ts.Node | undefined, resolve: ExpressionResolver) {
  return collectionExpressions(node, resolve).filter(ts.isObjectLiteralExpression);
}

type DirectRootForm = { options: ts.ObjectLiteralExpression; position: number; kind: string | null };

function directRootForms(node: ts.Node | undefined, resolve: ExpressionResolver): DirectRootForm[] {
  return collectionExpressions(node, resolve).flatMap((section, position): DirectRootForm[] => {
    if (ts.isCallExpression(section)) {
      const name = callName(section);
      const optionsIndex = name === "createFormSection" ? 1 : name === "createFieldsSection" || name === "createInlineFieldsSection" ? 2 : -1;
      if (optionsIndex < 0) return [];
      const kind = name === "createInlineFieldsSection" ? "filters" : name === "createFieldsSection" ? "fields" : null;
      return objectExpressions(section.arguments[optionsIndex], resolve).map((options) => ({ options, position, kind: kind ?? stringValue(initializer(property(options, "kind"))) }));
    }
    if (!ts.isObjectLiteralExpression(section)) return [];
    const body = objectExpressions(initializer(property(section, "body")), resolve)[0];
    if (!body || stringValue(initializer(property(body, "kind"))) !== "form") return [];
    return objectExpressions(initializer(property(body, "form")), resolve).map((options) => ({
      options,
      position,
      kind: stringValue(initializer(property(options, "kind"))),
    }));
  });
}

function resolvedText(node: ts.Node | undefined, sourceFile: ts.SourceFile, resolve: ExpressionResolver) {
  if (!node) return "";
  if (ts.isIdentifier(node)) return resolve(node.text)?.getText(sourceFile) ?? node.getText(sourceFile);
  return node.getText(sourceFile);
}

function isLifecycleCommand(command: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile) {
  const icon = stringValue(initializer(property(command, "icon")));
  const kind = stringValue(initializer(property(command, "kind")));
  const action = stringValue(initializer(property(command, "action")));
  const type = stringValue(initializer(property(command, "type")));
  const labelNode = initializer(property(command, "label"));
  const label = labelNode?.getText(sourceFile) ?? "";
  return Boolean(
    (icon && LIFECYCLE_ICONS.has(icon))
    || (kind && LIFECYCLE_TOOLBAR_KINDS.has(kind))
    || (action && LIFECYCLE_TOOLBAR_KINDS.has(action))
    || type === "submit"
    || LIFECYCLE_LABEL.test(label),
  );
}

function isExplicitFormLifecycleCommand(command: ts.ObjectLiteralExpression) {
  const icon = stringValue(initializer(property(command, "icon")));
  const kind = stringValue(initializer(property(command, "kind")));
  const action = stringValue(initializer(property(command, "action")));
  const type = stringValue(initializer(property(command, "type")));
  const key = stringValue(initializer(property(command, "key")));
  return Boolean(
    (icon && LIFECYCLE_ICONS.has(icon))
    || (kind && LIFECYCLE_TOOLBAR_KINDS.has(kind))
    || (action && LIFECYCLE_TOOLBAR_KINDS.has(action))
    || type === "submit"
    || (key && LIFECYCLE_KEY.test(key)),
  );
}

function checkActionArray(
  node: ts.Node | undefined,
  sourceFile: ts.SourceFile,
  file: string,
  violations: Violation[],
  resolve: ExpressionResolver,
) {
  for (const action of commandObjects(node, resolve)) {
    const forbidden = action.properties.map(propertyName).filter((name): name is string => Boolean(name && FORBIDDEN_ACTION_PROPERTIES.has(name)));
    if (forbidden.length > 0) {
      violations.push({ file, line: lineOf(sourceFile, action), reason: `FormSurface action may not declare ${forbidden.join(", ")}; Core owns visual treatment and ordering.` });
    }
  }
}

function checkFormOptions(
  options: ts.ObjectLiteralExpression,
  kind: string,
  sourceFile: ts.SourceFile,
  file: string,
  violations: Violation[],
  resolve: ExpressionResolver,
) {
  const commandsProperty = property(options, "commands");
  if (commandsProperty) {
    const commands = commandObjects(initializer(commandsProperty), resolve);
    const hasLifecycle = commands.some((command) => isLifecycleCommand(command, sourceFile));
    if (kind !== "filters" || hasLifecycle) {
      violations.push({
        file,
        line: lineOf(sourceFile, commandsProperty),
        reason: kind === "filters"
          ? "Filter commands may not carry form lifecycle actions; declare them through FormSurface actions."
          : "Root field/detail/login forms may not use commands; declare actions through FormSurface.",
      });
    }
  }
  checkActionArray(initializer(property(options, "actions")), sourceFile, file, violations, resolve);
}

function nearestArray(node: ts.Node) {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isArrayLiteralExpression(current)) return current;
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return null;
    current = current.parent;
  }
  return null;
}

export function findFormSurfaceActionViolationsInSource(file: string, source: string): Violation[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations: Violation[] = [];
  const expressions = new Map<string, ts.Expression>();
  const collectExpressions = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) expressions.set(node.name.text, node.initializer);
    ts.forEachChild(node, collectExpressions);
  };
  collectExpressions(sourceFile);
  const resolve: ExpressionResolver = (name) => expressions.get(name);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const name = callName(node);
      if (name === "createFieldsSection" && node.arguments[2] && ts.isObjectLiteralExpression(node.arguments[2])) {
        checkFormOptions(node.arguments[2], "fields", sourceFile, file, violations, resolve);
      }
      if (name === "createInlineFieldsSection" && node.arguments[2] && ts.isObjectLiteralExpression(node.arguments[2])) {
        checkFormOptions(node.arguments[2], "filters", sourceFile, file, violations, resolve);
      }
      if (name === "createFormSection" && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
        const options = node.arguments[1];
        const kind = stringValue(initializer(property(options, "kind")));
        if (kind && FORM_KINDS.has(kind)) checkFormOptions(options, kind, sourceFile, file, violations, resolve);
      }
      if ((name === "createSectionSection" || name === "createPanelSection") && node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])) {
        const options = node.arguments[1];
        const actionsProperty = property(options, "actions");
        const sectionsNode = initializer(property(options, "sections"));
        const directForms = directRootForms(sectionsNode, resolve);
        const parentActions = commandObjects(initializer(actionsProperty), resolve);
        const editableForms = directForms.filter((form) => form.kind !== "filters");
        if (actionsProperty && editableForms.length > 0 && parentActions.some(isExplicitFormLifecycleCommand)) {
          violations.push({ file, line: lineOf(sourceFile, actionsProperty), reason: "A section containing a form may not place actions in the parent header; attach them to FormSurface actions." });
        }
        const titleProperty = property(options, "title");
        if (titleProperty && !actionsProperty && directForms.some((form) => form.position === 0 && property(form.options, "actions"))) {
          violations.push({ file, line: lineOf(sourceFile, titleProperty), reason: "A titled section may not split a root form from its action header; move the title to FormSurface header." });
        }
      }
    }

    if (ts.isObjectLiteralExpression(node)) {
      const kind = stringValue(initializer(property(node, "kind")));
      if (kind && FORM_KINDS.has(kind) && property(node, "content")) checkFormOptions(node, kind, sourceFile, file, violations, resolve);
      if (kind === "section" && property(node, "items") && property(node, "actions")) {
        const actions = commandObjects(initializer(property(node, "actions")), resolve);
        if (actions.some((action) => isLifecycleCommand(action, sourceFile))) {
          violations.push({ file, line: lineOf(sourceFile, property(node, "actions")!), reason: "Nested form sections may not position lifecycle actions; attach them to root FormSurface actions." });
        }
      }
      if (kind === "action-group") {
        const actions = commandObjects(initializer(property(node, "actions")), resolve);
        const array = nearestArray(node);
        if (array && /kind\s*:\s*["']create["']/.test(array.getText(sourceFile)) && actions.some((action) => isLifecycleCommand(action, sourceFile))) {
          violations.push({ file, line: lineOf(sourceFile, node), reason: "A create toolbar may not append form lifecycle actions; the create item only opens the FormSurface." });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  const unique = new Map<string, Violation>();
  for (const violation of violations) unique.set(`${violation.file}:${violation.line}:${violation.reason}`, violation);
  return [...unique.values()];
}

function fileViolations(filePath: string): Violation[] {
  const source = fs.readFileSync(filePath, "utf8");
  const file = path.relative(ROOT, filePath).replace(/\\/g, "/");
  return findFormSurfaceActionViolationsInSource(file, source);
}

export function findFormSurfaceActionViolations() {
  const violations = sourceFiles().flatMap(fileViolations);
  if (ACTION_GLYPH_ACTION_BY_KEY.unarchive.icon !== "restore") {
    violations.push({ file: "packages/core/ui/internal/action/ActionGlyphs.tsx", line: 1, reason: "unarchive must resolve to the canonical restore glyph." });
  }
  const orderedActions = orderFormSurfaceActions([
    { key: "cancel", action: "cancel" },
    { key: "archive", action: "archive" },
    { key: "save", action: "save" },
    { key: "submit", action: "submit" },
    { key: "approve", action: "approve" },
    { key: "reject", action: "reject" },
    { key: "unarchive", action: "unarchive" },
  ]).map((item) => item.action);
  const expectedOrder = ["submit", "save", "approve", "reject", "cancel", "archive", "unarchive"];
  if (orderedActions.join(",") !== expectedOrder.join(",")) {
    violations.push({ file: "packages/core/ui/internal/form/form-surface-actions.tsx", line: 1, reason: `Canonical form action order changed: ${orderedActions.join(" -> ")}.` });
  }
  return violations.sort((left, right) => `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`));
}

export function checkFormSurfaceActions() {
  const violations = findFormSurfaceActionViolations();
  if (violations.length === 0) {
    console.log("✓ FormSurface action ownership guard passed.");
    return true;
  }
  console.error("✗ FormSurface action ownership guard failed.");
  for (const violation of violations) console.error(`  - ${violation.file}:${violation.line} ${violation.reason}`);
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkFormSurfaceActions() ? 0 : 1);
}
