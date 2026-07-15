export interface FrozenConsolidationSourceIdentity {
  workpaperId: number | null;
  workpaperVersion: number | null;
  sourceStatus: string;
  sourceChecksum: string | null;
  sourcePackageId: number | null;
  sourcePackageRevision: number | null;
  sourcePackageStatus: string | null;
  sourcePackageChecksum: string | null;
}

export interface CurrentConsolidationSourceIdentity {
  id: number;
  version: number;
  status: string;
  sourceChecksum: string | null;
  sourcePackageId: number | null;
  sourcePackageRevision: number | null;
  sourcePackage: {
    id: number;
    revision: number;
    status: string;
    fileChecksum: string;
  } | null;
}

export function consolidationSourceIdentityMatches(
  frozen: FrozenConsolidationSourceIdentity,
  current: CurrentConsolidationSourceIdentity | null,
) {
  if (frozen.workpaperId === null) return current === null;
  if (!current
    || current.id !== frozen.workpaperId
    || current.version !== frozen.workpaperVersion
    || current.status !== frozen.sourceStatus
    || current.sourceChecksum !== frozen.sourceChecksum
    || current.sourcePackageId !== frozen.sourcePackageId
    || current.sourcePackageRevision !== frozen.sourcePackageRevision) {
    return false;
  }
  if (frozen.sourcePackageId === null) return current.sourcePackage === null;
  return current.sourcePackage?.id === frozen.sourcePackageId
    && current.sourcePackage.revision === frozen.sourcePackageRevision
    && current.sourcePackage.status === frozen.sourcePackageStatus
    && current.sourcePackage.fileChecksum === frozen.sourcePackageChecksum
    && current.sourceChecksum === frozen.sourcePackageChecksum;
}
