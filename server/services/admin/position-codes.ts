import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getCodePoolCode } from "@/server/services/hr/company-directory";

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
    const pos = await prisma.position.findFirst({ where: { code: positionCode } });
    if (!pos) return { departments: [] };
    const dept = pos.departmentId
      ? await prisma.department.findUnique({ where: { id: pos.departmentId }, select: { name: true } })
      : null;
    return { departments: dept ? [dept.name] : [] };
  }

  const codes = opts.companys
    ? opts.companys.split(",")
    : opts.company
      ? [opts.company]
      : [];

  let positionIds: number[] | undefined;
  if (opts.departmentCode) {
    const dept = await prisma.department.findFirst({ where: { code: opts.departmentCode } });
    if (dept) {
      const positions = await prisma.position.findMany({
        where: { departmentId: dept.id },
        select: { id: true },
      });
      positionIds = positions.map((p) => p.id);
    }
    if (!positionIds || positionIds.length === 0) {
      return { codes: [] };
    }
  }

  const where: Prisma.PositionWhereInput = {};
  if (codes.length > 0) {
    where.OR = codes.map((cc: string) => ({ code: { startsWith: cc } }));
  }
  if (positionIds) {
    where.id = { in: positionIds };
  }
  const result = await prisma.position.findMany({ where, orderBy: { code: "asc" } });
  const filtered = result.filter((r) => /^\d{5}$/.test(r.code));
  return { codes: filtered.map((r) => ({ code: r.code, name: r.name })) };
}

export async function upsertPositionCode(
  body: { code: string; name: string; company?: string; originalCode?: string; departmentCode?: string },
  userId: number
) {
  const { code, name, company, originalCode, departmentCode } = body;
  const finalCode = await buildFullCode(code, company || "");

  return prisma.$transaction(async (tx) => {
    if (originalCode && originalCode !== finalCode) {
      const existing = await tx.position.findFirst({ where: { code: finalCode } });
      if (existing) throw new Error("编号已存在");
      const oldPos = await tx.position.findFirst({ where: { code: originalCode } });
      if (oldPos) {
        const maxVer = await tx.editHistory.findFirst({
          where: { entityType: "Position", entityId: originalCode },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        await tx.editHistory.create({
          data: {
            entityType: "Position",
            entityId: originalCode,
            version: (maxVer?.version || 0) + 1,
            dataJson: JSON.stringify(oldPos),
            editedBy: userId,
          },
        });
      }
      await tx.position.update({
        where: { code: originalCode } as unknown as Prisma.PositionWhereUniqueInput,
        data: { code: finalCode, name, editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
      });
    } else {
      const oldPos = await tx.position.findFirst({ where: { code: finalCode } });
      if (oldPos) {
        const maxVer = await tx.editHistory.findFirst({
          where: { entityType: "Position", entityId: finalCode },
          orderBy: { version: "desc" },
          select: { version: true },
        });
        await tx.editHistory.create({
          data: {
            entityType: "Position",
            entityId: finalCode,
            version: (maxVer?.version || 0) + 1,
            dataJson: JSON.stringify(oldPos),
            editedBy: userId,
          },
        });
      }
      const data: Prisma.PositionUpdateInput = { name, editedBy: userId, editedAt: new Date(), version: { increment: 1 } };
      const create: Prisma.PositionCreateInput = { code: finalCode, name };
      if (departmentCode) {
        const dept = await tx.department.findFirst({ where: { code: departmentCode } });
        if (dept) {
          data.department = { connect: { id: dept.id } };
          create.department = { connect: { id: dept.id } };
        }
      }
      await tx.position.upsert({
        where: { code: finalCode } as unknown as Prisma.PositionWhereUniqueInput,
        update: data,
        create,
      });
    }
    return { success: true };
  });
}

export async function deletePositionCode(code: string) {
  const pos = await prisma.position.findFirst({ where: { code } });
  if (!pos) throw new Error("岗位不存在");
  const epCount = await prisma.eDP.count({ where: { positionId: pos.id } });
  if (epCount > 0) {
    throw new Error(`该岗位下有 ${epCount} 名员工，无法删除`);
  }
  await prisma.position.delete({ where: { id: pos.id } });
  return { success: true };
}
