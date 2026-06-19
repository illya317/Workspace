import { Prisma, prisma } from "@workspace/platform/server/prisma";

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

async function snapshotDepartment(code: string, editorId: number, tx: Prisma.TransactionClient = prisma) {
  const department = await tx.department.findFirst({ where: { code } });
  if (!department) return;

  const maxVersion = await tx.editHistory.findFirst({
    where: { entityType: "Department", entityId: code },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  await tx.editHistory.create({
    data: {
      entityType: "Department",
      entityId: code,
      version: (maxVersion?.version || 0) + 1,
      dataJson: JSON.stringify(department),
      editedBy: editorId,
    },
  });
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
        await snapshotDepartment(input.originalCode, userId, tx);
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
      }
    } else {
      const oldDepartment = await tx.department.findFirst({ where: { code: finalCode } });
      if (oldDepartment) {
        await snapshotDepartment(finalCode, userId, tx);
        await tx.department.update({
          where: { id: oldDepartment.id },
          data: {
            name: input.name,
            editedBy: userId,
            editedAt: new Date(),
            version: { increment: 1 },
          },
        });
      } else {
        await tx.department.create({ data: { code: finalCode, name: input.name, level: 1 } });
      }
    }

    return { success: true as const };
  });
}

export async function deleteDepartmentCode(code: string) {
  const department = await prisma.department.findFirst({ where: { code } });
  if (!department) {
    return { success: false as const, status: 404, error: "部门不存在" };
  }

  const epCount = await prisma.eDP.count({ where: { departmentId: department.id } });
  if (epCount > 0) {
    return { success: false as const, status: 400, error: `该部门下有 ${epCount} 名员工，无法删除` };
  }

  await prisma.department.delete({ where: { id: department.id } });
  return { success: true as const };
}
