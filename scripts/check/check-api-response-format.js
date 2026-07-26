#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const API_ROOT = path.join(WORKSPACE_ROOT, "app/api");
const PACKAGE_ROOT = path.join(WORKSPACE_ROOT, "packages");
const CHECK_ROOTS = [API_ROOT, PACKAGE_ROOT];
const CHECK_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const SKIP_FILES = new Set([
  "packages/platform/server/api.ts",
]);

function isCheckableFile(fullPath) {
  return CHECK_EXTENSIONS.has(path.extname(fullPath));
}

function scriptKindForFile(fullPath) {
  const ext = path.extname(fullPath);
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, results);
    } else if (entry.isFile() && isCheckableFile(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function propNameText(name, sourceFile) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return name.getText(sourceFile);
}

function objectHasErrorPayload(objectLiteral, sourceFile) {
  return objectLiteral.properties.some((prop) => {
    if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) return false;
    const name = ts.isPropertyAssignment(prop) ? propNameText(prop.name, sourceFile) : prop.name.text;
    return name === "error";
  });
}

function isDirectJsonErrorResponse(node, sourceFile) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (!ts.isPropertyAccessExpression(expression) || expression.name.text !== "json") return false;
  const target = expression.expression.getText(sourceFile);
  if (target !== "Response" && target !== "NextResponse") return false;
  const payload = node.arguments[0];
  return Boolean(payload && ts.isObjectLiteralExpression(payload) && objectHasErrorPayload(payload, sourceFile));
}

const violations = [];

for (const file of CHECK_ROOTS.flatMap((root) => walk(root))) {
  const relativeFile = path.relative(WORKSPACE_ROOT, file).replace(/\\/g, "/");
  if (SKIP_FILES.has(relativeFile)) continue;
  const text = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindForFile(file));

  function visit(node) {
    if (isDirectJsonErrorResponse(node, sourceFile)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({
        file: relativeFile,
        line: position.line + 1,
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (violations.length > 0) {
  console.error("API response format check failed.");
  console.error("Use jsonErrorResponse(message, status), serviceResponse(result), or createApiRouteHandler() for error responses.");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line}`);
  }
  process.exit(1);
}

console.log("API response format check passed.");
