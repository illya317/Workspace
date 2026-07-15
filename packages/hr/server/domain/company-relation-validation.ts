import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { HR_FK_REGISTRY } from "../fk-registry";
import {
  INVALID_COMPANY_RELATION_VALUE,
  normalizeCompanyRelationDate,
  normalizeCompanyRelationShareRatio,
  validateCompanyRelationDateRange,
} from "./company-relation-rules";

export const COMPANY_RELATION_ALLOWED_FIELDS = [
  "parentId",
  "childId",
  "shareRatio",
  "isConsolidated",
  "effectiveFrom",
  "effectiveTo",
];

async function validateCompanyId(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return failCommand(`该字段不能为空，请先选择有效的${label}。`);
  const validation = await validateFkValue(HR_FK_REGISTRY, {
    fkKey: "hr.company",
    value,
    requiredLabel: label,
  });
  return validation.ok ? okCommand(validation.value) : failCommand(validation.error, validation.status);
}

export async function buildCompanyRelationCreateCommand(body: Record<string, unknown>) {
  const parent = await validateCompanyId(body.parentId, "母公司");
  if (!parent.ok) return parent;
  const child = await validateCompanyId(body.childId, "子公司");
  if (!child.ok) return child;
  if (parent.data === null || child.data === null) return failCommand("公司关系缺少有效的持股方或被持股方");
  if (parent.data === child.data) return failCommand("持股方和被持股方不能相同");
  const shareRatio = normalizeCompanyRelationShareRatio(body.shareRatio);
  if (shareRatio === INVALID_COMPANY_RELATION_VALUE) return failCommand("持股比例必须在 0 到 1 之间", 400, "shareRatio");
  const effectiveFrom = normalizeCompanyRelationDate(body.effectiveFrom);
  if (effectiveFrom === INVALID_COMPANY_RELATION_VALUE) return failCommand("生效日期无效", 400, "effectiveFrom");
  const effectiveTo = normalizeCompanyRelationDate(body.effectiveTo);
  if (effectiveTo === INVALID_COMPANY_RELATION_VALUE) return failCommand("失效日期无效", 400, "effectiveTo");
  const dateIssue = validateCompanyRelationDateRange(effectiveFrom, effectiveTo);
  if (dateIssue) return failCommand(dateIssue, 400, "effectiveTo");
  return okCommand({
    parentId: parent.data,
    childId: child.data,
    shareRatio,
    isConsolidated: Boolean(body.isConsolidated),
    effectiveFrom,
    effectiveTo,
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
    const shareRatio = normalizeCompanyRelationShareRatio(value);
    return shareRatio === INVALID_COMPANY_RELATION_VALUE
      ? failCommand("持股比例必须在 0 到 1 之间", 400, "shareRatio")
      : okCommand({ field, value: shareRatio });
  }
  if (field === "isConsolidated") return okCommand({ field, value: Boolean(value) });
  if (field === "effectiveFrom" || field === "effectiveTo") {
    const date = normalizeCompanyRelationDate(value);
    return date === INVALID_COMPANY_RELATION_VALUE
      ? failCommand(field === "effectiveFrom" ? "生效日期无效" : "失效日期无效", 400, field)
      : okCommand({ field, value: date });
  }
  return okCommand({ field, value });
}

export async function validateCompanyRelationDeleteCommand(id: unknown): Promise<DomainValidationResult<{ id: number }>> {
  const relationId = Number(id);
  if (!Number.isInteger(relationId) || relationId <= 0) return failCommand("公司关系ID无效");
  const relation = await prisma.companyRelation.findUnique({ where: { id: relationId }, select: { id: true } });
  if (!relation) return failCommand("公司关系不存在", 404);
  return okCommand({ id: relationId });
}
