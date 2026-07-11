import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { REVIEWED_UI_SPECIALIZED_SURFACE_FILES } from "./ui-specialized-surface-registry";

const ROOT = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(ROOT, ".cache/arch/ui-helper-purity.json");
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "generated", "node_modules", "tmp"]);

type UiHelperPuritySignalKind =
  | "fine-grained-declaration"
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

const HELPER_NAME_PATTERN = /^(create|build|declare|make|get|map|to)[A-Z0-9_]/;
const STRUCTURAL_DECLARATION_RETURN = /(?:\b(?:BodySurface|DataSurface|FormSurface|NavigationSurface|PageSurface|SelectorSurface|SurfaceToolbar|VisualizationSurface)\w*(?:Props|Spec|Items?)(?:<[^>]+>)?(?:\[\])?|\b\w*Surface\w*(?:Props|Spec)(?:<[^>]+>)?)/;
const FINE_GRAINED_DECLARATION_RETURN = /^\s*(?:DataSurfaceCellSpec|DataSurfaceDisplaySpec|FormSurfaceFieldSpec|FormSurfaceItemSpec|SelectorSurfaceCardSpec|SurfaceCommandSpec)(?:<[^>]+>)?(?:\s*\|\s*null)?\s*$/;
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
  "createFixedSidebarBody",
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
  "createPageTableSection",
  "createPageTabBar",
  "createPanelSection",
  "createRecordSection",
  "createSectionSection",
  "createSectionsSection",
  "createSpaceKindNavigation",
  "createSpaceWorkbenchBody",
  "createStatusSection",
  "createVisualizationSection",
]);
const FLOW_SIDE_EFFECT_CALLS = new Set([
  "fetch",
  "notify",
  "showToast",
  "toast",
  "confirm",
  "confirmDelete",
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
  const platformDocumentEditorFiles = walk(path.join(packagesDir, "platform/document-editor"));
  return [...appFiles, ...packageUiFiles, ...platformDocumentEditorFiles].filter((filePath) => {
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

function callOwnerName(expression: ts.Expression) {
  const unwrapped = unwrapExpression(expression);
  if (!ts.isPropertyAccessExpression(unwrapped)) return undefined;
  return ts.isIdentifier(unwrapped.expression) ? unwrapped.expression.text : undefined;
}

function containsChineseVisibleText(node: ts.Node, sourceFile: ts.SourceFile) {
  return CHINESE_TEXT_PATTERN.test(node.getText(sourceFile));
}

function isHelperName(name: string | undefined) {
  return Boolean(name && HELPER_NAME_PATTERN.test(name));
}

function returnTypeText(node: ts.FunctionLikeDeclarationBase | ts.ArrowFunction | ts.FunctionExpression) {
  return node.type?.getText() ?? "";
}

function structuralDeclarationKind(node: ts.FunctionLikeDeclarationBase | ts.ArrowFunction | ts.FunctionExpression) {
  const type = returnTypeText(node);
  const fullText = node.getFullText();
  if (/@ui-structural-declaration\b/.test(fullText.slice(0, Math.max(0, fullText.indexOf(node.getText()))))) return "structural" as const;
  if (!type) return "helper" as const;
  if (FINE_GRAINED_DECLARATION_RETURN.test(type)) return "fine" as const;
  if (STRUCTURAL_DECLARATION_RETURN.test(type)) return "structural" as const;
  return "helper" as const;
}

function jsxName(name: ts.JsxTagNameExpression) {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isPropertyAccessExpression(name)) return name.name.text;
  return "jsx";
}

function scanHelperBody(
  sourceFile: ts.SourceFile,
  file: string,
  helperName: string,
  body: ts.Node,
  declarationKind: "helper" | "fine" | "structural",
) {
  if (/@ui-specialized-surface\b/.test(body.parent.getFullText()) && REVIEWED_UI_SPECIALIZED_SURFACE_FILES.has(file)) return [];
  const signals: UiHelperPuritySignal[] = [];
  const flowSignals: UiHelperPuritySignal[] = [];
  let sawStateDecision = false;
  let sawUiOutput = false;

  const add = (node: ts.Node, kind: UiHelperPuritySignalKind, detail: string) => {
    signals.push({ file, helperName, line: nodeLine(sourceFile, node), kind, detail });
    if (kind === "jsx-output" || kind === "ui-structure" || kind === "visible-copy") sawUiOutput = true;
  };

  const addFlow = (node: ts.Node, detail: string) => {
    flowSignals.push({ file, helperName, line: nodeLine(sourceFile, node), kind: "flow-side-effect", detail });
  };

  const visit = (node: ts.Node, nestedFunction = false) => {
    if (ts.isJsxElement(node)) {
      add(node, "jsx-output", jsxName(node.openingElement.tagName));
    } else if (ts.isJsxSelfClosingElement(node)) {
      add(node, "jsx-output", jsxName(node.tagName));
    } else if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      if (name && UI_STRUCTURE_CALLS.has(name)) add(node, "ui-structure", name);
      const owner = callOwnerName(node.expression);
      const navigationPush = name === "push" && (owner === "router" || owner === "history");
      if (!nestedFunction && name && (navigationPush || FLOW_SIDE_EFFECT_CALLS.has(name) || /^set[A-Z]/.test(name))) addFlow(node, name);
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
    ts.forEachChild(node, (child) => visit(child, nestedFunction || ts.isFunctionLike(node)));
  };

  visit(body);
  if (declarationKind === "fine") {
    signals.push({
      file,
      helperName,
      line: nodeLine(sourceFile, body),
      kind: "fine-grained-declaration",
      detail: returnTypeText(body.parent as ts.FunctionLikeDeclarationBase) || "leaf-spec",
    });
  }
  if (sawUiOutput) signals.push(...flowSignals);
  if (sawStateDecision && sawUiOutput) {
    signals.push({ file, helperName, line: nodeLine(sourceFile, body), kind: "state-decision", detail: "state-or-permission-driven-ui" });
  }
  if (declarationKind !== "structural") return signals;
  return signals.filter((signal) => signal.kind === "jsx-output" || signal.kind === "flow-side-effect" || signal.kind === "fine-grained-declaration");
}

function scanFile(filePath: string): UiHelperPuritySignal[] {
  const text = fs.readFileSync(filePath, "utf8");
  if (!/(function|=>|create|build|make|get|map|to)/.test(text)) return [];
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const file = toRelative(filePath);
  const signals: UiHelperPuritySignal[] = [];

  const isTopLevelVariable = (node: ts.VariableDeclaration) => {
    const declarationList = node.parent;
    const statement = declarationList?.parent;
    return ts.isVariableDeclarationList(declarationList)
      && ts.isVariableStatement(statement)
      && ts.isSourceFile(statement.parent);
  };

  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && ts.isSourceFile(node.parent) && isHelperName(node.name?.text) && node.body) {
      signals.push(...scanHelperBody(sourceFile, file, node.name!.text, node.body, structuralDeclarationKind(node)));
    }
    if (ts.isVariableDeclaration(node) && isTopLevelVariable(node) && isHelperName(propertyName(node.name)) && node.initializer) {
      const initializer = unwrapExpression(node.initializer);
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        signals.push(...scanHelperBody(sourceFile, file, propertyName(node.name)!, initializer.body, structuralDeclarationKind(initializer)));
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

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(`${REPORT_PATH}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(`${REPORT_PATH}.tmp`, REPORT_PATH);

  if (!report.total) {
    console.log("✓ UI helper purity gate: no unapproved UI/flow-owning helpers detected outside Core UI.");
    return true;
  }

  console.error(`✗ UI helper purity gate: ${report.total} helper violation(s) detected.`);
  console.warn("  Rule: business/platform helpers may transform data, but must not own visible UI, page chrome, flow side effects, or permission-driven UI decisions.");
  console.warn(`  Full report: ${toRelative(REPORT_PATH)}`);
  console.warn("  By kind:");
  for (const [kind, count] of report.byKind) console.warn(`    ${kind}: ${count}`);
  console.warn("  Top files:");
  for (const [file, count] of report.byFile.slice(0, 12)) console.warn(`    ${file}: ${count}`);

  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkUiHelperPurityWarnings() ? 0 : 1);
}
