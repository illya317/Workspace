import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const PACKAGES_ROOT = path.join(ROOT, "packages");
const APP_ROOT = path.join(ROOT, "app");
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const EXCLUDED_FILES = new Set([
  "packages/platform/ui/workflow/action-runtime-commands.ts",
]);
const LEGACY_WORKFLOW_BOOLEAN_NAMES = new Set([
  "workflowEnabled",
  "canSubmitWorkflow",
  "canSubmitDepartmentWorkflow",
]);

export type ActionRuntimeUiViolation = {
  file: string;
  line: number;
  kind:
    | "conditional-save-submit"
    | "hardcoded-create-submit"
    | "hardcoded-submit-action"
    | "legacy-workflow-boolean"
    | "parallel-persistence-actions";
  detail: string;
};

function relative(file: string) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function businessUiRoots() {
  const packageRoots = fs.readdirSync(PACKAGES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "core")
    .map((entry) => path.join(PACKAGES_ROOT, entry.name, "ui"))
    .filter((dir) => fs.existsSync(dir));
  return [...packageRoots, APP_ROOT];
}

function walk(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && SOURCE_EXTENSIONS.test(entry.name)) files.push(full);
  }
  return files;
}

function propertyName(name: ts.PropertyName | undefined) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function stringValue(node: ts.Expression) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return stringValue(node.expression);
  }
  return null;
}

function objectStringValue(node: ts.ObjectLiteralExpression, key: string) {
  const property = node.properties.find((item): item is ts.PropertyAssignment =>
    ts.isPropertyAssignment(item) && propertyName(item.name) === key);
  return property ? stringValue(property.initializer) : null;
}

function isInsideProperty(node: ts.Node, key: string) {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isPropertyAssignment(current) && propertyName(current.name) === key) return true;
    current = current.parent;
  }
  return false;
}

function isLabelContext(node: ts.Node) {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isPropertyAssignment(current) && propertyName(current.name) === "label") return true;
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return /label$/i.test(current.name.text);
    }
    current = current.parent;
  }
  return false;
}

function persistenceMeaning(value: string | null) {
  if (!value) return null;
  const save = value === "save" || value.includes("保存");
  const submit = value === "submit" || value.includes("提交");
  if (save === submit) return null;
  return save ? "save" : "submit";
}

function hasParallelPersistenceActions(node: ts.ArrayLiteralExpression) {
  const actions = new Set(node.elements.flatMap((element) => {
    if (!ts.isObjectLiteralExpression(element)) return [];
    const value = objectStringValue(element, "action") ?? objectStringValue(element, "kind");
    const meaning = persistenceMeaning(value);
    return meaning ? [meaning] : [];
  }));
  return actions.has("save") && actions.has("submit");
}

export function findActionRuntimeUiViolationsInSource(fileName: string, text: string) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: ActionRuntimeUiViolation[] = [];
  let legacyWorkflowBooleanReported = false;
  const add = (node: ts.Node, kind: ActionRuntimeUiViolation["kind"], detail: string) => {
    violations.push({
      file: fileName,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      kind,
      detail,
    });
  };
  const visit = (node: ts.Node) => {
    if (!legacyWorkflowBooleanReported
      && ts.isIdentifier(node)
      && LEGACY_WORKFLOW_BOOLEAN_NAMES.has(node.text)) {
      legacyWorkflowBooleanReported = true;
      add(node, "legacy-workflow-boolean", "页面不得用 workflowEnabled/canSubmitWorkflow 猜测保存或提交");
    }
    if (ts.isConditionalExpression(node)) {
      const branchValues = [stringValue(node.whenTrue), stringValue(node.whenFalse)];
      const meanings = new Set([
        persistenceMeaning(branchValues[0]),
        persistenceMeaning(branchValues[1]),
      ]);
      const isActionPair = meanings.has("save") && meanings.has("submit");
      const exactActionPair = branchValues.includes("save") && branchValues.includes("submit");
      if (isActionPair && (exactActionPair || isLabelContext(node))) {
        add(node, "conditional-save-submit", "保存/提交不得由页面条件表达式决定");
      }
    }
    if (ts.isObjectLiteralExpression(node)
      && isInsideProperty(node, "submission")
      && objectStringValue(node, "action") === "submit") {
      add(node, "hardcoded-create-submit", "CreateSurface 提交动作必须来自 actionRuntimeCreateSubmission");
    }
    if (ts.isJsxAttribute(node)
      && node.name.getText(source) === "submitAction"
      && node.initializer
      && ts.isStringLiteral(node.initializer)
      && node.initializer.text === "submit") {
      add(node, "hardcoded-submit-action", "新建入口不得绕过 CreateSurface 和 ActionRuntime 硬编码提交");
    }
    if (ts.isArrayLiteralExpression(node) && hasParallelPersistenceActions(node)) {
      add(node, "parallel-persistence-actions", "同一动作区不得同时暴露保存和提交");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

export function findActionRuntimeUiViolations() {
  return businessUiRoots()
    .flatMap((root) => walk(root))
    .filter((file) => !EXCLUDED_FILES.has(relative(file)))
    .flatMap((file) => findActionRuntimeUiViolationsInSource(relative(file), fs.readFileSync(file, "utf8")));
}

export function checkActionRuntimeUi() {
  const safe = findActionRuntimeUiViolationsInSource("safe.tsx", `
    const create = { submission: actionRuntimeCreateSubmission(runtime, options) };
    const review = { actions: [{ action: "submit", label: "提交目标审查" }] };
    const outcome = runtime.executionMode === "workflow" ? "已提交" : "已保存";
  `);
  const unsafe = findActionRuntimeUiViolationsInSource("unsafe.tsx", `
    const workflowEnabled = true;
    const create = { submission: { action: canSubmit ? "submit" : "save", execute } };
    const forced = { submission: { action: "submit", execute } };
    const actions = [{ action: "save" }, { action: "submit" }];
    const panel = <InlineCreatePanel submitAction="submit" />;
  `);
  if (safe.length || unsafe.length !== 5) {
    console.error("✗ Project action runtime UI gate regression.");
    return false;
  }
  const violations = findActionRuntimeUiViolations();
  if (!violations.length) {
    console.log("✓ Project action runtime UI gate passed: Save/Submit is owned by ActionRuntime.");
    return true;
  }
  console.error(`✗ Project action runtime UI gate: ${violations.length} bypass(es) found.`);
  console.error("  Entry controls only open local edit state; ActionRuntime must choose Save or Submit.");
  for (const violation of violations) {
    console.error(`  - ${violation.file}:${violation.line} [${violation.kind}] ${violation.detail}`);
  }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkActionRuntimeUi() ? 0 : 1);
}
