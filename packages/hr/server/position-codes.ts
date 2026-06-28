import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { getCodePoolCode } from "./company-directory";

async function buildFullCode(code: string, company: string): Promise<string> {
  const normalized = await getCodePoolCode(company);
  if (code.length <= 3) {
    return normalized + code.padStart(3, "0");
  }
  return code;
}

export async function getPositionCodes(opts: {
  companys?: string;
  company?: string;
  departmentCode?: string;
  positionCode?: string;
}) {
  const { positionCode } = opts;

  if (positionCode) {
    const position = await prisma.position.findFirst({ where: { code: positionCode } });
    if (!position) return { departments: [] };
    const department = position.departmentId
      ? await prisma.department.findUnique({ where: { id: position.departmentId }, select: { name: true } })
      : null;
    return { departments: department ? [department.name] : [] };
  }

  const codes = opts.companys
    ? opts.companys.split(",")
    : opts.company
      ? [opts.company]
      : [];

  let positionIds: number[] | undefined;
  if (opts.departmentCode) {
    const department = await prisma.department.findFirst({ where: { code: opts.departmentCode } });
    if (department) {
      const positions = await prisma.position.findMany({
        where: { departmentId: department.id },
        select: { id: true },
      });
      positionIds = positions.map((position) => position.id);
    }
    if (!positionIds || positionIds.length === 0) {
      return { codes: [] };
    }
  }

  const where: Prisma.PositionWhereInput = {};
  if (codes.length > 0) {
    where.OR = codes.map((companyCode: string) => ({ code: { startsWith: companyCode } }));
  }
  if (positionIds) {
    where.id = { in: positionIds };
  }
  const result = await prisma.position.findMany({ where, orderBy: { code: "asc" } });
  const filtered = result.filter((position) => /^\d{5}$/.test(position.code));
  return { codes: filtered.map((position) => ({ code: position.code, name: position.name })) };
}

export async function upsertPositionCode(
  body: { code: string; name: string; company?: string; originalCode?: string; departmentCode?: string },
  userId: number,
) {
  const { code, name, company, originalCode, departmentCode } = body;
  const finalCode = await buildFullCode(code, company || "");

  return prisma.$transaction(async (tx) => {
    if (originalCode && originalCode !== finalCode) {
      const existing = await tx.position.findFirst({ where: { code: finalCode } });
      if (existing) throw new Error("编号已存在");
      const oldPosition = await tx.position.findFirst({ where: { code: originalCode } });
      if (oldPosition) {
        await ensureEditHistoryBaseline("Position", oldPosition.id, userId, tx);
        await tx.position.update({
          where: { id: oldPosition.id },
          data: { code: finalCode, name, editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
        });
        await snapshotHistory("Position", oldPosition.id, userId, tx);
      }
    } else {
      const oldPosition = await tx.position.findFirst({ where: { code: finalCode } });
      const data: Prisma.PositionUpdateInput = { name, editedBy: userId, editedAt: new Date(), version: { increment: 1 } };
      const create: Prisma.PositionCreateInput = { code: finalCode, name };
      if (departmentCode) {
        const department = await tx.department.findFirst({ where: { code: departmentCode } });
        if (department) {
          data.department = { connect: { id: department.id } };
          create.department = { connect: { id: department.id } };
        }
      }
      if (oldPosition) {
        await ensureEditHistoryBaseline("Position", oldPosition.id, userId, tx);
        await tx.position.update({
          where: { id: oldPosition.id },
          data,
        });
        await snapshotHistory("Position", oldPosition.id, userId, tx);
      } else {
        const position = await tx.position.create({ data: { ...create, editedBy: userId } });
        await snapshotHistory("Position", position.id, userId, tx);
      }
    }
    return { success: true };
  });
}

export async function deletePositionCode(code: string, userId: number) {
  return prisma.$transaction(async (tx) => {
    const position = await tx.position.findFirst({ where: { code } });
    if (!position) throw new Error("岗位不存在");
    const epCount = await tx.eDP.count({ where: { positionId: position.id } });
    if (epCount > 0) {
      throw new Error(`该岗位下有 ${epCount} 名员工，无法删除`);
    }
    await ensureEditHistoryBaseline("Position", position.id, userId, tx);
    await snapshotHistory("Position", position.id, userId, tx);
    await tx.position.delete({ where: { id: position.id } });
    return { success: true };
  });
}
