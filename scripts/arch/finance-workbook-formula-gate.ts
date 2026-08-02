import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export interface FinanceWorkbookFormulaGateViolation {
  file: string;
  line: number;
  reason: string;
}

const ROOT = path.resolve(__dirname, "../..");
const FINANCE_SERVER_ROOT = path.join(ROOT, "packages/finance/server");
const CONTRACT_PATH = "packages/finance/server/workbook-formula-contract.ts";

function sourceFiles(directory: string, files: string[] = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(filePath, files);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(filePath);
  }
  return files;
}

function normalizedPath(filePath: string) {
  return filePath.replace(/\\/g, "/");
}

function propertyNameText(name: ts.PropertyName | ts.MemberName) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) return name.expression.text;
  return null;
}

function elementAccessName(node: ts.ElementAccessExpression) {
  const argument = node.argumentExpression;
  return argument && ts.isStringLiteral(argument) ? argument.text : null;
}

function isFormulaAssignmentTarget(node: ts.Expression) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text === "f";
  return ts.isElementAccessExpression(node) && elementAccessName(node) === "f";
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function contractViolations(sourceFile: ts.SourceFile, file: string) {
  const violations: FinanceWorkbookFormulaGateViolation[] = [];
  const workbookFormula = sourceFile.statements.find((statement): statement is ts.FunctionDeclaration => (
    ts.isFunctionDeclaration(statement) && statement.name?.text === "workbookFormula"
  ));
  let enforcesFormulaPolicy = false;
  if (workbookFormula?.body) {
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "assertFinanceWorkbookFormula") {
        enforcesFormulaPolicy = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(workbookFormula.body);
  }
  if (!workbookFormula || !enforcesFormulaPolicy) {
    violations.push({
      file,
      line: workbookFormula ? lineOf(sourceFile, workbookFormula) : 1,
      reason: "workbookFormula 必须统一调用 assertFinanceWorkbookFormula",
    });
  }
  return violations;
}

export function analyzeFinanceWorkbookFormulaSource(file: string, source: string) {
  const normalizedFile = normalizedPath(file);
  const sourceFile = ts.createSourceFile(
    normalizedFile,
    source,
    ts.ScriptTarget.Latest,
    true,
    normalizedFile.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (normalizedFile.endsWith(CONTRACT_PATH)) return contractViolations(sourceFile, normalizedFile);

  const violations: FinanceWorkbookFormulaGateViolation[] = [];
  const add = (node: ts.Node, reason: string) => violations.push({
    file: normalizedFile,
    line: lineOf(sourceFile, node),
    reason,
  });
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyNameText(node.name);
      if (name === "f") add(node, "不得绕过 workbookFormula 直接构造 XLSX 公式单元格");
      if (name === "kind" && ts.isStringLiteral(node.initializer) && node.initializer.text === "formula") {
        add(node, "不得绕过 workbookFormula 直接构造 FinanceWorkbookFormulaCell");
      }
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.text === "f") {
      add(node, "不得绕过 workbookFormula 直接构造 XLSX 公式单元格");
    } else if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && isFormulaAssignmentTarget(node.left)) {
      add(node, "不得绕过 workbookFormula 直接写入 XLSX 单元格 f 属性");
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

export function findFinanceWorkbookFormulaGateViolations() {
  return sourceFiles(FINANCE_SERVER_ROOT)
    .sort()
    .flatMap((filePath) => analyzeFinanceWorkbookFormulaSource(
      normalizedPath(path.relative(ROOT, filePath)),
      fs.readFileSync(filePath, "utf8"),
    ));
}

export function checkFinanceWorkbookFormulaGate() {
  const violations = findFinanceWorkbookFormulaGateViolations();
  if (violations.length === 0) {
    console.log("✓ Finance workbook formula contract passed.");
    return true;
  }
  console.error("✗ Finance workbook formula contract failed:");
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line} ${violation.reason}`);
  }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkFinanceWorkbookFormulaGate() ? 0 : 1);
}
