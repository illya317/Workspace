import fs from "node:fs";
import path from "node:path";

type SplitPriorityViolation = {
  file: string;
  line: number;
  className: string;
};

const ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOTS = ["app", "packages"];
const SKIPPED_DIRS = new Set([".git", ".next", "generated", "node_modules", "test-results"]);

function toRelative(filePath: string) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function walk(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }

  return files;
}

function lineNumber(text: string, index: number) {
  return text.slice(0, index).split("\n").length;
}

function isAuxiliaryFirstSplit(className: string) {
  if (!/\bgrid\b/.test(className)) return false;
  const match = /\b(?:md|lg|xl):grid-cols-\[([^\]]+)\]/.exec(className);
  if (!match) return false;
  const columns = match[1].split("_");
  if (columns.length !== 2) return false;

  const [left, right] = columns;
  if (left === "auto" || right === "auto") return false;
  return /^\d+(?:\.\d+)?(?:px|rem|fr)$/.test(left) && /(?:minmax|\d+(?:\.\d+)?(?:px|rem|fr))/.test(right);
}

function hasRightPriorityOrder(text: string, index: number, className: string) {
  if (className.includes("max-lg:order-last")) return true;
  return text.slice(index, index + 900).includes("max-lg:order-last");
}

function findViolationsInFile(filePath: string) {
  const text = fs.readFileSync(filePath, "utf8");
  const relPath = toRelative(filePath);
  const violations: SplitPriorityViolation[] = [];
  const classNamePattern = /className(?:=|:\s*)(["'`])([^"'`]*\bgrid\b[^"'`]*\b(?:md|lg|xl):grid-cols-\[[^\]]+\][^"'`]*)\1/g;
  let match: RegExpExecArray | null;

  while ((match = classNamePattern.exec(text))) {
    const className = match[2];
    if (!isAuxiliaryFirstSplit(className)) continue;
    if (hasRightPriorityOrder(text, match.index, className)) continue;

    violations.push({
      file: relPath,
      line: lineNumber(text, match.index),
      className,
    });
  }

  return violations;
}

export function findSplitPriorityViolations() {
  return SCAN_ROOTS
    .flatMap((rootName) => walk(path.join(ROOT, rootName)))
    .sort()
    .flatMap(findViolationsInFile);
}

export function checkSplitPriority() {
  const violations = findSplitPriorityViolations();
  if (violations.length === 0) {
    console.log("✓ Split priority passed.");
    return true;
  }

  console.error("✗ Split priority failed: left/selector columns must not be mobile-first.");
  console.error("  Use PageSurface split/surfaceGroup, TemplateWorkbenchFrame, or add max-lg:order-last to the left column.");
  for (const item of violations) {
    console.error(`  ${item.file}:${item.line} ${item.className}`);
  }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkSplitPriority() ? 0 : 1);
}
