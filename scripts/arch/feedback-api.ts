import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_ROOTS = ["app", "packages"];
const SKIPPED_DIRS = new Set([".next", "generated", "node_modules"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const FORBIDDEN_NAMES = [
  "Toast",
  "ConfirmProvider",
  "useToast",
  "useConfirm",
  "useConfirmDelete",
  "useUnsavedChangesPrompt",
  "ConfirmModal",
] as const;
const CONFIRM_MODAL_ALLOWED = new Set([
  "packages/platform/ui/agent/AgentConfirmModal.tsx",
]);

type Violation = {
  file: string;
  name: string;
  reason: string;
};

function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walk(absPath, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(absPath);
  }
  return out;
}

function toRel(absPath: string) {
  return path.relative(ROOT, absPath).replaceAll(path.sep, "/");
}

function shouldScan(relPath: string) {
  if (relPath.startsWith("packages/core/")) return false;
  if (relPath.startsWith("packages/") && !/^packages\/[^/]+\/ui\//.test(relPath)) return false;
  return relPath.startsWith("app/") || relPath.startsWith("packages/");
}

function namedImportRegex(specifier: string, name: string) {
  return new RegExp(`import\\s+\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "s");
}

function directImportRegex(name: string) {
  return new RegExp(`from\\s+["']@workspace/core/(?:ui|hooks)/${name}["']`);
}

function findFeedbackApiViolations() {
  const files = SCAN_ROOTS.flatMap((root) => {
    const absRoot = path.join(ROOT, root);
    return fs.existsSync(absRoot) ? walk(absRoot) : [];
  });
  const violations: Violation[] = [];

  for (const absPath of files) {
    const relPath = toRel(absPath);
    if (!shouldScan(relPath)) continue;
    const source = fs.readFileSync(absPath, "utf8");

    for (const name of FORBIDDEN_NAMES) {
      if (name === "ConfirmModal" && CONFIRM_MODAL_ALLOWED.has(relPath)) continue;
      const fromCoreUi = namedImportRegex("@workspace/core/ui", name).test(source);
      const fromCoreHooks = namedImportRegex("@workspace/core/hooks", name).test(source);
      const fromDirectPath = directImportRegex(name).test(source);
      const jsxToast = name === "Toast" && /<\s*Toast\b/.test(source);
      if (fromCoreUi || fromCoreHooks || fromDirectPath || jsxToast) {
        violations.push({
          file: relPath,
          name,
          reason: "Use useFeedback from @workspace/core/ui for page feedback.",
        });
      }
    }
  }

  return violations.sort((left, right) => `${left.file}:${left.name}`.localeCompare(`${right.file}:${right.name}`));
}

export function checkFeedbackApi() {
  const violations = findFeedbackApiViolations();
  if (violations.length === 0) {
    console.log("✓ Feedback API guard passed.");
    return true;
  }

  console.error("✗ Feedback API guard failed: legacy page feedback API usage detected.");
  for (const violation of violations) {
    console.error(`  - ${violation.file}: ${violation.name} (${violation.reason})`);
  }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(checkFeedbackApi() ? 0 : 1);
}
