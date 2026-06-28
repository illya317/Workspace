import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(ROOT, ".cache/arch/input-control-adoption.json");
const WARNING_ONLY = false;
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "generated", "node_modules", "tmp"]);

const DIRECT_INPUT_COMPONENTS = new Map<string, string>([
  ["CalendarDateInput", "InputControl spec control=temporal precision=date"],
  ["CheckboxField", "InputControl spec control=boolean presentation=checkbox"],
  ["FileField", "InputControl spec control=file"],
  ["FkFieldInput", "InputControl spec control=reference options.source=remote"],
  ["OptionPicker", "InputControl spec control=choice options.source=static/grouped"],
  ["PercentField", "InputControl spec format=percent"],
  ["SearchableOptionInput", "InputControl spec control=choice options.mode=autocomplete"],
  ["SelectField", "InputControl spec control=choice options.mode=dropdown, except Toolbar/filter dropdown"],
  ["SwitchField", "InputControl spec control=boolean presentation=switch"],
  ["TagStringInput", "InputControl spec control=collection itemControl=text"],
  ["TextField", "InputControl spec control=text/number"],
  ["TextareaField", "InputControl spec control=text multiline=true"],
  ["TimeField", "InputControl spec control=temporal precision=time"],
]);

const ALLOW_PATH_PREFIXES = [
  "packages/core/",
];

const ALLOW_PATH_INCLUDES = [
  "/showcase/",
  "/template-workbench/",
  "packages/production/ui/qc/qc-layout-paper/",
  "packages/production/ui/qc/qc-layout-table/",
];

const ALLOW_FILES = new Set([
  "packages/platform/ui/LoginClient.tsx",
  "packages/production/ui/qc/QcMethodFieldTable.tsx",
  "packages/production/ui/qc/QcPaperDateInput.tsx",
  "packages/production/ui/qc/QcPaperInputs.tsx",
]);

type Finding = {
  file: string;
  line: number;
  component: string;
  suggestion: string;
};

function propertyNameText(name: ts.PropertyName, sourceFile: ts.SourceFile) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sourceFile);
}

function objectLiteralHasProperty(objectLiteral: ts.ObjectLiteralExpression, propertyName: string, sourceFile: ts.SourceFile) {
  return objectLiteral.properties.some((property) => (
    ts.isPropertyAssignment(property)
    && propertyNameText(property.name, sourceFile) === propertyName
  ));
}

function scanLegacyEditorSpec(node: ts.ObjectLiteralExpression, sourceFile: ts.SourceFile) {
  if (!objectLiteralHasProperty(node, "valueType", sourceFile)) return false;
  return objectLiteralHasProperty(node, "editor", sourceFile);
}

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
  return walk(path.join(ROOT, "packages")).filter((file) => {
    const rel = toRelative(file);
    if (!rel.endsWith(".tsx")) return false;
    if (ALLOW_FILES.has(rel)) return false;
    if (ALLOW_PATH_PREFIXES.some((prefix) => rel.startsWith(prefix))) return false;
    if (ALLOW_PATH_INCLUDES.some((part) => rel.includes(part))) return false;
    if (rel.includes("/__tests__/") || rel.endsWith(".test.tsx")) return false;
    return true;
  });
}

function tagNameText(tagName: ts.JsxTagNameExpression, sourceFile: ts.SourceFile) {
  const text = tagName.getText(sourceFile);
  return text.split(".").pop() ?? text;
}

function scanSourceFile(filePath: string): Finding[] {
  const source = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const component = tagNameText(node.tagName, sourceFile);
      const suggestion = DIRECT_INPUT_COMPONENTS.get(component);
      if (suggestion) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        findings.push({
          file: toRelative(filePath),
          line: line + 1,
          component,
          suggestion,
        });
      }
    }
    if (ts.isObjectLiteralExpression(node) && scanLegacyEditorSpec(node, sourceFile)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      findings.push({
        file: toRelative(filePath),
        line: line + 1,
        component: "InputFieldSpec.editor",
        suggestion: "Declare spec.control/options/format/mask instead of renderer-oriented spec.editor",
      });
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

export function createInputControlAdoptionReport() {
  const findings = sourceFiles().flatMap(scanSourceFile);
  return {
    warningOnly: WARNING_ONLY,
    total: findings.length,
    byComponent: groupCount(findings.map((finding) => finding.component)),
    byFile: groupCount(findings.map((finding) => finding.file)),
    findings,
  };
}

export function checkInputControlAdoption() {
  const report = createInputControlAdoptionReport();
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(`${REPORT_PATH}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(`${REPORT_PATH}.tmp`, REPORT_PATH);

  if (report.total === 0) {
    console.log("✓ InputControl adoption: no direct business input usage or legacy spec.editor detected.");
    return true;
  }

  console.warn(`✗ InputControl adoption: ${report.total} violation(s) detected.`);
  console.warn("  Business form fields must declare semantic InputFieldSpec control/options/format/mask and render through InputControl.");
  console.warn("  QC PaperInput/A4 layout inputs are an allowed separate input system.");
  console.warn(`  Full report: ${toRelative(REPORT_PATH)}`);
  console.warn("  Top components:");
  for (const [component, count] of report.byComponent.slice(0, 10)) {
    console.warn(`    ${component}: ${count}`);
  }
  console.warn("  Top files:");
  for (const [file, count] of report.byFile.slice(0, 16)) {
    console.warn(`    ${file}: ${count}`);
  }
  console.warn("  Examples:");
  for (const finding of report.findings.slice(0, 28)) {
    console.warn(`    ${finding.file}:${finding.line} <${finding.component}> -> ${finding.suggestion}`);
  }
  if (report.findings.length > 28) {
    console.warn(`    ... ${report.findings.length - 28} more`);
  }

  return WARNING_ONLY;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkInputControlAdoption() ? 0 : 1);
}
