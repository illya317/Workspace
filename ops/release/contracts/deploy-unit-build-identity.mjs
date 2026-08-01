const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function requireId(value, label) {
  if (!ID_PATTERN.test(value ?? "")) throw new Error(`${label} is invalid`);
  return value;
}

export function normalizeDeployUnitBuildIdentity(value, label = "deploy-unit build identity") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return {
    buildId: requireId(value.buildId, `${label} build id`),
    deploymentId: requireId(value.deploymentId, `${label} deployment id`),
  };
}

export function assertDeployUnitArchiveBuildIdentity(build, archiveBuildId, label = "deploy-unit artifact") {
  const identity = normalizeDeployUnitBuildIdentity(build, label);
  const actual = requireId(archiveBuildId, `${label} archive BUILD_ID`);
  if (actual !== identity.buildId) throw new Error(`${label} archive BUILD_ID differs from manifest build id`);
  return identity;
}

export function deployUnitRuntimeVersion(build, label = "deploy-unit runtime") {
  return normalizeDeployUnitBuildIdentity(build, label).deploymentId;
}
