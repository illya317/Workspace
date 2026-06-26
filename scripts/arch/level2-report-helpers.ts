export type Level2ApiContractOwnerSummary = {
  ownerPackage: string;
};

export type Level2SourceFileSummary = {
  relPath: string;
  hasJsx: boolean;
};

export function countApiContractsByOwner(contracts: readonly Level2ApiContractOwnerSummary[]) {
  const result: Record<string, number> = {};
  for (const contract of contracts) {
    result[contract.ownerPackage] = (result[contract.ownerPackage] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

export function findAppJsxFiles(files: readonly Level2SourceFileSummary[]) {
  return files
    .filter((file) => file.relPath.startsWith("app/"))
    .filter((file) => !file.relPath.startsWith("app/api/"))
    .filter((file) => file.relPath.endsWith(".tsx"))
    .filter((file) => file.hasJsx)
    .map((file) => file.relPath)
    .sort();
}
