/**
 * Maps the registry module identity to the deploy/source namespace used by the
 * analysis RPC boundary. Most modules already use a single lowercase word;
 * camel-cased registry keys such as `capitalSecurities` become the canonical
 * kebab-case unit/source prefix `capital-securities`.
 */
export function getWorkspaceAnalysisOwnerUnitId(ownerModuleKey: string) {
  const unitId = ownerModuleKey
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(unitId)) {
    throw new Error(`经营分析 ownerModuleKey 无法映射部署单元: ${ownerModuleKey}`);
  }
  return unitId;
}

export function workspaceAnalysisSourceBelongsToUnit(
  ownerModuleKey: string,
  ownerUnitId: string,
) {
  return getWorkspaceAnalysisOwnerUnitId(ownerModuleKey) === ownerUnitId;
}
