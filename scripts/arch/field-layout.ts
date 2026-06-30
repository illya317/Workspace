import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(ROOT, ".cache/arch/field-layout-debt.json");
const WARNING_ONLY = true;
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "generated", "node_modules", "tmp"]);
const FIELD_COMPONENTS = new Set([
  "AutoSizeTextField",
  "CalendarDateInput",
  "FieldControl",
  "FieldGrid",
  "FormField",
  "OptionPicker",
  "PercentField",
  "ReadOnlyField",
  "TagInputShell",
  "TagInlineTextField",
  "TagListInput",
  "TextField",
  "TextareaField",
  "TimeField",
]);
const FIELD_CLASS_PROPS = new Set([
  "className",
  "containerClassName",
  "controlClassName",
  "inputClassName",
  "itemClassName",
  "labelClassName",
  "listClassName",
  "panelClassName",
  "triggerClassName",
  "valueClassName",
]);
const LAYOUT_CLASS_PATTERN =
  /(?:^|\s)!(?:h|w|min-h|max-h|min-w|max-w|px|py|pt|pr|pb|pl|p|text|leading|border|rounded|shadow|ring|bg|gap|items|justify|grid|flex)-|(?:^|\s)(?:h|w|min-h|max-h|min-w|max-w|px|py|pt|pr|pb|pl|p|text|leading|border|rounded|shadow|ring|bg|gap|items|justify|grid|flex)-/;

type FieldLayoutDebt = {
  file: string;
  line: number;
  component: string;
  prop: string;
  value: string;
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
  return [
    ...walk(path.join(ROOT, "app")),
    ...walk(path.join(ROOT, "packages")),
  ].filter((file) => {
    const rel = toRelative(file);
    return !rel.startsWith("packages/core/ui/") &&
      !rel.startsWith("packages/core/showcase/") &&
      !rel.includes("/__tests__/") &&
      !rel.endsWith(".test.ts") &&
      !rel.endsWith(".test.tsx");
  });
}

function tagNameText(tagName: ts.JsxTagNameExpression, sourceFile: ts.SourceFile) {
  const text = tagName.getText(sourceFile);
  return text.split(".").pop() ?? text;
}

function jsxAttributeValue(attribute: ts.JsxAttribute, sourceFile: ts.SourceFile) {
  const initializer = attribute.initializer;
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return null;
  const expression = initializer.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  return null;
}

function scanSourceFile(filePath: string): FieldLayoutDebt[] {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: FieldLayoutDebt[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const component = tagNameText(node.tagName, sourceFile);
      if (FIELD_COMPONENTS.has(component)) {
        for (const property of node.attributes.properties) {
          if (!ts.isJsxAttribute(property)) continue;
          const prop = property.name.getText(sourceFile);
          if (!FIELD_CLASS_PROPS.has(prop)) continue;
          const value = jsxAttributeValue(property, sourceFile);
          if (!value || !LAYOUT_CLASS_PATTERN.test(value)) continue;
          const { line } = sourceFile.getLineAndCharacterOfPosition(property.getStart(sourceFile));
          findings.push({
            file: toRelative(filePath),
            line: line + 1,
            component,
            prop,
            value,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
}

function groupCount<T extends string>(items: T[]) {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function createFieldLayoutDebtReport() {
  const findings = sourceFiles().flatMap(scanSourceFile);
  return {
    warningOnly: WARNING_ONLY,
    total: findings.length,
    byComponent: groupCount(findings.map((finding) => finding.component)),
    byProp: groupCount(findings.map((finding) => finding.prop)),
    byFile: groupCount(findings.map((finding) => finding.file)),
    findings,
  };
}

export function checkFieldLayoutDebt() {
  const report = createFieldLayoutDebtReport();
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(`${REPORT_PATH}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(`${REPORT_PATH}.tmp`, REPORT_PATH);

  if (report.total === 0) {
    console.log("✓ Field layout debt: no business-level field layout overrides detected.");
    return true;
  }

  console.warn(`⚠ Field layout debt warning-only: ${report.total} override(s) detected.`);
  console.warn("  These are business-level field class overrides that should move behind core field tokens/shells.");
  console.warn(`  Full report: ${toRelative(REPORT_PATH)}`);
  console.warn("  Top components:");
  for (const [component, count] of report.byComponent.slice(0, 8)) {
    console.warn(`    ${component}: ${count}`);
  }
  console.warn("  Top files:");
  for (const [file, count] of report.byFile.slice(0, 12)) {
    console.warn(`    ${file}: ${count}`);
  }
  console.warn("  Examples:");
  for (const finding of report.findings.slice(0, 24)) {
    console.warn(
      `    ${finding.file}:${finding.line} <${finding.component} ${finding.prop}="${finding.value}">`,
    );
  }
  if (report.findings.length > 24) {
    console.warn(`    ... ${report.findings.length - 24} more`);
  }

  return WARNING_ONLY;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkFieldLayoutDebt() ? 0 : 1);
}
