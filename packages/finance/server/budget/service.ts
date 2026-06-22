import {
  importDeptBudgetToDb,
  importRdBudgetToDb,
  loadDeptBudgetFromDb,
  loadRdBudgetFromDb,
  readDeptBudget,
  readRdBudget,
} from "./budget-data";
import { createBudgetVersion, getActiveVersion } from "./budget-version";
import { buildBudgetImportCommand } from "../domain/finance-validation";

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
  const command = buildBudgetImportCommand(input);
  if (!command.ok) throw new Error(command.issue.message);
  const version = await createBudgetVersion({
    year: command.data.year,
    companyCode: command.data.companyCode,
    name: `导入于 ${new Date().toLocaleDateString("zh-CN")}`,
    type: "all",
  });

  const deptCount = await importDeptBudgetToDb(command.data.year, command.data.companyCode, version.id);
  const rdCount = await importRdBudgetToDb(command.data.year, command.data.companyCode, version.id);

  return { version, deptCount, rdCount };
}
