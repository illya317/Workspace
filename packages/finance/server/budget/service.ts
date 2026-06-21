import {
  importDeptBudgetToDb,
  importRdBudgetToDb,
  loadDeptBudgetFromDb,
  loadRdBudgetFromDb,
  readDeptBudget,
  readRdBudget,
} from "./budget-data";
import { createBudgetVersion, getActiveVersion } from "./budget-version";

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
    deptBudget: readDeptBudget().map((item) => ({ ...item, accountId: null, accountCode: null, accountActive: null })),
    rdBudget: readRdBudget().map((item) => ({ ...item, accountId: null, accountCode: null, accountActive: null })),
    versionId,
  };
}

export async function importBudgetWorkbook(input: {
  year: number;
  companyCode?: string;
}) {
  const version = await createBudgetVersion({
    year: input.year,
    companyCode: input.companyCode,
    name: `导入于 ${new Date().toLocaleDateString("zh-CN")}`,
    type: "all",
  });

  const deptCount = await importDeptBudgetToDb(input.year, input.companyCode, version.id);
  const rdCount = await importRdBudgetToDb(input.year, input.companyCode, version.id);

  return { version, deptCount, rdCount };
}
