const fs = require("node:fs");
const path = require("node:path");

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".json"];
const WORKSPACE_EXPORT_SOURCE_ROOTS = Object.freeze([
  "app",
  "apps",
  "e2e",
  "lib",
  "server",
  "scripts",
  "packages",
]);

function compareExportPatterns(left, right) {
  const leftPatternIndex = left.indexOf("*");
  const rightPatternIndex = right.indexOf("*");
  const leftBaseLength = leftPatternIndex === -1 ? left.length : leftPatternIndex + 1;
  const rightBaseLength = rightPatternIndex === -1 ? right.length : rightPatternIndex + 1;

  if (leftBaseLength > rightBaseLength) return -1;
  if (rightBaseLength > leftBaseLength) return 1;
  if (leftPatternIndex === -1) return 1;
  if (rightPatternIndex === -1) return -1;
  if (left.length > right.length) return -1;
  if (right.length > left.length) return 1;
  return 0;
}

function matchExportPattern(pattern, exportKey) {
  const patternIndex = pattern.indexOf("*");
  if (patternIndex === -1 || patternIndex !== pattern.lastIndexOf("*")) return null;
  const prefix = pattern.slice(0, patternIndex);
  const suffix = pattern.slice(patternIndex + 1);
  if (!exportKey.startsWith(prefix) || !exportKey.endsWith(suffix)) return null;
  const substitution = exportKey.slice(prefix.length, exportKey.length - suffix.length);
  return substitution.length > 0 ? substitution : null;
}

function resolveExportTarget(exportsMap, exportKey) {
  if (!exportsMap || typeof exportsMap !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(exportsMap, exportKey)) {
    const exact = exportsMap[exportKey];
    return typeof exact === "string" ? exact : null;
  }

  const matches = Object.entries(exportsMap)
    .filter(([pattern]) => pattern.includes("*"))
    .map(([pattern, target]) => ({
      pattern,
      substitution: matchExportPattern(pattern, exportKey),
      target,
    }))
    .filter(({ substitution }) => substitution !== null)
    .sort((left, right) => compareExportPatterns(left.pattern, right.pattern));
  const selected = matches[0];
  if (!selected || typeof selected.target !== "string") return null;
  return selected.target.split("*").join(selected.substitution);
}

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveRelativeSource(importerFile, specifier, filePredicate = isFile) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(importerFile), specifier);
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => filePredicate(candidate)) ?? null;
}

function packageNameForSource(sourceFile, packagesDirectory) {
  const relativePath = path.relative(packagesDirectory, sourceFile);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return relativePath.split(path.sep)[0] || null;
}

function resolveRelativePackageBoundary(importerFile, specifier, packagesDirectory, filePredicate = isFile) {
  const targetFile = resolveRelativeSource(importerFile, specifier, filePredicate);
  if (!targetFile) return null;
  const sourcePackage = packageNameForSource(importerFile, packagesDirectory);
  const targetPackage = packageNameForSource(targetFile, packagesDirectory);
  if ((!sourcePackage && !targetPackage) || (sourcePackage && sourcePackage === targetPackage)) return null;
  return { sourcePackage, targetFile, targetPackage };
}

function isWorkspacePackageRootAlias(specifier) {
  return specifier.startsWith("@/packages/");
}

function shouldEnforceRelativePackageBoundary(boundary, importerFile, repositoryRoot) {
  if (!boundary) return false;
  if (boundary.sourcePackage && boundary.targetPackage) return true;

  const importer = path.relative(repositoryRoot, importerFile).replace(/\\/g, "/");
  if (!boundary.sourcePackage && boundary.targetPackage) {
    return !importer.startsWith("scripts/");
  }

  const target = path.relative(repositoryRoot, boundary.targetFile).replace(/\\/g, "/");
  return Boolean(boundary.sourcePackage && /^(?:app|lib|server)\//.test(target));
}

module.exports = {
  WORKSPACE_EXPORT_SOURCE_ROOTS,
  isWorkspacePackageRootAlias,
  packageNameForSource,
  resolveExportTarget,
  resolveRelativePackageBoundary,
  resolveRelativeSource,
  shouldEnforceRelativePackageBoundary,
};
