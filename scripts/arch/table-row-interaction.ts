import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const PACKAGES_ROOT = path.join(ROOT, "packages");
const APP_ROOT = path.join(ROOT, "app");
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;

export type TableRowInteractionViolation = {
  file: string;
  line: number;
  kind: "expanded-form-without-row-open" | "expanded-form-edit-trigger";
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

function property(node: ts.ObjectLiteralExpression, key: string) {
  return node.properties.find((item): item is ts.PropertyAssignment =>
    ts.isPropertyAssignment(item) && propertyName(item.name) === key);
}

function stringValue(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return stringValue(node.expression);
  }
  return null;
}

function containsStringProperty(node: ts.Node, key: string, value: string) {
  let found = false;
  const visit = (candidate: ts.Node) => {
    if (found) return;
    if (ts.isPropertyAssignment(candidate)
      && propertyName(candidate.name) === key
      && stringValue(candidate.initializer) === value) {
      found = true;
      return;
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

export function findTableRowInteractionViolationsInSource(fileName: string, text: string) {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: TableRowInteractionViolation[] = [];
  const add = (
    node: ts.Node,
    kind: TableRowInteractionViolation["kind"],
    detail: string,
  ) => {
    violations.push({
      file: fileName,
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      kind,
      detail,
    });
  };
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const expandedRow = property(node, "expandedRow");
      if (expandedRow && containsStringProperty(expandedRow.initializer, "kind", "form")) {
        if (!property(node, "onRowClick")) {
          add(
            expandedRow,
            "expanded-form-without-row-open",
            "表格展开表单必须由 onRowClick 打开，保持与 HR/Work 的整行打开 contract 一致",
          );
        }
        const rowActions = property(node, "rowActions");
        if (rowActions && containsStringProperty(rowActions.initializer, "kind", "edit")) {
          add(
            rowActions,
            "expanded-form-edit-trigger",
            "展开表单不得再用 edit 行动作充当打开入口；操作列只保留保存、归档、删除等直接动作",
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

export function findTableRowInteractionViolations() {
  return businessUiRoots()
    .flatMap((root) => walk(root))
    .flatMap((file) => findTableRowInteractionViolationsInSource(relative(file), fs.readFileSync(file, "utf8")));
}

export function checkTableRowInteraction() {
  const safe = findTableRowInteractionViolationsInSource("safe.tsx", `
    const table = {
      onRowClick: (row) => open(row),
      expandedRow: (row) => ({ kind: "form", form: buildForm(row) }),
      rowActions: (row) => [{ kind: "archive", onClick: () => archive(row) }],
    };
  `);
  const unsafe = findTableRowInteractionViolationsInSource("unsafe.tsx", `
    const table = {
      expandedRow: (row) => ({ kind: "form", form: buildForm(row) }),
      rowActions: (row) => [{ kind: "edit", onClick: () => open(row) }],
    };
  `);
  if (safe.length || unsafe.length !== 2) {
    console.error("✗ Project table row interaction gate regression.");
    return false;
  }
  const violations = findTableRowInteractionViolations();
  if (!violations.length) {
    console.log("✓ Project table row interaction gate passed: expanded editors open from the row contract.");
    return true;
  }
  console.error(`✗ Project table row interaction gate: ${violations.length} bypass(es) found.`);
  for (const violation of violations) {
    console.error(`  - ${violation.file}:${violation.line} [${violation.kind}] ${violation.detail}`);
  }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkTableRowInteraction() ? 0 : 1);
}
