const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function assertRealDirectory(directory, label) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || fs.realpathSync(directory) !== path.resolve(directory)) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function fileDigest(file, label) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) {
    throw new Error(`${label} must be a real file: ${file}`);
  }
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function resolveDeployUnitTurbopackRoot(repositoryRoot) {
  const resolvedRepositoryRoot = fs.realpathSync(repositoryRoot);
  const configuredNodeModulesRoot = path.join(repositoryRoot, "node_modules");
  const nodeModulesStat = fs.lstatSync(configuredNodeModulesRoot);

  if (!nodeModulesStat.isSymbolicLink()) {
    if (!nodeModulesStat.isDirectory()) {
      throw new Error(`Deploy-unit node_modules must be a directory: ${configuredNodeModulesRoot}`);
    }
    const expectedLocalRoot = path.join(resolvedRepositoryRoot, "node_modules");
    if (fs.realpathSync(configuredNodeModulesRoot) !== expectedLocalRoot) {
      throw new Error(`Deploy-unit local node_modules escaped repository root: ${configuredNodeModulesRoot}`);
    }
    return resolvedRepositoryRoot;
  }

  const repositoryParent = path.dirname(resolvedRepositoryRoot);
  const trustedSourceRoot = path.join(repositoryParent, "source");
  const trustedNodeModulesRoot = path.join(trustedSourceRoot, "node_modules");
  const configuredTarget = path.resolve(
    path.dirname(configuredNodeModulesRoot),
    fs.readlinkSync(configuredNodeModulesRoot),
  );
  if (configuredTarget !== trustedNodeModulesRoot) {
    throw new Error(
      `Deploy-unit node_modules symlink must target trusted sibling ${trustedNodeModulesRoot}`,
    );
  }

  assertRealDirectory(trustedSourceRoot, "Deploy-unit trusted source root");
  assertRealDirectory(trustedNodeModulesRoot, "Deploy-unit trusted source node_modules");
  if (fs.realpathSync(configuredNodeModulesRoot) !== trustedNodeModulesRoot) {
    throw new Error("Deploy-unit node_modules symlink target identity does not match trusted source");
  }

  const repositoryLockDigest = fileDigest(
    path.join(resolvedRepositoryRoot, "package-lock.json"),
    "Deploy-unit repository package lock",
  );
  const sourceLockDigest = fileDigest(
    path.join(trustedSourceRoot, "package-lock.json"),
    "Deploy-unit trusted source package lock",
  );
  if (repositoryLockDigest !== sourceLockDigest) {
    throw new Error("Deploy-unit node_modules dependency identity rejected: package-lock.json drift");
  }

  return repositoryParent;
}

module.exports = { resolveDeployUnitTurbopackRoot };
