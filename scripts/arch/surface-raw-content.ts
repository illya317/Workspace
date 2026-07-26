import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { REVIEWED_UI_SPECIALIZED_SURFACE_FILES } from "./ui-specialized-surface-registry";

const ROOT = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(ROOT, ".cache/arch/surface-raw-content.json");
const SOURCE_EXTENSIONS = /\.(tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "node_modules", "tmp"]);

type SurfaceRawContentKind =
  | "data-cell-callback"
  | "expanded-row-content"
  | "selector-render-item"
  | "selector-render-option"
  | "surface-content-jsx"
  | "specialized-surface-declaration";

type SurfaceRawContentUsage = {
  file: string;
  line: number;
  kind: SurfaceRawContentKind;
  detail: string;
};

function toRelative(filePath: string) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function walk(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (SOURCE_EXTENSIONS.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function sourceFiles() {
  const appFiles = walk(path.join(ROOT, "app"));
  const packagesDir = path.join(ROOT, "packages");
  const packageUiFiles = fs.existsSync(packagesDir)
    ? fs.readdirSync(packagesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .flatMap((entry) => walk(path.join(packagesDir, entry.name, "ui")))
    : [];
  const platformDocumentEditorFiles = walk(path.join(packagesDir, "platform/document-editor"));
  return [...appFiles, ...packageUiFiles, ...platformDocumentEditorFiles].filter((filePath) => {
    const rel = toRelative(filePath);
    if (rel.startsWith("packages/core/")) return false;
    if (rel.includes("/__tests__/") || rel.endsWith(".test.tsx")) return false;
    return true;
  });
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

function nodeLine(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function containsJsx(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node) => {
    if (found) return;
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function callbackReturnDetail(expression: ts.Expression, sourceFile: ts.SourceFile) {
  const unwrapped = unwrapExpression(expression);
  if (!ts.isArrowFunction(unwrapped) && !ts.isFunctionExpression(unwrapped)) return "non-function";
  if (containsJsx(unwrapped.body)) return "jsx-return";
  const text = unwrapped.body.getText(sourceFile);
  if (text.includes("kind:")) return "structured-return";
  return "value-return";
}

function usageKey(usage: SurfaceRawContentUsage) {
  return `${usage.kind}: ${usage.file}:${usage.line}: ${usage.detail}`;
}

function hasSpecializedSurfaceAnnotation(node: ts.Node, sourceFile: ts.SourceFile, file: string) {
  if (!REVIEWED_UI_SPECIALIZED_SURFACE_FILES.has(file)) return false;
  let current: ts.Node | undefined = node;
  while (current) {
    const leading = sourceFile.text.slice(current.getFullStart(), current.getStart(sourceFile));
    if (/@ui-specialized-surface\b/.test(leading)) return true;
    current = current.parent;
  }
  return false;
}

function scanFile(filePath: string): SurfaceRawContentUsage[] {
  const text = fs.readFileSync(filePath, "utf8");
  if (
    !text.includes("content") &&
    !text.includes("cell") &&
    !text.includes("expandedRowContent") &&
    !text.includes("renderItem") &&
    !text.includes("renderOption") &&
    !text.includes("@ui-specialized-surface")
  ) {
    return [];
  }
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const file = toRelative(filePath);
  const usages: SurfaceRawContentUsage[] = [];

  if (text.includes("@ui-specialized-surface") && !REVIEWED_UI_SPECIALIZED_SURFACE_FILES.has(file)) {
    usages.push({ file, line: 1, kind: "specialized-surface-declaration", detail: "not-allowed-outside-reviewed-platform-surface" });
  }

  const add = (node: ts.Node, kind: SurfaceRawContentKind, detail: string) => {
    if (hasSpecializedSurfaceAnnotation(node, sourceFile, file)) return;
    usages.push({ file, line: nodeLine(sourceFile, node), kind, detail });
  };

  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = objectPropertyName(node.name);
      if (name === "content" && containsJsx(node.initializer)) {
        add(node, "surface-content-jsx", "jsx-content");
      } else if (name === "cell") {
        add(node, "data-cell-callback", callbackReturnDetail(node.initializer, sourceFile));
      } else if (name === "expandedRowContent") {
        add(node, "expanded-row-content", callbackReturnDetail(node.initializer, sourceFile));
      } else if (name === "renderItem") {
        add(node, "selector-render-item", callbackReturnDetail(node.initializer, sourceFile));
      } else if (name === "renderOption") {
        add(node, "selector-render-option", callbackReturnDetail(node.initializer, sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return usages;
}

export function findSurfaceRawContentUsages() {
  return sourceFiles()
    .flatMap(scanFile)
    .filter((usage) => usage.kind !== "data-cell-callback" || usage.detail === "jsx-return" || usage.detail === "non-function")
    .sort((left, right) => usageKey(left).localeCompare(usageKey(right)));
}

export function createSurfaceRawContentReport() {
  const usages = findSurfaceRawContentUsages();
  const byKind = new Map<SurfaceRawContentKind, number>();
  const byFile = new Map<string, number>();
  for (const usage of usages) {
    byKind.set(usage.kind, (byKind.get(usage.kind) ?? 0) + 1);
    byFile.set(usage.file, (byFile.get(usage.file) ?? 0) + 1);
  }
  return {
    total: usages.length,
    byKind: [...byKind.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    byFile: [...byFile.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    usages,
  };
}

export function checkSurfaceRawContentWarnings() {
  const report = createSurfaceRawContentReport();

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(`${REPORT_PATH}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(`${REPORT_PATH}.tmp`, REPORT_PATH);

  if (!report.total) {
    console.log("✓ Surface raw content gate: no unapproved business raw/custom content usages detected.");
    return true;
  }

  console.error(`✗ Surface raw content gate: ${report.total} unapproved usage(s) detected.`);
  console.error("  Migrate to structured Core specs or obtain a reviewed @ui-specialized-surface declaration.");
  console.warn(`  Full report: ${toRelative(REPORT_PATH)}`);
  console.warn("  By kind:");
  for (const [kind, count] of report.byKind) console.warn(`    ${kind}: ${count}`);
  console.warn("  Top files:");
  for (const [file, count] of report.byFile.slice(0, 12)) console.warn(`    ${file}: ${count}`);

  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkSurfaceRawContentWarnings() ? 0 : 1);
}
