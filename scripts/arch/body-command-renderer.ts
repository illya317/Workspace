import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOTS = ["app", "packages"];
const SOURCE_EXTENSIONS = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", "coverage", "dist", "generated", "node_modules", "tmp"]);
const COMMAND_SPEC_NAMES = new Set([
  "BodySurfaceCommandSpec",
  "DataSurfaceCommandSpec",
  "FormSurfaceCommandSpec",
]);

type Violation = {
  file: string;
  line: number;
  commandSpec: string;
  reason: string;
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
  return SCAN_ROOTS.flatMap((root) => {
    const absRoot = path.join(ROOT, root);
    return fs.existsSync(absRoot) ? walk(absRoot) : [];
  }).filter((filePath) => {
    const relPath = toRelative(filePath);
    if (!relPath.endsWith(".tsx")) return false;
    if (relPath.startsWith("packages/core/")) return false;
    if (relPath.includes("/__tests__/") || relPath.endsWith(".test.tsx")) return false;
    return relPath.startsWith("app/") || /^packages\/[^/]+\/ui\//.test(relPath);
  });
}

function importedCommandSpecs(sourceFile: ts.SourceFile) {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text !== "@workspace/core/ui") continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (COMMAND_SPEC_NAMES.has(importedName)) names.add(element.name.text);
    }
  }
  return names;
}

function hasCommandSpecReference(node: ts.Node, commandSpecNames: Set<string>, sourceFile: ts.SourceFile) {
  let found = false;
  const visit = (child: ts.Node) => {
    if (found) return;
    if (ts.isImportDeclaration(child)) return;
    if (ts.isIdentifier(child) && commandSpecNames.has(child.text)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found || [...commandSpecNames].some((name) => new RegExp(`\\b${name}\\b`).test(node.getText(sourceFile)));
}

function isButtonElement(node: ts.Node, sourceFile: ts.SourceFile) {
  if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return false;
  return node.tagName.getText(sourceFile) === "button";
}

function firstButtonLine(sourceFile: ts.SourceFile) {
  let line: number | null = null;
  const visit = (node: ts.Node) => {
    if (line !== null) return;
    if (isButtonElement(node, sourceFile)) {
      line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return line;
}

function fileViolations(filePath: string): Violation[] {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes("<button")) return [];
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const commandSpecs = importedCommandSpecs(sourceFile);
  if (commandSpecs.size === 0) return [];
  if (!hasCommandSpecReference(sourceFile, commandSpecs, sourceFile)) return [];
  const line = firstButtonLine(sourceFile);
  if (line === null) return [];
  return [...commandSpecs].sort().map((commandSpec) => ({
    file: toRelative(filePath),
    line,
    commandSpec,
    reason: "Do not render Surface command specs with handwritten JSX buttons; pass actions/commands to BodySurface/FormSurface/DataSurface or PageSurface.toolbar.",
  }));
}

export function findBodyCommandRendererViolations() {
  return sourceFiles()
    .flatMap(fileViolations)
    .sort((left, right) => `${left.file}:${left.line}:${left.commandSpec}`.localeCompare(`${right.file}:${right.line}:${right.commandSpec}`));
}

export function checkBodyCommandRenderer() {
  const violations = findBodyCommandRendererViolations();
  if (violations.length === 0) {
    console.log("✓ Body command renderer guard passed.");
    return true;
  }

  console.error("✗ Body command renderer guard failed: custom UI is rendering Surface command specs as buttons.");
  console.error("  Normal body actions are allowed when passed to Surface actions/commands; custom JSX button clusters are not.");
  for (const violation of violations) {
    console.error(`  - ${violation.file}:${violation.line} ${violation.commandSpec} (${violation.reason})`);
  }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkBodyCommandRenderer() ? 0 : 1);
}
