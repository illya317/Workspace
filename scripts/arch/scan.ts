import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

type Baseline = {
  appUiFiles: string[];
  directPermissionFiles: string[];
  directRbacTableFiles: string[];
};

type Violation = {
  file: string;
  rule: string;
  message: string;
};

const ROOT = path.resolve(__dirname, "../..");
const BUSINESS_PACKAGES = new Set([
  "administration",
  "finance",
  "hr",
  "library",
  "production",
  "work",
]);
const FORBIDDEN_PATTERNS = [
  "checkPermission",
  "canAccess",
  "hasAccess",
  "roleCheck",
  "rbacCheck",
];
const FORBIDDEN_IMPORTS = [
  "@/server/rbac",
  "@/server/auth/legacy",
  "antd",
  "@mui",
  "react-bootstrap",
];
const FORBIDDEN_UI_IN_APP = ["app/**/*.tsx"];
const PERMISSION_FUNCTION_NAMES = new Set(FORBIDDEN_PATTERNS);
const RBAC_TABLE_NAMES = new Set([
  "userResourceRole",
  "positionResourceRole",
  "departmentResourceRole",
]);
const RBAC_MODEL_NAMES = new Set(["resource", "role"]);

const baseline = JSON.parse(
  fs.readFileSync(path.join(ROOT, "scripts/arch/level15-baseline.json"), "utf8"),
) as Baseline;

const baselineSets = {
  appUiFiles: new Set(baseline.appUiFiles),
  directPermissionFiles: new Set(baseline.directPermissionFiles),
  directRbacTableFiles: new Set(baseline.directRbacTableFiles),
};

function isRbacServiceFile(rel: string) {
  return rel.startsWith("server/rbac/");
}

class ArchViolation extends Error {
  constructor(readonly violation: Violation) {
    super(`${violation.file} [${violation.rule}] ${violation.message}`);
  }
}

function fail(file: string, rule: string, message: string): never {
  throw new ArchViolation({ file, rule, message });
}

function toRelative(filePath: string) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function toPosix(filePath: string) {
  return filePath.replace(/\\/g, "/");
}

function walk(dir: string, files: string[] = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "tmp", "generated"].includes(entry.name)) continue;
      walk(fullPath, files);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function isBusinessPackageFile(rel: string) {
  const parts = rel.split("/");
  return parts[0] === "packages" && BUSINESS_PACKAGES.has(parts[1]);
}

function getPackageName(rel: string) {
  const parts = rel.split("/");
  return parts[0] === "packages" ? parts[1] : null;
}

function getImportedWorkspacePackage(specifier: string) {
  const match = specifier.match(/^@workspace\/([^/]+)/);
  return match?.[1] ?? null;
}

function resolveRelativeImport(fromFile: string, specifier: string) {
  if (!specifier.startsWith(".")) return null;
  return toPosix(path.resolve(path.dirname(fromFile), specifier));
}

function hasJsx(sourceFile: ts.SourceFile) {
  let found = false;
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function containsUserRoleCheck(node: ts.Node) {
  let found = false;
  const visit = (child: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(child) &&
      child.name.text === "role" &&
      ts.isIdentifier(child.expression) &&
      ["user", "payload", "currentUser", "sessionUser"].includes(child.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function callExpressionName(expression: ts.Expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function importMatchesForbidden(specifier: string, forbidden: string) {
  if (forbidden.startsWith("@/")) return specifier === forbidden || specifier.startsWith(`${forbidden}/`);
  if (forbidden.startsWith("@mui")) return specifier === "@mui" || specifier.startsWith("@mui/");
  return specifier === forbidden || specifier.startsWith(`${forbidden}/`);
}

function isLegacyPermissionKernel(rel: string) {
  return rel.startsWith("server/rbac/") ||
    rel === "server/auth/authorize.ts" ||
    rel === "server/auth/session.ts" ||
    baselineSets.directPermissionFiles.has(rel) ||
    baselineSets.directRbacTableFiles.has(rel);
}

function appUiViolation(sourceFile: ts.SourceFile, rel: string) {
  if (!rel.startsWith("app/") || rel.startsWith("app/api/") || !rel.endsWith(".tsx")) return false;
  if (!hasJsx(sourceFile)) return false;
  return FORBIDDEN_UI_IN_APP.length > 0;
}

function scanImport(filePath: string, rel: string, specifier: string) {
  const blockedImport = FORBIDDEN_IMPORTS.find((forbidden) => importMatchesForbidden(specifier, forbidden));
  if (blockedImport) {
    const isRbacKernelImport = blockedImport === "@/server/rbac" && isLegacyPermissionKernel(rel);
    if (!isRbacKernelImport) {
      fail(rel, "forbidden-import", `import "${specifier}" is forbidden by the architecture gate`);
    }
  }

  const packageName = getPackageName(rel);
  const importedWorkspacePackage = getImportedWorkspacePackage(specifier);
  if (packageName === "core" && importedWorkspacePackage && importedWorkspacePackage !== "core") {
    fail(rel, "core-dependency", `Core cannot import ${specifier}`);
  }

  if (packageName === "platform" && importedWorkspacePackage && BUSINESS_PACKAGES.has(importedWorkspacePackage)) {
    fail(rel, "platform-domain-import", `Platform cannot import domain package ${specifier}; use module-registry data`);
  }

  if (isBusinessPackageFile(rel)) {
    if (specifier.startsWith("@/server/") || specifier.startsWith("server/")) {
      fail(rel, "package-server-alias", `Domain packages cannot import server runtime alias "${specifier}"`);
    }
    if (
      importedWorkspacePackage &&
      BUSINESS_PACKAGES.has(importedWorkspacePackage) &&
      importedWorkspacePackage !== packageName
    ) {
      fail(rel, "cross-domain-import", `Domain package ${packageName} cannot import ${specifier}`);
    }

    const resolved = resolveRelativeImport(filePath, specifier);
    if (resolved) {
      const rootPosix = toPosix(ROOT);
      if (resolved.startsWith(`${rootPosix}/server/`)) {
        fail(rel, "package-server-relative-import", `Domain packages cannot import server/ via relative path "${specifier}"`);
      }
      for (const domain of BUSINESS_PACKAGES) {
        if (domain !== packageName && resolved.startsWith(`${rootPosix}/packages/${domain}/`)) {
          fail(rel, "cross-domain-relative-import", `Domain package ${packageName} cannot import packages/${domain} via relative path "${specifier}"`);
        }
      }
    }
  }
}

function scanFile(filePath: string) {
  const rel = toRelative(filePath);
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  if (appUiViolation(sourceFile, rel) && !baselineSets.appUiFiles.has(rel)) {
    fail(rel, "app-ui", "app/ is routing-only; move JSX UI to packages/*/ui or packages/platform/ui");
  }

  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      scanImport(filePath, rel, node.moduleSpecifier.text);
    }

    if (ts.isCallExpression(node)) {
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        scanImport(filePath, rel, node.arguments[0].text);
      }

      const name = callExpressionName(node.expression);
      if (name && PERMISSION_FUNCTION_NAMES.has(name) && !baselineSets.directPermissionFiles.has(rel)) {
        fail(rel, "permission-bypass", `permission helper "${name}" is forbidden; use authorize()`);
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name && PERMISSION_FUNCTION_NAMES.has(node.name.text) && !baselineSets.directPermissionFiles.has(rel)) {
      fail(rel, "permission-helper-definition", `permission helper "${node.name.text}" is forbidden; use authorize()`);
    }

    if (ts.isIfStatement(node) && containsUserRoleCheck(node.expression)) {
      fail(rel, "role-if", "role-based if checks are forbidden; use authorize()");
    }

    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      const isRbacGrantTable = RBAC_TABLE_NAMES.has(name);
      const isPrismaRbacModel =
        RBAC_MODEL_NAMES.has(name) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "prisma";
      if (
        (isRbacGrantTable || isPrismaRbacModel) &&
        !isRbacServiceFile(rel) &&
        !baselineSets.directRbacTableFiles.has(rel)
      ) {
        fail(rel, "direct-rbac-table", `direct RBAC table/model access "${name}" is forbidden outside authorize/RBAC services`);
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function checkBaselineFilesStillExist() {
  for (const [kind, files] of Object.entries(baselineSets)) {
    for (const rel of files) {
      if (!fs.existsSync(path.join(ROOT, rel))) {
        fail(rel, `stale-${kind}`, "legacy baseline entry points to a missing file; remove the baseline entry with the migration");
      }
    }
  }
}

export function scan() {
  try {
    checkBaselineFilesStillExist();

    for (const rootName of ["app", "packages", "server", "lib"]) {
      for (const file of walk(path.join(ROOT, rootName))) {
        scanFile(file);
      }
    }

    console.log("✓ Architecture AST scan passed.");
    return true;
  } catch (error) {
    console.error("✗ Architecture AST scan failed.");
    console.error(error instanceof Error ? `  ${error.message}` : error);
    return false;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  process.exit(scan() ? 0 : 1);
}
