import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const HELPER_PATH = "scripts/testing/with-playwright.ts";
const CHECKER_PATH = "scripts/check/check-playwright-lifecycle.ts";
const SOURCE_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const SKIP_DIRECTORIES = new Set([".git", ".next", ".cache", "node_modules", "generated"]);
const DIRECT_LAUNCH_PATTERN = /\b(?:playwright\.)?(?:chromium|firefox|webkit)\.launch\s*\(/g;

function relativePath(filePath: string): string {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function collectSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkHelperContract(): string[] {
  const helper = fs.readFileSync(path.join(ROOT, HELPER_PATH), "utf8");
  const requiredFragments = ["try", "finally", ".close()", '"SIGINT"', '"SIGTERM"'];
  return requiredFragments
    .filter((fragment) => !helper.includes(fragment))
    .map((fragment) => `${HELPER_PATH} missing lifecycle fragment: ${fragment}`);
}

const findings: string[] = checkHelperContract();

for (const filePath of collectSourceFiles(ROOT)) {
  const file = relativePath(filePath);
  if (file === HELPER_PATH || file === CHECKER_PATH) continue;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (DIRECT_LAUNCH_PATTERN.test(line)) {
      findings.push(`${file}:${index + 1} direct Playwright Browser launch; use @playwright/test or ${HELPER_PATH}`);
    }
    DIRECT_LAUNCH_PATTERN.lastIndex = 0;
  });
}

if (findings.length > 0) {
  console.error("Playwright lifecycle check failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log("✓ Playwright lifecycle contract passed.");
}
