import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const BASELINE_PATH = path.join(ROOT, "scripts/arch/ui-helper-purity-baseline.json");
const REPORT_PATH = path.join(ROOT, ".cache/arch/ui-helper-purity.json");
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "generated", "node_modules", "tmp"]);

type UiHelperPuritySignalKind =
  | "flow-side-effect"
  | "jsx-output"
  | "state-decision"
  | "ui-structure"
  | "visible-copy";

type UiHelperPuritySignal = {
  file: string;
  helperName: string;
  line: number;
  kind: UiHelperPuritySignalKind;
  detail: string;
};

type UiHelperPurityBaseline = {
  uiHelperPurityWarnings: string[];
};

const HELPER_NAME_PATTERN = /^(create|build|make|get|map|to)[A-Z0-9_]/;
const CHINESE_TEXT_PATTERN = /[\u3400-\u9fff]/;
const VISIBLE_PROP_NAMES = new Set([
  "ariaLabel",
  "cancelLabel",
  "confirmLabel",
  "content",
  "description",
  "emptyText",
  "errorText",
  "label",
  "loadingText",
  "message",
  "placeholder",
  "saveErrorText",
  "saveSuccessText",
  "subtitle",
  "summary",
  "title",
]);
const UI_STRUCTURE_CALLS = new Set([
  "createActionsSection",
  "createBodySplitSection",
  "createEmptySection",
  "createFieldsSection",
  "createFormSection",
  "createHeadingSection",
  "createInlineFieldsSection",
  "createListSection",
  "createMessageSection",
  "createMetricsSection",
  "createModuleGridSection",
  "createPageBody",
  "createPageDataSection",
  "createPageModalSection",
  "createPageSurfaceProps",
  "createPageTableSection",
  "createPageTabsNavigation",
  "createPanelSection",
  "createRecordSection",
  "createSectionSection",
  "createSectionsSection",
  "createSelectorPanelSection",
  "createSpaceKindNavigation",
  "createSpaceWorkbenchBody",
  "createStatusSection",
  "createTabbedPageBody",
  "createVisualizationSection",
]);
const FLOW_SIDE_EFFECT_CALLS = new Set([
  "fetch",
  "notify",
  "showToast",
  "toast",
  "confirm",
  "confirmDelete",
  "push",
  "replace",
  "pushState",
  "replaceState",
  "setItem",
  "removeItem",
]);
const STATE_DECISION_IDENTIFIERS = new Set([
  "canCreate",
  "canDelete",
  "canEdit",
  "canManage",
  "canSave",
  "disabled",
  "enabled",
  "loading",
  "permission",
  "permissions",
  "role",
  "saving",
  "status",
]);

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
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "core")
      .flatMap((entry) => walk(path.join(packagesDir, entry.name, "ui")))
    : [];
  return [...appFiles, ...packageUiFiles].filter((filePath) => {
    const rel = toRelative(filePath);
    if (rel.includes("/__tests__/") || rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) return false;
    return true;
  });
}

function nodeLine(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function propertyName(name: ts.PropertyName | ts.BindingName | undefined) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression)) return unwrapExpression(expression.expression);
  if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) return unwrapExpression(expression.expression);
  return expression;
}

function callName(expression: ts.Expression) {
  const unwrapped = unwrapExpression(expression);
  if (ts.isIdentifier(unwrapped)) return unwrapped.text;
  if (ts.isPropertyAccessExpression(unwrapped)) return unwrapped.name.text;
  return undefined;
}

function containsChineseVisibleText(node: ts.Node, sourceFile: ts.SourceFile) {
  return CHINESE_TEXT_PATTERN.test(node.getText(sourceFile));
}

function isHelperName(name: string | undefined) {
  return Boolean(name && HELPER_NAME_PATTERN.test(name));
}

function jsxName(name: ts.JsxTagNameExpression) {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isPropertyAccessExpression(name)) return name.name.text;
  return "jsx";
}

function signalKeyPrefix(signal: UiHelperPuritySignal) {
  return `${signal.file}: ${signal.helperName}: ${signal.kind}: ${signal.detail}`;
}

function signalBaselineKeys(signals: UiHelperPuritySignal[]) {
  const counts = new Map<string, number>();
  return signals
    .sort((left, right) => signalKeyPrefix(left).localeCompare(signalKeyPrefix(right)))
    .map((signal) => {
      const base = signalKeyPrefix(signal);
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

function readBaseline(): UiHelperPurityBaseline {
  if (!fs.existsSync(BASELINE_PATH)) return { uiHelperPurityWarnings: [] };
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as UiHelperPurityBaseline;
}

function scanHelperBody(sourceFile: ts.SourceFile, file: string, helperName: string, body: ts.Node) {
  const signals: UiHelperPuritySignal[] = [];
  let sawStateDecision = false;
  let sawUiOutput = false;

  const add = (node: ts.Node, kind: UiHelperPuritySignalKind, detail: string) => {
    signals.push({ file, helperName, line: nodeLine(sourceFile, node), kind, detail });
    if (kind === "jsx-output" || kind === "ui-structure" || kind === "visible-copy") sawUiOutput = true;
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      add(node, "jsx-output", jsxName(node.openingElement.tagName));
    } else if (ts.isJsxSelfClosingElement(node)) {
      add(node, "jsx-output", jsxName(node.tagName));
    } else if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      if (name && UI_STRUCTURE_CALLS.has(name)) add(node, "ui-structure", name);
      if (name && (FLOW_SIDE_EFFECT_CALLS.has(name) || /^set[A-Z]/.test(name))) add(node, "flow-side-effect", name);
    } else if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name && VISIBLE_PROP_NAMES.has(name) && containsChineseVisibleText(node.initializer, sourceFile)) {
        add(node, "visible-copy", name);
      }
    } else if (ts.isBindingElement(node)) {
      const name = propertyName(node.propertyName ?? node.name);
      if (name && VISIBLE_PROP_NAMES.has(name) && node.initializer && containsChineseVisibleText(node.initializer, sourceFile)) {
        add(node, "visible-copy", `${name}=default`);
      }
    } else if (ts.isIdentifier(node) && STATE_DECISION_IDENTIFIERS.has(node.text)) {
      sawStateDecision = true;
    }
    ts.forEachChild(node, visit);
  };

  visit(body);
  if (sawStateDecision && sawUiOutput) {
    signals.push({ file, helperName, line: nodeLine(sourceFile, body), kind: "state-decision", detail: "state-or-permission-driven-ui" });
  }
  return signals;
}

function scanFile(filePath: string): UiHelperPuritySignal[] {
  const text = fs.readFileSync(filePath, "utf8");
  if (!/(function|=>|create|build|make|get|map|to)/.test(text)) return [];
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const file = toRelative(filePath);
  const signals: UiHelperPuritySignal[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && isHelperName(node.name?.text) && node.body) {
      signals.push(...scanHelperBody(sourceFile, file, node.name!.text, node.body));
    }
    if (ts.isVariableDeclaration(node) && isHelperName(propertyName(node.name)) && node.initializer) {
      const initializer = unwrapExpression(node.initializer);
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        signals.push(...scanHelperBody(sourceFile, file, propertyName(node.name)!, initializer.body));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return signals;
}

export function findUiHelperPurityWarnings() {
  return sourceFiles()
    .flatMap(scanFile)
    .sort((left, right) => `${left.file}:${left.helperName}:${left.line}:${left.kind}:${left.detail}`.localeCompare(`${right.file}:${right.helperName}:${right.line}:${right.kind}:${right.detail}`));
}

export function createUiHelperPurityReport() {
  const warnings = findUiHelperPurityWarnings();
  const byKind = new Map<UiHelperPuritySignalKind, number>();
  const byFile = new Map<string, number>();
  for (const warning of warnings) {
    byKind.set(warning.kind, (byKind.get(warning.kind) ?? 0) + 1);
    byFile.set(warning.file, (byFile.get(warning.file) ?? 0) + 1);
  }
  return {
    total: warnings.length,
    byKind: [...byKind.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    byFile: [...byFile.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    warnings,
  };
}

export function checkUiHelperPurityWarnings() {
  const report = createUiHelperPurityReport();
  const current = uniqueSorted(signalBaselineKeys(report.warnings));
  const baseline = uniqueSorted(readBaseline().uiHelperPurityWarnings);
  const additions = diff(current, baseline);
  const stale = diff(baseline, current);

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(`${REPORT_PATH}.tmp`, `${JSON.stringify({ ...report, additions, stale }, null, 2)}\n`);
  fs.renameSync(`${REPORT_PATH}.tmp`, REPORT_PATH);

  if (!current.length) {
    console.log("✓ UI helper purity ratchet: no UI/flow-owning helpers detected outside Core UI.");
    return true;
  }

  console.warn(`⚠ UI helper purity warning-only: ${current.length} baseline helper signal(s) detected.`);
  console.warn("  Rule: business/platform helpers may transform data, but must not own visible UI, page chrome, flow side effects, or permission-driven UI decisions.");
  console.warn(`  Full report: ${toRelative(REPORT_PATH)}`);
  if (additions.length) {
    console.warn(`  New unbaselined helper signal(s): ${additions.length}`);
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

function writeBaseline() {
  const report = createUiHelperPurityReport();
  const baseline = { uiHelperPurityWarnings: uniqueSorted(signalBaselineKeys(report.warnings)) };
  fs.writeFileSync(`${BASELINE_PATH}.tmp`, `${JSON.stringify(baseline, null, 2)}\n`);
  fs.renameSync(`${BASELINE_PATH}.tmp`, BASELINE_PATH);
  console.log(`Wrote ${baseline.uiHelperPurityWarnings.length} UI helper purity baseline item(s) to ${toRelative(BASELINE_PATH)}.`);
}

if (process.argv.includes("--print-baseline")) {
  const report = createUiHelperPurityReport();
  process.stdout.write(`${JSON.stringify({ uiHelperPurityWarnings: uniqueSorted(signalBaselineKeys(report.warnings)) }, null, 2)}\n`);
} else if (process.argv.includes("--update-baseline")) {
  writeBaseline();
} else if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkUiHelperPurityWarnings() ? 0 : 1);
}
