import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "scripts/arch/surface-raw-content-baseline.json");
const REPORT_PATH = path.join(ROOT, ".cache/arch/surface-raw-content.json");
const SOURCE_EXTENSIONS = /\.(tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "node_modules", "tmp"]);

type SurfaceRawContentKind =
  | "data-cell-callback"
  | "expanded-row-content"
  | "selector-render-item"
  | "selector-render-option"
  | "surface-content-jsx";

type SurfaceRawContentUsage = {
  file: string;
  line: number;
  kind: SurfaceRawContentKind;
  detail: string;
};

type SurfaceRawContentBaseline = {
  surfaceRawContentUsages: string[];
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
  return [...appFiles, ...packageUiFiles].filter((filePath) => {
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
  return "callback";
}

function usageKey(usage: SurfaceRawContentUsage) {
  return `${usage.kind}: ${usage.file}:${usage.line}: ${usage.detail}`;
}

function usageBaselineKeys(usages: SurfaceRawContentUsage[]) {
  const counts = new Map<string, number>();
  return usages
    .sort((left, right) => usageKey(left).localeCompare(usageKey(right)))
    .map((usage) => {
      const base = `${usage.kind}: ${usage.file}: ${usage.detail}`;
      const occurrence = (counts.get(base) ?? 0) + 1;
      counts.set(base, occurrence);
      return `${base}#${occurrence}`;
    });
}

function uniqueSorted(items: string[]) {
  return [...new Set(items)].sort();
}

function diff(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function readBaseline(): SurfaceRawContentBaseline {
  if (!fs.existsSync(BASELINE_PATH)) return { surfaceRawContentUsages: [] };
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as SurfaceRawContentBaseline;
}

function scanFile(filePath: string): SurfaceRawContentUsage[] {
  const text = fs.readFileSync(filePath, "utf8");
  if (
    !text.includes("content") &&
    !text.includes("cell") &&
    !text.includes("expandedRowContent") &&
    !text.includes("renderItem") &&
    !text.includes("renderOption")
  ) {
    return [];
  }
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const file = toRelative(filePath);
  const usages: SurfaceRawContentUsage[] = [];

  const add = (node: ts.Node, kind: SurfaceRawContentKind, detail: string) => {
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
  const current = uniqueSorted(usageBaselineKeys(report.usages));
  const baseline = uniqueSorted(readBaseline().surfaceRawContentUsages);
  const additions = diff(current, baseline);
  const stale = diff(baseline, current);

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(`${REPORT_PATH}.tmp`, `${JSON.stringify({ ...report, additions, stale }, null, 2)}\n`);
  fs.renameSync(`${REPORT_PATH}.tmp`, REPORT_PATH);

  if (!current.length) {
    console.log("✓ Surface raw content ratchet: no business raw/custom content surface usages detected.");
    return true;
  }

  console.warn(`⚠ Surface raw content warning-only: ${current.length} baseline usage(s) detected.`);
  console.warn("  These are Surface escape hatches to migrate to structured Core specs.");
  console.warn(`  Full report: ${toRelative(REPORT_PATH)}`);
  if (additions.length) {
    console.warn(`  New unbaselined usage(s): ${additions.length}`);
    for (const item of additions.slice(0, 30)) console.warn(`    + ${item}`);
    if (additions.length > 30) console.warn(`    ... ${additions.length - 30} more`);
  }
  if (stale.length) {
    console.warn(`  Stale baseline item(s): ${stale.length}`);
    console.warn(`  Remove migrated items from ${toRelative(BASELINE_PATH)}.`);
    for (const item of stale.slice(0, 30)) console.warn(`    - ${item}`);
    if (stale.length > 30) console.warn(`    ... ${stale.length - 30} more`);
  }
  console.warn("  By kind:");
  for (const [kind, count] of report.byKind) console.warn(`    ${kind}: ${count}`);
  console.warn("  Top files:");
  for (const [file, count] of report.byFile.slice(0, 12)) console.warn(`    ${file}: ${count}`);

  return additions.length === 0 && stale.length === 0;
}

if (process.argv.includes("--print-baseline")) {
  const report = createSurfaceRawContentReport();
  process.stdout.write(`${JSON.stringify({ surfaceRawContentUsages: uniqueSorted(usageBaselineKeys(report.usages)) }, null, 2)}\n`);
} else if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkSurfaceRawContentWarnings() ? 0 : 1);
}
