import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "generated", "node_modules", "tmp"]);
const OLD_CREATE_RENDERERS = new Set([
  "BlockCreatePanel",
  "CreateConfirmActions",
  "CreatePanel",
  "CreatePresentationPanel",
  "CreateStartButton",
  "InlineCreatePanel",
]);
const CREATE_ENTRY_LABEL = /新建|新增|创建/;

export type CreateSurfaceEntryViolation = {
  file: string;
  line: number;
  kind: "legacy-create-renderer" | "manual-create-command" | "toolbar-create";
  detail: string;
};

function relative(file: string) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function walk(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (SOURCE_EXTENSIONS.test(entry.name)) files.push(full);
  }
  return files;
}

function sourceFiles() {
  const appFiles = walk(path.join(ROOT, "app"));
  const packagesDir = path.join(ROOT, "packages");
  const packageUiFiles = fs.readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "core")
    .flatMap((entry) => walk(path.join(packagesDir, entry.name, "ui")));
  return [...appFiles, ...packageUiFiles].filter((file) => !relative(file).includes("/__tests__/"));
}

function propertyName(name: ts.PropertyName | undefined) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function stringValues(expression: ts.Expression | undefined): string[] {
  if (!expression) return [];
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return [expression.text];
  if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression)) {
    return stringValues(expression.expression);
  }
  if (ts.isConditionalExpression(expression)) {
    return [...stringValues(expression.whenTrue), ...stringValues(expression.whenFalse)];
  }
  return [];
}

function objectValues(node: ts.ObjectLiteralExpression, key: string) {
  const property = node.properties.find((item): item is ts.PropertyAssignment =>
    ts.isPropertyAssignment(item) && propertyName(item.name) === key);
  return property ? stringValues(property.initializer) : [];
}

function hasProperty(node: ts.ObjectLiteralExpression, key: string) {
  return node.properties.some((item) =>
    (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item)) && propertyName(item.name) === key);
}

function isInsideProperty(node: ts.Node, key: string) {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isPropertyAssignment(current) && propertyName(current.name) === key) return true;
    if (ts.isObjectLiteralExpression(current)) return false;
    current = current.parent;
  }
  return false;
}

function line(source: ts.SourceFile, node: ts.Node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function scanFile(file: string): CreateSurfaceEntryViolation[] {
  const text = fs.readFileSync(file, "utf8");
  return findCreateSurfaceEntryViolationsInSource(relative(file), text);
}

export function findCreateSurfaceEntryViolationsInSource(fileName: string, text: string): CreateSurfaceEntryViolation[] {
  if (!text.includes("create") && !CREATE_ENTRY_LABEL.test(text) && ![...OLD_CREATE_RENDERERS].some((name) => text.includes(name))) return [];
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations: CreateSurfaceEntryViolation[] = [];
  const add = (node: ts.Node, kind: CreateSurfaceEntryViolation["kind"], detail: string) => {
    violations.push({ file: fileName, line: line(source, node), kind, detail });
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const imported = node.importClause?.namedBindings;
      if (imported && ts.isNamedImports(imported)) {
        for (const element of imported.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (OLD_CREATE_RENDERERS.has(importedName)) add(element, "legacy-create-renderer", importedName);
        }
      }
    }
    if (ts.isObjectLiteralExpression(node)) {
      if (isInsideProperty(node, "addAction")) {
        ts.forEachChild(node, visit);
        return;
      }
      const kinds = objectValues(node, "kind");
      const toolbarCreate = kinds.includes("create")
        && !hasProperty(node, "create")
        && hasProperty(node, "key")
        && hasProperty(node, "onClick");
      if (toolbarCreate) add(node, "toolbar-create", "kind=create");
      const labels = objectValues(node, "label").filter((label) => CREATE_ENTRY_LABEL.test(label));
      const icons = objectValues(node, "icon");
      const createIcon = [...icons, ...kinds].find((icon) => icon === "add" || icon === "create");
      if (!toolbarCreate && labels.length && createIcon) {
        add(node, "manual-create-command", `${labels.join(" / ")} (${createIcon})`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

export function findCreateSurfaceEntryViolations() {
  return sourceFiles().flatMap(scanFile).sort((left, right) =>
    left.file.localeCompare(right.file) || left.line - right.line || left.kind.localeCompare(right.kind));
}

export function checkCreateSurfaceEntries() {
  const safeRegression = findCreateSurfaceEntryViolationsInSource("safe-controls.tsx", `
    const controls = [
      { key: "expand", label: "展开", icon: "tree-expand" },
      { key: "collapse", label: "收起", icon: "tree-collapse" },
      { key: "increment", label: "增加", icon: "add" },
      { key: "decrement", label: "减少", icon: "delete-minus" },
      { kind: "create", create: { trigger: "toolbar", presentation: "inline" } },
      { kind: "create", agreementUid: "", employmentId: null },
    ];
  `);
  if (safeRegression.length) {
    console.error("✗ CreateSurface entry gate regression: fold/disclosure/numeric controls were misclassified.");
    return false;
  }
  const violations = findCreateSurfaceEntryViolations();
  if (!violations.length) {
    console.log("✓ CreateSurface entry gate passed: no manual business create entry remains.");
    return true;
  }
  console.error(`✗ CreateSurface entry gate: ${violations.length} manual create entr${violations.length === 1 ? "y" : "ies"} found.`);
  console.error("  Standard create entry must be declared through BodySurface kind=create / CreateSurface.");
  console.error("  Fold, tree expand/collapse, disclosure, and numeric +/- controls are not scanned by this rule.");
  for (const violation of violations) {
    console.error(`  - ${violation.file}:${violation.line} [${violation.kind}] ${violation.detail}`);
  }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkCreateSurfaceEntries() ? 0 : 1);
}
