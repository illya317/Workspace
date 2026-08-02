#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  WORKSPACE_EXPORT_SOURCE_ROOTS,
  isWorkspacePackageRootAlias,
  resolveExportTarget,
  resolveRelativePackageBoundary,
  shouldEnforceRelativePackageBoundary,
} = require("./workspace-package-boundaries");
const {
  PACKAGE_NAMES,
  isPackageDependencyAllowed,
  packageNameFromWorkspaceSpecifier,
  workspacePackageAlias,
} = require("../arch/package-dependency-policy.cjs");

const ROOT = path.resolve(__dirname, "..", "..");
const PACKAGES_DIR = path.join(ROOT, "packages");
const WORKSPACE_PACKAGES = Object.fromEntries(
  PACKAGE_NAMES.map((packageName) => [workspacePackageAlias(packageName), packageName]),
);

const API_MODULE_OWNERS = {
  administration: "administration",
  docs: "docs",
  capitalSecurities: "capital-securities",
  external: "external",
  finance: "finance",
  hr: "hr",
  inventory: "inventory",
  library: "library",
  news: "news",
  production: "production",
  work: "work",
};

const PACKAGES_WITH_STRICT_APP_ROOT_IMPORTS = new Set(["agent", "core", "docs", "settings"]);
const PACKAGE_RULES = Object.fromEntries(PACKAGE_NAMES.map((packageName) => [packageName, {
  forbidden: PACKAGES_WITH_STRICT_APP_ROOT_IMPORTS.has(packageName)
    ? [{ pattern: /^@\//, reason: `${packageName} package must not import app-root aliases` }]
    : [
        { pattern: /^@\/app\//, reason: "packages must not import Next app route shells" },
        {
          pattern: /^@\/(lib|server|generated)(\/|$)/,
          reason: `${packageName} package must use package-owned contracts instead of app-root runtime aliases`,
        },
      ],
}]));

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(?:[mc]?ts|tsx)$/.test(entry.name)) files.push(full);
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

function stripQuotedStringLiterals(text) {
  return text.replace(/(["'])(?:\\.|(?!\1)[^\\\r\n])*\1/g, '""');
}

function referencedApiModuleOwners(text) {
  const owners = new Set();
  const pattern = /\/api\/modules\/([A-Za-z][A-Za-z0-9_-]*)/g;
  let match;
  while ((match = pattern.exec(text))) {
    const owner = API_MODULE_OWNERS[match[1]];
    if (owner) owners.add(owner);
  }
  return owners;
}

function isPlatformRuntimeApiCaller(file) {
  const relative = path.relative(PACKAGES_DIR, file).replace(/\\/g, "/");
  return relative.startsWith("platform/ui/")
    || relative.startsWith("platform/hooks/")
    || relative.startsWith("platform/server/");
}

const UI_PRIMITIVE_RULES = [
  {
    pattern: /<select\b/i,
    reason: "packages must use @workspace/core/ui InputSurface or SearchableOptionInput instead of native <select>",
  },
  {
    pattern: /\bwindow\.confirm\s*\(/,
    ignoreQuotedStrings: true,
    reason: "packages must use @workspace/core/ui useFeedback instead of window.confirm",
  },
  {
    pattern: /\b(?:window\.)?alert\s*\(/,
    ignoreQuotedStrings: true,
    reason: "packages must use a shared toast/error surface instead of browser alert",
  },
  {
    pattern: /<input\b[^>]*\btype\s*=\s*(?:"date"|'date'|\{\s*["']date["']\s*\})/i,
    reason: "packages must use @workspace/core/ui CalendarDateInput instead of native date inputs",
  },
];

const FOUNDATION_COMPONENT_RULES = [
  { pattern: /(Select|Dropdown|Combobox)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "select/dropdown primitives must be based on Core InputSurface/SearchableOptionInput or a documented Core wrapper" },
  { pattern: /(Confirm)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "confirm UI must be based on Core useFeedback or ConfirmModal" },
  { pattern: /(Date.*Input|DatePicker)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "date inputs must be based on Core CalendarDateInput" },
  { pattern: /(Search)/, imports: [/^@workspace\/core\/ui(\/|$)/, /^@workspace\/core\/search(\/|$)/], reason: "search UI must use Core SearchInput or Core pinyin-aware search helpers" },
  { pattern: /(Table)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "tables must be based on Core DataTable unless allowlisted as a business-specific layout" },
  { pattern: /(Filter)/, imports: [/^@workspace\/core\/ui(\/|$)/, /^@workspace\/core\/search(\/|$)/], reason: "filter UI must be based on Core Toolbar/SearchInput/FieldValueFilter" },
  { pattern: /(Shell)/, imports: [/^@workspace\/core\/ui(\/|$)/, /^@workspace\/platform\/ui(\/|$)/], reason: "page shells must use Core PageShell or Platform AppShell" },
  { pattern: /(Toolbar)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "toolbars must be based on Core toolbar primitives" },
  { pattern: /(Modal)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "modal UI must be based on Core DetailModal or ConfirmModal" },
  { pattern: /(Pagination)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "pagination must be based on Core Pagination" },
  { pattern: /(TabBar|Tabs?)/, imports: [/^@workspace\/core\/ui(\/|$)/], reason: "tabs must be based on Core TabBar unless allowlisted as a business-specific layout" },
];

const FOUNDATION_COMPONENT_ALLOWLIST = {};

const violations = [];

const FORBIDDEN_LEGACY_FILES = [
  {
    file: "app/components/SearchBox.tsx",
    reason: "legacy app-layer SearchBox mixed Core UI with HR autocomplete semantics; use Core Toolbar/SearchInput or an app-owned field component",
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

for (const packageName of PACKAGE_NAMES) {
  const packageDir = path.join(PACKAGES_DIR, packageName);
  const files = walk(packageDir);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const code = stripComments(text);
    const imports = collectImports(text);
    if (!/\.(?:test|spec)\.[mc]?[jt]sx?$/.test(file)) {
      for (const apiOwner of referencedApiModuleOwners(code)) {
        const isCrossDomainCaller = packageName !== "core"
          && packageName !== "platform"
          && apiOwner !== packageName;
        const isPlatformRuntimeCaller = packageName === "platform" && isPlatformRuntimeApiCaller(file);
        if (isCrossDomainCaller || isPlatformRuntimeCaller) {
          violations.push({
            file: path.relative(ROOT, file).replace(/\\/g, "/"),
            specifier: `/api/modules/${apiOwner}`,
            reason: isPlatformRuntimeCaller
              ? "Platform runtime must not call a domain API; move owner-specific UI into the domain or expose a Platform-owned interface"
              : `domain package ${packageName} must not call ${apiOwner} APIs; move the caller to the owner or expose a Platform-owned interface`,
          });
        }
      }
    }
    for (const specifier of imports) {
      let targetPackage = null;
      try {
        targetPackage = packageNameFromWorkspaceSpecifier(specifier);
      } catch (error) {
        violations.push({
          file: path.relative(ROOT, file).replace(/\\/g, "/"),
          specifier,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (targetPackage && !isPackageDependencyAllowed(packageName, targetPackage)) {
        violations.push({
          file: path.relative(ROOT, file).replace(/\\/g, "/"),
          specifier,
          reason: `package policy does not allow ${packageName} to depend on ${targetPackage}`,
        });
        continue;
      }
      if (targetPackage && targetPackage !== packageName && specifier === workspacePackageAlias(targetPackage)) {
        violations.push({
          file: path.relative(ROOT, file).replace(/\\/g, "/"),
          specifier,
          reason: "implementation code must use an explicit exported subpath instead of a cross-package root barrel",
        });
        continue;
      }
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
      const scanText = rule.ignoreQuotedStrings ? stripQuotedStringLiterals(code) : code;
      if (rule.pattern.test(scanText)) {
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
    const scanText = rule.ignoreQuotedStrings ? stripQuotedStringLiterals(code) : code;
    if (rule.pattern.test(scanText)) {
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

function sourceFilesForExportCheck() {
  const roots = WORKSPACE_EXPORT_SOURCE_ROOTS
    .map((name) => path.join(ROOT, name))
    .filter((dir) => fs.existsSync(dir));
  const rootProjectFiles = [
    "instrumentation.ts",
    "next.config.ts",
    "playwright.config.ts",
    "prisma.config.ts",
  ]
    .map((name) => path.join(ROOT, name))
    .filter((file) => fs.existsSync(file));
  return [...roots.flatMap((dir) => walk(dir)), ...rootProjectFiles];
}

for (const file of sourceFilesForExportCheck()) {
  const text = fs.readFileSync(file, "utf8");
  for (const specifier of collectImports(text)) {
    if (isWorkspacePackageRootAlias(specifier)) {
      violations.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        specifier,
        reason: "root aliases must not bypass package exports; use an exported @workspace/* entry",
      });
      continue;
    }

    const relativeBoundary = resolveRelativePackageBoundary(file, specifier, PACKAGES_DIR);
    if (shouldEnforceRelativePackageBoundary(relativeBoundary, file, ROOT)) {
      const source = relativeBoundary.sourcePackage ?? "repository source";
      const target = relativeBoundary.targetPackage ?? "repository source";
      violations.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        specifier,
        reason: `relative imports must not cross from ${source} to ${target}; use an exported @workspace/* entry at package boundaries`,
      });
      continue;
    }

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
