import { guardActiveReferences } from "@workspace/platform/server/reference-guards";
import { departmentArchiveReferenceCounts, positionArchiveReferenceCounts } from "./reference-count-adapter";

export async function guardDepartmentArchive(departmentId: number, actionLabel = "归档部门") {
  return guardActiveReferences(actionLabel, departmentArchiveReferenceCounts(departmentId));
}

export async function guardPositionArchive(positionId: number, actionLabel = "归档岗位") {
  return guardActiveReferences(actionLabel, positionArchiveReferenceCounts(positionId));
}
