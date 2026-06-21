#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKAGES_DIR = path.join(ROOT, "packages");
const WORKSPACE_PACKAGES = {
  "@workspace/core": "core",
  "@workspace/platform": "platform",
  "@workspace/administration": "administration",
  "@workspace/library": "library",
  "@workspace/hr": "hr",
  "@workspace/production": "production",
  "@workspace/finance": "finance",
  "@workspace/external": "external",
  "@workspace/work": "work",
};

const PACKAGE_RULES = {
  core: {
    forbidden: [
      { pattern: /^@workspace\/(platform|administration|library|hr|production|finance|external|work)(\/|$)/, reason: "core must not depend on platform or domain packages" },
      { pattern: /^@\//, reason: "core must not import app/server/lib aliases" },
    ],
  },
  platform: {
    forbidden: [
      { pattern: /^@\/app\//, reason: "packages must not import Next app route shells" },
      { pattern: /^@\/(lib|server|generated)(\/|$)/, reason: "platform package must use package-owned contracts instead of app-root runtime aliases" },
      { pattern: /^@\/app\/(administration|library|hr|finance|production|external|work)(\/|$)/, reason: "platform must not import domain UI directly" },
      { pattern: /^@\/server\/services\/(administration|library|hr|finance|production|external|work)(\/|$)/, reason: "platform must not import domain services directly" },
    ],
  },
  administration: {
    forbidden: [
      { pattern: /^@workspace\/(library|hr|finance|production|external|work)(\/|$)/, reason: "administration must not depend on other domain packages" },
      { pattern: /^@\/app\//, reason: "packages must not import Next app route shells" },
      { pattern: /^@\/(lib|server|generated)(\/|$)/, reason: "administration package must use package-owned contracts instead of app-root runtime aliases" },
      { pattern: /^@\/app\/(library|hr|finance|production|external|work)(\/|$)/, reason: "administration must not import other domain UI" },
      { pattern: /^@\/server\/services\/(library|hr|finance|production|external|work)(\/|$)/, reason: "administration must not import other domain services" },
    ],
  },
  library: {
    forbidden: [
      { pattern: /^@workspace\/(hr|finance|production|external|work|administration)(\/|$)/, reason: "library must not depend on other domain packages" },
      { pattern: /^@\/app\//, reason: "packages must not import Next app route shells" },
      { pattern: /^@\/(lib|server|generated)(\/|$)/, reason: "library package must use package-owned contracts instead of app-root runtime aliases" },
      { pattern: /^@\/app\/(hr|finance|production|external|work|administration)(\/|$)/, reason: "library must not import other domain UI" },
      { pattern: /^@\/server\/services\/(hr|finance|production|external|work|administration)(\/|$)/, reason: "library must not import other domain services" },
    ],
  },
  hr: {
    forbidden: [
      { pattern: /^@workspace\/(administration|library|finance|production|external|work)(\/|$)/, reason: "hr must not depend on other domain packages" },
      { pattern: /^@\/app\//, reason: "packages must not import Next app route shells" },
      { pattern: /^@\/(lib|server|generated)(\/|$)/, reason: "hr package must use package-owned contracts instead of app-root runtime aliases" },
      { pattern: /^@\/app\/(administration|library|finance|production|external|work)(\/|$)/, reason: "hr must not import other domain UI" },
      { pattern: /^@\/server\/services\/(administration|library|finance|production|external|work)(\/|$)/, reason: "hr must not import other domain services" },
    ],
  },
  finance: {
    forbidden: [
      { pattern: /^@workspace\/(administration|library|hr|production|external|work)(\/|$)/, reason: "finance must not depend on other domain packages" },
      { pattern: /^@\/app\//, reason: "packages must not import Next app route shells" },
      { pattern: /^@\/(lib|server|generated)(\/|$)/, reason: "finance package must use package-owned contracts instead of app-root runtime aliases" },
      { pattern: /^@\/app\/(administration|library|hr|production|external|work)(\/|$)/, reason: "finance must not import other domain UI" },
      { pattern: /^@\/server\/services\/(administration|library|hr|production|external|work)(\/|$)/, reason: "finance must not import other domain services" },
    ],
  },
  production: {
    forbidden: [
      { pattern: /^@workspace\/(administration|library|hr|finance|external|work)(\/|$)/, reason: "production must not depend on other domain packages" },
      { pattern: /^@\/app\//, reason: "packages must not import Next app route shells" },
      { pattern: /^@\/(lib|server|generated)(\/|$)/, reason: "production package must use package-owned contracts instead of app-root runtime aliases" },
      { pattern: /^@\/app\/(administration|library|hr|finance|external|work)(\/|$)/, reason: "production must not import other domain UI" },
      { pattern: /^@\/server\/services\/(administration|library|hr|finance|external|work)(\/|$)/, reason: "production must not import other domain services" },
    ],
  },
  external: {
    forbidden: [
      { pattern: /^@workspace\/(administration|library|hr|finance|production|work)(\/|$)/, reason: "external must not depend on other domain packages" },
      { pattern: /^@\/app\//, reason: "packages must not import Next app route shells" },
      { pattern: /^@\/(lib|server|generated)(\/|$)/, reason: "external package must use package-owned contracts instead of app-root runtime aliases" },
      { pattern: /^@\/app\/(administration|library|hr|finance|production|work)(\/|$)/, reason: "external must not import other domain UI" },
      { pattern: /^@\/server\/services\/(administration|library|hr|finance|production|work)(\/|$)/, reason: "external must not import other domain services" },
    ],
  },
  work: {
    forbidden: [
      { pattern: /^@workspace\/(administration|library|hr|finance|production|external)(\/|$)/, reason: "work must not depend on other domain packages" },
      { pattern: /^@\/app\//, reason: "packages must not import Next app route shells" },
      { pattern: /^@\/(lib|server|generated)(\/|$)/, reason: "work package must use package-owned contracts instead of app-root runtime aliases" },
      { pattern: /^@\/app\/(administration|library|hr|finance|production|external)(\/|$)/, reason: "work must not import other domain UI" },
      { pattern: /^@\/server\/services\/(administration|library|hr|finance|production|external)(\/|$)/, reason: "work must not import other domain services" },
    ],
  },
};

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function collectImports(text) {
  const imports = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(text))) imports.push(match[1]);
  }
  return imports;
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const UI_PRIMITIVE_RULES = [
  {
    pattern: /<select\b/i,
    reason: "packages must use @workspace/core/ui SelectField instead of native <select>",
  },
  {
    pattern: /\bwindow\.confirm\s*\(/,
    reason: "packages must use @workspace/core/ui ConfirmProvider instead of window.confirm",
  },
  {
    pattern: /\b(?:window\.)?alert\s*\(/,
    reason: "packages must use a shared toast/error surface instead of browser alert",
  },
  {
    pattern: /<input\b[^>]*\btype\s*=\s*(?:"date"|'date'|\{\s*["']date["']\s*\})/i,
    reason: "packages must use @workspace/core/ui CalendarDateInput instead of native date inputs",
  },
];

const FOUNDATION_COMPONENT_RULES = [
  { pattern: /(Select|Dropdown|Combobox)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "select/dropdown primitives must be based on Core SelectField or a documented Core wrapper" },
  { pattern: /(Confirm)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "confirm UI must be based on Core ConfirmModal/ConfirmProvider" },
  { pattern: /(Date.*Input|DatePicker)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "date inputs must be based on Core CalendarDateInput" },
  { pattern: /(Search)/, imports: [/^@workspace\/core\/ui(\/|$)/, /^@workspace\/core\/search(\/|$)/], reason: "search UI must use Core SearchInput or Core pinyin-aware search helpers" },
  { pattern: /(Table)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "tables must be based on Core DataTable unless allowlisted as a business-specific layout" },
  { pattern: /(Filter)/, imports: [/^@workspace\/core\/ui(\/|$)/, /^@workspace\/core\/search(\/|$)/], reason: "filter UI must be based on Core FilterToolbar/FilterBar/SearchInput" },
  { pattern: /(Shell)/, imports: [/^@workspace\/core\/ui(\/|$)/, /^@workspace\/platform\/ui(\/|$)/], reason: "page shells must use Core PageShell or Platform AppShell" },
  { pattern: /(Toolbar)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "toolbars must be based on Core toolbar primitives" },
  { pattern: /(Modal)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "modal UI must be based on Core DetailModal or ConfirmModal" },
  { pattern: /(Pagination)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "pagination must be based on Core Pagination" },
  { pattern: /(TabBar|Tabs?)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "tabs must be based on Core TabBar unless allowlisted as a business-specific layout" },
];

const FOUNDATION_COMPONENT_ALLOWLIST = {
  "packages/hr/ui/components/EntitySearchInput.tsx": "Temporary HR FK search component; must be folded into a Core combobox/search primitive before extending it.",
  "packages/work/ui/components/EntitySearchInput.tsx": "Temporary Work split debt from HR Project extraction; coordinate with Work thread before enforcing Core combobox here.",
};

const violations = [];

const FORBIDDEN_LEGACY_FILES = [
  {
    file: "app/components/SearchBox.tsx",
    reason: "legacy app-layer SearchBox mixed Core UI with HR autocomplete semantics; use Core FilterToolbar/input or an app-owned field component",
  },
  {
    file: "app/hooks/useSearch.ts",
    reason: "legacy app-layer useSearch mixed generic search with HR APIs; use @workspace/core/search plus a domain-owned search component/service",
  },
];

for (const rule of FORBIDDEN_LEGACY_FILES) {
  const filePath = path.join(ROOT, rule.file);
  if (fs.existsSync(filePath)) {
    violations.push({
      file: rule.file,
      specifier: "forbidden legacy file",
      reason: rule.reason,
    });
  }
}

for (const packageName of Object.keys(PACKAGE_RULES)) {
  const packageDir = path.join(PACKAGES_DIR, packageName);
  const files = walk(packageDir);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const code = stripComments(text);
    const imports = collectImports(text);
    for (const specifier of imports) {
      for (const rule of PACKAGE_RULES[packageName].forbidden) {
        if (rule.pattern.test(specifier)) {
          violations.push({
            file: path.relative(ROOT, file).replace(/\\/g, "/"),
            specifier,
            reason: rule.reason,
          });
        }
      }
    }

    for (const rule of UI_PRIMITIVE_RULES) {
      if (rule.pattern.test(code)) {
        violations.push({
          file: path.relative(ROOT, file).replace(/\\/g, "/"),
          specifier: "native UI primitive",
          reason: rule.reason,
        });
      }
    }

    if (packageName !== "core" && file.includes(`${path.sep}ui${path.sep}components${path.sep}`)) {
      const relativeFile = path.relative(ROOT, file).replace(/\\/g, "/");
      const baseName = path.basename(file, path.extname(file));
      for (const rule of FOUNDATION_COMPONENT_RULES) {
        if (!rule.pattern.test(baseName)) continue;
        const hasCoreFoundation = imports.some((specifier) => rule.imports.some((pattern) => pattern.test(specifier)));
        if (!hasCoreFoundation && !FOUNDATION_COMPONENT_ALLOWLIST[relativeFile]) {
          violations.push({
            file: relativeFile,
            specifier: "foundation component",
            reason: `${rule.reason}. Import the Core/Platform primitive, or add a narrow allowlist entry with migration rationale.`,
          });
        }
      }
    }
  }
}

for (const file of walk(path.join(ROOT, "app"))) {
  const code = stripComments(fs.readFileSync(file, "utf8"));
  for (const rule of UI_PRIMITIVE_RULES) {
    if (rule.pattern.test(code)) {
      violations.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        specifier: "native UI primitive",
        reason: rule.reason.replace(/^packages must/, "app routes and pages must"),
      });
    }
  }
}

function getWorkspacePackageSpecifier(specifier) {
  for (const packageName of Object.keys(WORKSPACE_PACKAGES)) {
    if (specifier === packageName || specifier.startsWith(`${packageName}/`)) {
      return {
        packageName,
        packageDir: path.join(PACKAGES_DIR, WORKSPACE_PACKAGES[packageName]),
        exportKey: specifier === packageName ? "." : `.${specifier.slice(packageName.length)}`,
      };
    }
  }
  return null;
}

function escapeRegex(text) {
  return text.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function resolveExportTarget(exportsMap, exportKey) {
  const exact = exportsMap[exportKey];
  if (typeof exact === "string") return exact;

  for (const [pattern, target] of Object.entries(exportsMap)) {
    if (!pattern.includes("*") || typeof target !== "string") continue;
    const regex = new RegExp(`^${pattern.split("*").map(escapeRegex).join("(.+)")}$`);
    const match = exportKey.match(regex);
    if (match) return target.replace("*", match[1]);
  }
  return null;
}

function sourceFilesForExportCheck() {
  const roots = ["app", "lib", "server", "scripts", "packages"]
    .map((name) => path.join(ROOT, name))
    .filter((dir) => fs.existsSync(dir));
  return roots.flatMap((dir) => walk(dir));
}

for (const file of sourceFilesForExportCheck()) {
  const text = fs.readFileSync(file, "utf8");
  for (const specifier of collectImports(text)) {
    const workspaceSpecifier = getWorkspacePackageSpecifier(specifier);
    if (!workspaceSpecifier) continue;

    const packageJsonPath = path.join(workspaceSpecifier.packageDir, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const target = resolveExportTarget(packageJson.exports || {}, workspaceSpecifier.exportKey);
    if (!target) {
      violations.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        specifier,
        reason: `${workspaceSpecifier.packageName} does not export "${workspaceSpecifier.exportKey}"`,
      });
      continue;
    }

    const targetPath = path.join(workspaceSpecifier.packageDir, target);
    if (!fs.existsSync(targetPath)) {
      violations.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        specifier,
        reason: `${workspaceSpecifier.packageName} export "${workspaceSpecifier.exportKey}" points to missing file ${target}`,
      });
    }
  }
}

if (violations.length > 0) {
  console.error("✗ Package boundary check failed.");
  for (const v of violations) {
    console.error(`  ${v.file} imports "${v.specifier}" — ${v.reason}`);
  }
  process.exit(1);
}

console.log("✓ Package boundary check passed.");
