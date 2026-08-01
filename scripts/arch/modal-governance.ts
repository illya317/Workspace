import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "scripts/arch/modal-governance-baseline.json");
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "generated", "node_modules", "tmp"]);
const ALLOWED_PURPOSES = new Set(["audit-history", "read-only-inspection", "workflow-action"]);

type ModalGovernanceBaseline = {
  legacyUnclassifiedBodyModals: string[];
};

export type ModalGovernanceViolation = {
  file: string;
  line: number;
  kind: "create-surface-modal" | "invalid-modal-purpose" | "unclassified-body-modal";
  key: string;
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

function property(node: ts.ObjectLiteralExpression, key: string) {
  return node.properties.find((item): item is ts.PropertyAssignment =>
    ts.isPropertyAssignment(item) && propertyName(item.name) === key);
}

function stringValue(expression: ts.Expression | undefined): string | null {
  if (!expression) return null;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression)) {
    return stringValue(expression.expression);
  }
  return null;
}

function hasProperties(node: ts.ObjectLiteralExpression, keys: string[]) {
  return keys.every((key) => node.properties.some((item) =>
    (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item)) && propertyName(item.name) === key));
}

function hasExplicitModalTypeContext(node: ts.Node, source: ts.SourceFile) {
  let current: ts.Node | undefined = node;
  while (current && !ts.isSourceFile(current)) {
    if (
      (ts.isAsExpression(current) || ts.isSatisfiesExpression(current))
      && current.type.getText(source).includes("BodySurfaceModalSpec")
    ) {
      return true;
    }
    if (ts.isVariableDeclaration(current) && current.type?.getText(source).includes("BodySurfaceModalSpec")) {
      return true;
    }
    if (
      ts.isFunctionDeclaration(current)
      || ts.isFunctionExpression(current)
      || ts.isArrowFunction(current)
      || ts.isMethodDeclaration(current)
    ) {
      return current.type?.getText(source).includes("BodySurfaceModalSpec") ?? false;
    }
    current = current.parent;
  }
  return false;
}

function isRawBodyModal(node: ts.ObjectLiteralExpression, source: ts.SourceFile) {
  return hasProperties(node, ["key", "open", "title", "onClose", "sections"])
    && hasExplicitModalTypeContext(node, source);
}

function modalPurposeViolation(
  fileName: string,
  source: ts.SourceFile,
  node: ts.ObjectLiteralExpression,
  key: string,
): ModalGovernanceViolation | null {
  const purpose = stringValue(property(node, "purpose")?.initializer);
  const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  if (!purpose) {
    return {
      file: fileName,
      line,
      kind: "unclassified-body-modal",
      key: `${fileName}#${key}`,
      detail: "BodySurface modal must declare an approved purpose or remain in the exact migration baseline",
    };
  }
  if (!ALLOWED_PURPOSES.has(purpose)) {
    return {
      file: fileName,
      line,
      kind: "invalid-modal-purpose",
      key: `${fileName}#${key}`,
      detail: `unsupported purpose=${purpose}`,
    };
  }
  return null;
}

export function findModalGovernanceViolationsInSource(fileName: string, text: string): ModalGovernanceViolation[] {
  if (!text.includes("modal") && !text.includes("Modal")) return [];
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: ModalGovernanceViolation[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const presentation = stringValue(property(node, "presentation")?.initializer);
      if (presentation === "modal") {
        const id = stringValue(property(node, "id")?.initializer) ?? `line-${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
        violations.push({
          file: fileName,
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          kind: "create-surface-modal",
          key: `${fileName}#${id}`,
          detail: "CreateSurface supports inline/block only",
        });
      }
      if (isRawBodyModal(node, source)) {
        const key = stringValue(property(node, "key")?.initializer) ?? `line-${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
        const violation = modalPurposeViolation(fileName, source, node, key);
        if (violation) violations.push(violation);
      }
    }
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "createPageModalSection"
      && node.arguments.length >= 2
      && ts.isObjectLiteralExpression(node.arguments[1])
    ) {
      const key = stringValue(node.arguments[0]) ?? `line-${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
      const violation = modalPurposeViolation(fileName, source, node.arguments[1], key);
      if (violation) violations.push(violation);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

export function findModalGovernanceViolations() {
  return sourceFiles().flatMap((file) =>
    findModalGovernanceViolationsInSource(relative(file), fs.readFileSync(file, "utf8")))
    .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.kind.localeCompare(right.kind));
}

function uniqueSorted(items: string[]) {
  return [...new Set(items)].sort();
}

function difference(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

export function compareModalBaseline(current: string[], baseline: string[]) {
  const normalizedCurrent = uniqueSorted(current);
  const normalizedBaseline = uniqueSorted(baseline);
  return {
    additions: difference(normalizedCurrent, normalizedBaseline),
    stale: difference(normalizedBaseline, normalizedCurrent),
  };
}

export function checkModalGovernance() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as ModalGovernanceBaseline;
  const violations = findModalGovernanceViolations();
  const hardFailures = violations.filter((violation) => violation.kind !== "unclassified-body-modal");
  const legacy = violations
    .filter((violation) => violation.kind === "unclassified-body-modal")
    .map((violation) => violation.key);
  const { additions, stale } = compareModalBaseline(legacy, baseline.legacyUnclassifiedBodyModals);

  if (!hardFailures.length && !additions.length && !stale.length) {
    console.log(`✓ Modal governance passed: ${legacy.length} exact legacy item(s), no CreateSurface modal declarations.`);
    return true;
  }

  console.error("✗ Modal governance failed.");
  for (const violation of hardFailures) {
    console.error(`  - ${violation.file}:${violation.line} [${violation.kind}] ${violation.detail}`);
  }
  if (additions.length) {
    console.error("  New unclassified business modal(s) are not allowed:");
    for (const item of additions) console.error(`  + ${item}`);
  }
  if (stale.length) {
    console.error("  Remove migrated modal(s) from scripts/arch/modal-governance-baseline.json:");
    for (const item of stale) console.error(`  - ${item}`);
  }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkModalGovernance() ? 0 : 1);
}
