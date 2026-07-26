import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";

import { getCodePoolCode } from "@workspace/platform/server/company-directory";
import {
  buildDepartmentCodeDeleteCommand,
  buildDepartmentCodeSaveCommand,
} from "./domain/code-governance-validation";
import { validateDepartmentDelete } from "./domain/department-validation";

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
  const command = buildDepartmentCodeSaveCommand(input, userId);
  if (!command.ok) return { success: false as const, status: command.issue.status, error: command.issue.message };
  const finalCode = await buildFullCode(command.data.code, command.data.company || "");
  input = command.data;

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
  const command = buildDepartmentCodeDeleteCommand(code, userId);
  if (!command.ok) return { success: false as const, status: command.issue.status, error: command.issue.message };
  code = command.data.code;
  const department = await prisma.department.findFirst({ where: { code }, select: { id: true } });
  if (!department) return { success: false as const, status: 404, error: "部门不存在" };
  const result = await guardedDelete({
    entityType: "Department",
    modelKey: "department",
    id: department.id,
    userId,
    actionLabel: "删除部门",
    deleteMode: "hard",
    onBeforeDelete: async (id) => {
      const validation = await validateDepartmentDelete(id, "删除部门");
      return validation.ok ? { ok: true as const } : { error: validation.issue.message, status: validation.issue.status };
    },
  });
  return result.ok
    ? { success: true as const }
    : { success: false as const, status: result.status || 400, error: result.error };
}
