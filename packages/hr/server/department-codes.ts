import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";

import { getCodePoolCode } from "./company-directory";

export type GetDepartmentCodesInput = {
  companys?: string;
  company?: string;
};

export type UpsertDepartmentCodeInput = {
  code: string;
  name: string;
  company?: string;
  originalCode?: string;
};

async function buildFullCode(code: string, company: string): Promise<string> {
  const normalized = await getCodePoolCode(company);
  if (code.length <= 3) {
    return normalized + code.padStart(3, "0");
  }
  return code;
}

export async function getDepartmentCodes(input: GetDepartmentCodesInput) {
  const codes = input.companys
    ? input.companys.split(",")
    : input.company
      ? [input.company]
      : [];

  const where: Prisma.DepartmentWhereInput = {};
  if (codes.length > 0) {
    where.OR = codes.map((companyCode: string) => ({ code: { startsWith: companyCode } }));
  }

  const result = await prisma.department.findMany({ where, orderBy: { code: "asc" } });
  const filtered = result.filter((department) => /^\d{5}$/.test(department.code));
  return { codes: filtered.map((department) => ({ code: department.code, name: department.name })) };
}

export async function upsertDepartmentCode(input: UpsertDepartmentCodeInput, userId: number) {
  const finalCode = await buildFullCode(input.code, input.company || "");

  return prisma.$transaction(async (tx) => {
    if (input.originalCode && input.originalCode !== finalCode) {
      const existing = await tx.department.findFirst({ where: { code: finalCode } });
      if (existing) {
        return { success: false as const, status: 400, error: "编号已存在" };
      }

      const oldDepartment = await tx.department.findFirst({ where: { code: input.originalCode } });
      if (oldDepartment) {
        await ensureEditHistoryBaseline("Department", oldDepartment.id, userId, tx);
        await tx.department.update({
          where: { id: oldDepartment.id },
          data: {
            code: finalCode,
            name: input.name,
            editedBy: userId,
            editedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await snapshotHistory("Department", oldDepartment.id, userId, tx);
      }
    } else {
      const oldDepartment = await tx.department.findFirst({ where: { code: finalCode } });
      if (oldDepartment) {
        await ensureEditHistoryBaseline("Department", oldDepartment.id, userId, tx);
        await tx.department.update({
          where: { id: oldDepartment.id },
          data: {
            name: input.name,
            editedBy: userId,
            editedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await snapshotHistory("Department", oldDepartment.id, userId, tx);
      } else {
        const department = await tx.department.create({
          data: { code: finalCode, name: input.name, level: 1, editedBy: userId },
        });
        await snapshotHistory("Department", department.id, userId, tx);
      }
    }

    return { success: true as const };
  });
}

export async function deleteDepartmentCode(code: string, userId: number) {
  return prisma.$transaction(async (tx) => {
    const department = await tx.department.findFirst({ where: { code } });
    if (!department) {
      return { success: false as const, status: 404, error: "部门不存在" };
    }

    const epCount = await tx.eDP.count({ where: { departmentId: department.id } });
    if (epCount > 0) {
      return { success: false as const, status: 400, error: `该部门下有 ${epCount} 名员工，无法删除` };
    }

    await ensureEditHistoryBaseline("Department", department.id, userId, tx);
    await snapshotHistory("Department", department.id, userId, tx);
    await tx.department.delete({ where: { id: department.id } });
    return { success: true as const };
  });
}
