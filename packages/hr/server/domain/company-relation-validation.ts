import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { HR_FK_REGISTRY } from "../fk-registry";

export const COMPANY_RELATION_ALLOWED_FIELDS = ["parentId", "childId", "shareRatio", "isConsolidated"];

async function validateCompanyId(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return failCommand(`该字段不能为空，请先选择有效的${label}。`);
  const validation = await validateFkValue(HR_FK_REGISTRY, {
    fkKey: "hr.company",
    value,
    requiredLabel: label,
  });
  return validation.ok ? okCommand(validation.value) : failCommand(validation.error, validation.status);
}

function normalizeShareRatio(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

export async function buildCompanyRelationCreateCommand(body: Record<string, unknown>) {
  const parent = await validateCompanyId(body.parentId, "母公司");
  if (!parent.ok) return parent;
  const child = await validateCompanyId(body.childId, "子公司");
  if (!child.ok) return child;
  if (parent.data && child.data && parent.data === child.data) return failCommand("母公司和子公司不能相同");
  const shareRatio = normalizeShareRatio(body.shareRatio);
  if (Number.isNaN(shareRatio)) return failCommand("持股比例无效");
  return okCommand({
    parentId: parent.data,
    childId: child.data,
    shareRatio,
    isConsolidated: Boolean(body.isConsolidated),
  });
}

export async function buildCompanyRelationFieldUpdateCommand(
  field: string,
  value: unknown,
): Promise<DomainValidationResult<{ field: string; value: unknown }>> {
  if (field === "parentId") {
    const parent = await validateCompanyId(value, "母公司");
    return parent.ok ? okCommand({ field, value: parent.data }) : parent;
  }
  if (field === "childId") {
    const child = await validateCompanyId(value, "子公司");
    return child.ok ? okCommand({ field, value: child.data }) : child;
  }
  if (field === "shareRatio") {
    const shareRatio = normalizeShareRatio(value);
    return Number.isNaN(shareRatio) ? failCommand("持股比例无效") : okCommand({ field, value: shareRatio });
  }
  if (field === "isConsolidated") return okCommand({ field, value: Boolean(value) });
  return okCommand({ field, value });
}
