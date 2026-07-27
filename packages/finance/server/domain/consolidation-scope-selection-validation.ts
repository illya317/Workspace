import type { SaveFinanceConsolidationScopeSelectionInput } from "@workspace/finance/types";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

export interface SaveFinanceConsolidationScopeSelectionCommand {
  input: SaveFinanceConsolidationScopeSelectionInput;
  userId: number;
}

function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function buildSaveFinanceConsolidationScopeSelectionCommand(
  raw: SaveFinanceConsolidationScopeSelectionInput,
  userId: number,
): DomainValidationResult<SaveFinanceConsolidationScopeSelectionCommand> {
  if (!positiveId(userId)) return failCommand("当前用户无效", 401);
  const parentCompanyId = positiveId(raw.parentCompanyId);
  if (!parentCompanyId) return failCommand("母公司ID无效", 400, "parentCompanyId");
  const companyId = positiveId(raw.companyId);
  if (!companyId) return failCommand("合并主体ID无效", 400, "companyId");
  const relationId = positiveId(raw.relationId);
  if (!relationId) return failCommand("公司关系ID无效", 400, "relationId");
  const expectedRelationVersion = positiveId(raw.expectedRelationVersion);
  if (!expectedRelationVersion) return failCommand("公司关系版本无效", 400, "expectedRelationVersion");
  if (!Number.isInteger(raw.year) || raw.year < 1900 || raw.year > 2099) {
    return failCommand("合并年度无效", 400, "year");
  }
  if (!Number.isInteger(raw.month) || raw.month < 1 || raw.month > 12) {
    return failCommand("合并月份无效", 400, "month");
  }
  if (!(["year", "quarter", "month"] as const).includes(raw.periodKind)) {
    return failCommand("报表期间类型无效", 400, "periodKind");
  }
  if (raw.periodKind === "year" && raw.month !== 12) {
    return failCommand("年度报表必须选择12月作为期末", 400, "month");
  }
  if (raw.periodKind === "quarter" && raw.month % 3 !== 0) {
    return failCommand("季度报表必须选择季度末月份", 400, "month");
  }
  if (typeof raw.included !== "boolean") return failCommand("并表选择无效", 400, "included");
  return okCommand({
    userId,
    input: {
      parentCompanyId,
      year: raw.year,
      month: raw.month,
      periodKind: raw.periodKind,
      companyId,
      relationId,
      expectedRelationVersion,
      included: raw.included,
    },
  });
}
