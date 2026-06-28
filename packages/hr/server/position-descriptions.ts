import { Prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";
import { getManagementGroupByCode } from "./company-directory";
import {
  buildPositionDescriptionUpdateCommand,
  type PositionDescriptionUpdateInput,
} from "./domain/position-description-validation";

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
  if (!description) return serviceError("未找到", 404);
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
    result = descriptions.filter((description) => matchSearchFields(description, search, ["code", "name", "departmentName"]));
  }
  return { positionDescriptions: result, total: result.length };
}

export async function updatePositionDescription(
  input: PositionDescriptionUpdateInput,
  userId: number,
): Promise<ServiceResult<{ success: true; positionDescription: unknown }>> {
  const command = mapValidationToServiceResult(buildPositionDescriptionUpdateCommand(input));
  if (!command.ok) return command;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await ensureEditHistoryBaseline("PositionDescription", command.data.id, userId, tx);
      const positionDescription = await tx.positionDescription.update({
        where: { id: command.data.id },
        data: {
          ...command.data.data,
          editedBy: userId,
          editedAt: new Date(),
        },
      });
      await snapshotHistory("PositionDescription", command.data.id, userId, tx);
      return positionDescription;
    });
    return serviceOk({ success: true, positionDescription: updated });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("说明书编码已存在", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return serviceError("岗位说明书不存在", 404);
    }
    throw error;
  }
}
