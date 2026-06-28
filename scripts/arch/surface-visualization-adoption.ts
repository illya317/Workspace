import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

type VisualizationAdoptionWarning = {
  file: string;
  line: number;
  pattern: string;
  migrationTarget: string;
};

const SOURCE_ROOTS = ["app", "packages"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const CORE_UI_IMPLEMENTATION_PREFIX = `packages${path.sep}core${path.sep}ui${path.sep}`;

function walkSourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const stat = statSync(root);
  if (!stat.isDirectory()) return SOURCE_EXTENSIONS.has(path.extname(root)) ? [root] : [];
  return readdirSync(root)
    .filter((entry) => !entry.startsWith(".") && entry !== "node_modules")
    .flatMap((entry) => walkSourceFiles(path.join(root, entry)));
}

function normalizeFilePath(file: string) {
  return file.split(path.sep).join("/");
}

function createSourceFile(file: string) {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function nodeLine(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function objectStringProperty(object: ts.ObjectLiteralExpression, name: string) {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName = property.name;
    if (!ts.isIdentifier(propertyName) && !ts.isStringLiteral(propertyName)) continue;
    if (propertyName.text !== name) continue;
    const initializer = property.initializer;
    if (ts.isStringLiteral(initializer)) return initializer.text;
    if (
      ts.isAsExpression(initializer)
      && ts.isStringLiteral(initializer.expression)
    ) {
      return initializer.expression.text;
    }
  }
  return null;
}

function hasObjectProperty(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.some((property) => {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return false;
    const propertyName = property.name;
    return (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) && propertyName.text === name;
  });
}

export function findVisualizationAdoptionWarnings() {
  const warnings: VisualizationAdoptionWarning[] = [];

  for (const file of SOURCE_ROOTS.flatMap(walkSourceFiles)) {
    if (file.startsWith(CORE_UI_IMPLEMENTATION_PREFIX)) continue;
    const text = readFileSync(file, "utf8");
    if (!text.includes("gantt") || !text.includes("content")) continue;
    const sourceFile = createSourceFile(file);

    function scan(node: ts.Node) {
      if (ts.isObjectLiteralExpression(node)) {
        const kind = objectStringProperty(node, "kind");
        if (kind === "gantt" && hasObjectProperty(node, "content")) {
          warnings.push({
            file: normalizeFilePath(file),
            line: nodeLine(sourceFile, node),
            pattern: "VisualizationSurface.gantt.content",
            migrationTarget: "Introduce a typed GanttSurface/VisualizationGanttSpec; do not pass full React components as visualization content.",
          });
        }
      }
      ts.forEachChild(node, scan);
    }

    scan(sourceFile);
  }

  return warnings.sort((left, right) => `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`));
}

function printReport(warnings: VisualizationAdoptionWarning[]) {
  if (warnings.length === 0) {
    console.log("✓ Visualization adoption warning check passed.");
    return;
  }

  console.warn(`⚠ Visualization adoption warning: ${warnings.length} raw visualization content usage(s) detected outside Core UI.`);
  console.warn("  Rule: complex visualizations should expose typed specs; ReactNode content is migration debt only.");
  for (const warning of warnings.slice(0, 40)) {
    console.warn(`  - ${warning.file}:${warning.line}: ${warning.pattern} -> ${warning.migrationTarget}`);
  }
  if (warnings.length > 40) {
    console.warn(`  ... ${warnings.length - 40} more`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  const warnings = findVisualizationAdoptionWarnings();
  printReport(warnings);
  process.exit(warnings.length === 0 ? 0 : 1);
}
