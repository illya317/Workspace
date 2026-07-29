import {
  loadDeptBudgetFromDb,
  loadRdBudgetFromDb,
} from "./budget-data";
import { getActiveVersion } from "./budget-version";

export async function loadBudgetOverview(input: {
  year: number;
  companyCode?: string;
  versionId?: number;
}) {
  const versionId = input.versionId ?? (await getActiveVersion(input.year, input.companyCode))?.id ?? null;

  if (versionId) {
    return {
      deptBudget: await loadDeptBudgetFromDb(versionId),
      rdBudget: await loadRdBudgetFromDb(versionId),
      versionId,
    };
  }

  return {
    deptBudget: [],
    rdBudget: [],
    versionId,
  };
}
