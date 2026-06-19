import { Prisma } from "@workspace/platform/server/prisma";
import { snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { getInitials } from "@workspace/core/search";
import { getManagementGroupByCode } from "./company-directory";

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

interface PositionDescriptionUpdateInput {
  id?: unknown;
  code?: unknown;
  name?: unknown;
  departmentName?: unknown;
  reportTo?: unknown;
  positionPurpose?: unknown;
  summary?: unknown;
  headcount?: unknown;
  version?: unknown;
  effectiveDate?: unknown;
  sourceFile?: unknown;
  details?: unknown;
}

function nullableText(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function parseDetails(details: string | null) {
  if (!details) return null;
  try {
    return JSON.parse(details) as unknown;
  } catch {
    return null;
  }
}

export async function getPositionDescriptionTree() {
  const departments = await prisma.department.findMany({
    where: {},
    select: { id: true, code: true, name: true, level: true, parentId: true },
    orderBy: { code: "asc" },
  });
  const deptMap: Record<string, {
    code: string;
    name: string;
    level: number;
    parentCode: string | null;
    positions: string[];
    ownPositions?: string[];
  }> = {};
  for (const department of departments) {
    const parent = departments.find((item) => item.id === department.parentId);
    deptMap[department.code] = {
      code: department.code,
      name: department.name,
      level: department.level,
      parentCode: parent?.code || null,
      positions: [],
    };
  }

  const descriptions = await prisma.positionDescription.findMany({
    select: { code: true, name: true },
    orderBy: { code: "asc" },
  });
  for (const description of descriptions) {
    const departmentCode = description.code.split("-")[1] || "";
    let match: string | null = null;
    for (const key of Object.keys(deptMap).sort((a, b) => b.length - a.length)) {
      if (departmentCode.startsWith(key)) {
        match = key;
        break;
      }
    }
    if (match && deptMap[match]) deptMap[match].positions.push(`${description.code}|${description.name}`);
  }

  function subtreePositions(deptCode: string): string[] {
    const all = [...deptMap[deptCode].positions];
    for (const department of Object.values(deptMap)) {
      if (department.parentCode === deptCode) all.push(...subtreePositions(department.code));
    }
    return [...new Set(all)].sort();
  }
  for (const department of Object.values(deptMap)) {
    department.ownPositions = department.positions;
    department.positions = subtreePositions(department.code);
  }
  return { tree: Object.values(deptMap) };
}

export async function getPositionDescriptionByCode(code: string) {
  const description = await prisma.positionDescription.findUnique({ where: { code } });
  if (!description) return { ok: false as const, error: "未找到", status: 404 };
  return {
    ok: true as const,
    data: {
      positionDescription: {
        id: description.id,
        code: description.code,
        name: description.name,
        departmentName: description.departmentName,
        reportTo: description.reportTo,
        positionPurpose: description.positionPurpose,
        summary: description.summary,
        headcount: description.headcount,
        version: description.version,
        effectiveDate: description.effectiveDate,
        sourceFile: description.sourceFile,
        managementGroup: await getManagementGroupByCode(description.code),
        details: parseDetails(description.details),
      },
    },
  };
}

export async function listPositionDescriptions(search: string) {
  const descriptions = await prisma.positionDescription.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      departmentName: true,
      reportTo: true,
      positionPurpose: true,
      version: true,
      effectiveDate: true,
    },
    orderBy: { code: "asc" },
  });

  let result = descriptions;
  if (search) {
    const q = search.toLowerCase();
    result = descriptions.filter((description) =>
      description.code.toLowerCase().includes(q) ||
      description.name.toLowerCase().includes(q) ||
      (description.departmentName || "").toLowerCase().includes(q) ||
      getInitials(description.name).includes(q)
    );
  }
  return { positionDescriptions: result, total: result.length };
}

export async function updatePositionDescription(
  input: PositionDescriptionUpdateInput,
  userId: number,
): Promise<ServiceResult<{ success: true; positionDescription: unknown }>> {
  if (!input.id) return { ok: false, error: "缺少id" };
  if (!input.code || !input.name) return { ok: false, error: "说明书编码和名称不能为空" };

  const headcountValue = input.headcount === null || input.headcount === undefined || input.headcount === "" ? null : Number(input.headcount);
  if (headcountValue === null || !Number.isInteger(headcountValue) || headcountValue < 1) {
    return { ok: false, error: "编制必须是正整数" };
  }

  let detailsText: string | null = null;
  if (input.details !== undefined && input.details !== null && input.details !== "") {
    try {
      const parsed = typeof input.details === "string" ? JSON.parse(input.details) : input.details;
      detailsText = JSON.stringify(parsed);
    } catch {
      return { ok: false, error: "说明书 JSON 不是合法格式" };
    }
  }

  try {
    const updated = await prisma.positionDescription.update({
      where: { id: Number(input.id) },
      data: {
        code: String(input.code).trim(),
        name: String(input.name).trim(),
        departmentName: nullableText(input.departmentName),
        reportTo: nullableText(input.reportTo),
        positionPurpose: nullableText(input.positionPurpose),
        summary: nullableText(input.summary),
        headcount: headcountValue,
        version: nullableText(input.version),
        effectiveDate: nullableText(input.effectiveDate),
        sourceFile: input.sourceFile ? String(input.sourceFile) : "",
        details: detailsText,
        editedBy: userId,
        editedAt: new Date(),
      },
    });
    await snapshotHistory("PositionDescription", Number(input.id), userId);
    return { ok: true, data: { success: true, positionDescription: updated } };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "说明书编码已存在", status: 409 };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, error: "岗位说明书不存在", status: 404 };
    }
    throw error;
  }
}
