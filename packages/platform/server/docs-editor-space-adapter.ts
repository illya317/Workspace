import "server-only";

import { getGroupCompanyContext, getOperatingCommitteeDepartmentContext } from "./business-space-permissions";
import { prisma } from "./prisma";
import { getTenantProfile } from "./tenant-config";

type DocsEditorSpaceTargetType = "personal" | "department" | "committee" | "company";

function normalizeTargetType(value: string): DocsEditorSpaceTargetType {
  if (value === "personal" || value === "company" || value === "committee" || value === "department") return value;
  return "department";
}

async function targetSeed(targetType: DocsEditorSpaceTargetType, targetId: number) {
  if (targetType === "personal") {
    return { targetType, targetId, title: "我的模板空间", description: "个人草稿和私有模板" };
  }
  if (targetType === "company") {
    const company = await getGroupCompanyContext();
    return company
      ? { targetType, targetId: company.id, title: "公司模板", description: "所有人可查看的公司文档模板空间" }
      : null;
  }
  if (targetType === "committee") {
    const committee = await getOperatingCommitteeDepartmentContext();
    if (!committee) return null;
    const profile = getTenantProfile().organization.operatingCommittee;
    return {
      targetType,
      targetId: committee.id,
      title: `${profile.departmentName}模板`,
      description: `${profile.departmentName}成员可查看，${profile.executivePositionNames.join("、")}可管理`,
    };
  }
  const department = await prisma.department.findFirst({
    where: { id: targetId, isArchived: false },
    select: { id: true, name: true },
  });
  return department
    ? { targetType, targetId: department.id, title: `${department.name}模板空间`, description: "部门成员可查看，负责人可管理" }
    : null;
}

export async function ensureRegisteredDocsEditorSpaceForTarget(targetTypeInput: string, targetId: number) {
  const seed = await targetSeed(normalizeTargetType(targetTypeInput), targetId);
  if (!seed) return null;
  const existing = await prisma.documentTemplateSpace.findFirst({
    where: { targetType: seed.targetType, targetId: seed.targetId, deletedAt: null },
    orderBy: { id: "asc" },
  });
  if (existing) return existing;
  return prisma.documentTemplateSpace.create({ data: seed });
}
