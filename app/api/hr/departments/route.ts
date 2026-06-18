import { NextResponse } from "next/server";

import { withHRAccess, withHRWrite, withHRDelete } from "@/lib/with-auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { matchAnyField } from "@/lib/search-schema";
import { snapshotHistory } from "@/lib/history";
import { loadCompanyMap, getCompanyNameSync } from "@/server/services/hr/company-directory";

function parseDetails(details: string | null) {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function departmentPrefix(code: string) {
  const prefix = code.slice(0, 3);
  return /^[A-Z]{3}$/.test(prefix) ? prefix : "";
}

function departmentNumber(code: string) {
  const suffix = code.slice(3);
  return /^\d+$/.test(suffix) ? suffix : "";
}

async function validateDepartmentCreate(input: {
  code: unknown;
  name: unknown;
  level: unknown;
  parentId: unknown;
}) {
  const code = String(input.code || "").trim();
  const name = String(input.name || "").trim();
  const level = Number(input.level || 1);
  const parentId = input.parentId == null || input.parentId === "" ? null : Number(input.parentId);
  if (!name) return { error: "部门名不能为空" } as const;
  if (![1, 2, 3].includes(level)) return { error: "部门层级不合法" } as const;
  if (await prisma.department.findFirst({ where: { code }, select: { id: true } })) {
    return { error: "部门编码已存在", status: 409 } as const;
  }
  if (level === 1) {
    if (!/^[A-Z]{3}001$/.test(code)) return { error: "L1 部门编码必须是 3 位大写字母加 001" } as const;
    return { data: { code, name, level, parentId: null } } as const;
  }
  if (!parentId || !Number.isInteger(parentId)) return { error: `L${level} 部门必须选择上级部门` } as const;
  const parent = await prisma.department.findUnique({ where: { id: parentId }, select: { code: true, level: true } });
  if (!parent) return { error: "上级部门不存在" } as const;
  if (parent.level !== level - 1) return { error: `L${level} 部门只能挂在 L${level - 1} 部门下` } as const;
  const prefix = departmentPrefix(parent.code);
  if (!prefix || !code.startsWith(prefix)) return { error: "部门编码必须继承上级部门前缀" } as const;
  const number = departmentNumber(code);
  if (!number) return { error: `L${level} 编码必须是前缀后接纯数字` } as const;
  if (level === 2) {
    if (!/^[1-9]\d*00$/.test(number)) return { error: "L2 编码数字段必须为正整数并以 00 结尾" } as const;
  } else {
    const parentNumber = departmentNumber(parent.code);
    if (!parentNumber.endsWith("00")) return { error: "上级 L2 编码不合法" } as const;
    const tail = number.slice(-2);
    if (number.length !== parentNumber.length || number.slice(0, -2) !== parentNumber.slice(0, -2) || tail === "00") {
      return { error: `L3 编码必须只替换 ${parentNumber} 的最后两位` } as const;
    }
  }
  return { data: { code, name, level, parentId } } as const;
}

export const GET = withHRAccess(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("keyword") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

  const where: Prisma.DepartmentWhereInput = {};

  const [depts, companyMap] = await Promise.all([
    prisma.department.findMany({
      where,
      include: {
        _count: { select: { edps: true } },
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        descriptions: {
          select: {
            id: true,
            code: true,
            name: true,
            sourceFile: true,
            codeRaw: true,
            details: true,
          },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { id: "asc" },
    }),
    loadCompanyMap(),
  ]);

  let departments = depts.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    alias: d.alias || null,
    company: getCompanyNameSync(companyMap, d.code),
    level: d.level,
    levelLabel: d.level === 1 ? '事业部' : d.level === 2 ? '部门' : '子部门',
    parentId: d.parentId,
    parentName: d.parent?.name || null,
    managerUserId: d.managerUserId,
    managerName: d.manager?.name || null,
    headcount: d._count.edps,
    children: d.children.map((c) => ({ id: c.id, name: c.name })),
    descriptions: d.descriptions.map((description) => ({
      id: description.id,
      code: description.code,
      name: description.name,
      sourceFile: description.sourceFile,
      codeRaw: description.codeRaw,
      details: parseDetails(description.details),
    })),
  }));
  if (keyword) departments = departments.filter((d) => matchAnyField(d, keyword, "Department"));

  const total = departments.length;
  const start = (page - 1) * pageSize;
  const paged = departments.slice(start, start + pageSize);
  return NextResponse.json({ departments: paged, total });
});

export const POST = withHRWrite(async (request: Request, user) => {
  const body = await request.json();
  const validation = await validateDepartmentCreate(body);
  if ("error" in validation) return NextResponse.json({ error: validation.error }, { status: "status" in validation ? validation.status : 400 });
  try {
    const record = await prisma.department.create({
      data: { ...validation.data, editedBy: user.userId },
    });
    await snapshotHistory("Department", record.id, user.userId);
    return NextResponse.json({ success: true, record });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") return NextResponse.json({ error: "上级部门不存在" }, { status: 400 });
    throw e;
  }
});

export const PUT = withHRWrite(async (request: Request, user) => {
  const body = await request.json();
  const { id, code, name, alias, level, parentId, managerUserId, descriptions } = body;

  if (!id) {
    return NextResponse.json({ error: "缺少id" }, { status: 400 });
  }

  const data: Prisma.DepartmentUncheckedUpdateInput = {};
  if (code !== undefined) data.code = code;
  if (name !== undefined) data.name = name;
  if (alias !== undefined) data.alias = alias || null;
  if (level !== undefined) data.level = level;
  if (parentId !== undefined) data.parentId = parentId || null;
  if (managerUserId !== undefined) data.managerUserId = managerUserId || null;
  data.editedBy = user.userId;
  data.editedAt = new Date();
  data.version = { increment: 1 };

  let descriptionDataList: Array<{
    id?: number;
    code: string;
    name: string;
    sourceFile: string;
    codeRaw?: string | null;
    details?: string | null;
  }> | null = null;

  if (descriptions !== undefined && descriptions !== null) {
    if (!Array.isArray(descriptions)) {
      return NextResponse.json({ error: "部门说明书格式错误" }, { status: 400 });
    }
    descriptionDataList = [];
    for (const description of descriptions) {
      if (!description.code || !description.name) {
        return NextResponse.json({ error: "部门说明书编码和名称不能为空" }, { status: 400 });
      }
      let detailsText: string | null = null;
      if (description.details !== undefined && description.details !== null && description.details !== "") {
        try {
          const parsed = typeof description.details === "string" ? JSON.parse(description.details) : description.details;
          detailsText = JSON.stringify(parsed);
        } catch {
          return NextResponse.json({ error: "部门说明书 JSON 不是合法格式" }, { status: 400 });
        }
      }
      descriptionDataList.push({
        id: description.id ? Number(description.id) : undefined,
        code: String(description.code).trim(),
        name: String(description.name).trim(),
        sourceFile: description.sourceFile ? String(description.sourceFile).trim() : "",
        codeRaw: description.codeRaw ? String(description.codeRaw).trim() : null,
        details: detailsText,
      });
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const department = await tx.department.update({
        where: { id },
        data,
      });
      if (descriptionDataList) {
        for (const descriptionData of descriptionDataList) {
          if (descriptionData.id) {
            await tx.departmentDescription.update({
              where: { id: descriptionData.id },
              data: {
                code: descriptionData.code,
                name: descriptionData.name,
                sourceFile: descriptionData.sourceFile,
                codeRaw: descriptionData.codeRaw,
                details: descriptionData.details,
                editedBy: user.userId,
                editedAt: new Date(),
              },
            });
          } else {
            await tx.departmentDescription.create({
              data: {
                departmentId: id,
                code: descriptionData.code,
                name: descriptionData.name,
                sourceFile: descriptionData.sourceFile,
                codeRaw: descriptionData.codeRaw,
                details: descriptionData.details,
                editedBy: user.userId,
                editedAt: new Date(),
              },
            });
          }
        }
      }
      return department;
    });
    await snapshotHistory("Department", id, user.userId);
    return NextResponse.json({ success: true, department: updated });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ error: "编码已存在" }, { status: 409 });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return NextResponse.json({ error: "部门不存在" }, { status: 404 });
    throw e;
  }
});

export const DELETE = withHRDelete(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少id" }, { status: 400 });
  try {
    await prisma.department.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return NextResponse.json({ error: "部门不存在" }, { status: 404 });
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") return NextResponse.json({ error: "该部门下有关联岗位，无法删除" }, { status: 409 });
    throw e;
  }
});
