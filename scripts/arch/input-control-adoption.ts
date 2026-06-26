import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(ROOT, ".cache/arch/input-control-adoption.json");
const WARNING_ONLY = true;
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "generated", "node_modules", "tmp"]);

const DIRECT_INPUT_COMPONENTS = new Map<string, string>([
  ["CalendarDateInput", "InputControl spec editor=datePicker"],
  ["CheckboxField", "InputControl spec editor=checkbox"],
  ["FileField", "InputControl spec editor=upload"],
  ["FkFieldInput", "InputControl spec editor=autocomplete options.source=remote"],
  ["OptionPicker", "InputControl spec editor=select/autocomplete options.source=static/grouped"],
  ["PercentField", "InputControl spec format=percent"],
  ["SearchableOptionInput", "InputControl spec editor=autocomplete options.source=static/grouped"],
  ["SelectField", "InputControl spec editor=select, except Toolbar/filter dropdown"],
  ["SwitchField", "InputControl spec editor=switch"],
  ["TagStringInput", "InputControl spec editor=tags"],
  ["TextField", "InputControl spec editor=input/number"],
  ["TextareaField", "InputControl spec editor=textarea"],
  ["TimeField", "InputControl spec editor=timePicker"],
]);

const ALLOW_PATH_PREFIXES = [
  "packages/core/",
];

const ALLOW_PATH_INCLUDES = [
  "/showcase/",
  "/template-workbench/",
];

const ALLOW_FILES = new Set([
  "packages/platform/ui/LoginClient.tsx",
  "packages/platform/ui/agent/AgentPanel.tsx",
]);

type Finding = {
  file: string;
  line: number;
  component: string;
  suggestion: string;
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
    console.log("✓ InputControl adoption: no direct business input usage detected.");
    return true;
  }

  console.warn(`⚠ InputControl adoption warning-only: ${report.total} direct business input usage(s) detected.`);
  console.warn("  Business form fields should declare InputFieldSpec and render through InputControl.");
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
