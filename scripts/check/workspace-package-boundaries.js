const fs = require("node:fs");
const path = require("node:path");

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".json"];

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
  isWorkspacePackageRootAlias,
  packageNameForSource,
  resolveExportTarget,
  resolveRelativePackageBoundary,
  resolveRelativeSource,
  shouldEnforceRelativePackageBoundary,
};
