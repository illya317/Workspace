import { Prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { getPublishedHrPositionDescriptionOfficialTemplate } from "@workspace/platform/server/docs-editor";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { prisma } from "@workspace/platform/server/prisma";
import { matchSearchFields } from "@workspace/platform/search";
import { getManagementGroupByCode } from "@workspace/platform/server/company-directory";
import {
  buildPositionDescriptionUpdateCommand,
  type PositionDescriptionUpdateInput,
} from "./domain/position-description-validation";
import { syncPositionDescriptionResponsibilityNodesInTx } from "./position-responsibility-nodes";

function parseDetails(details: string | null) {
  if (!details) return null;
  try {
    return JSON.parse(details) as unknown;
  } catch {
    return null;
  }
}

async function getPublishedPositionDescriptionTemplate() {
  return getPublishedHrPositionDescriptionOfficialTemplate();
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

  const positions = await prisma.position.findMany({
    where: { positionDescriptionId: { not: null } },
    select: { code: true, name: true, department: { select: { code: true } } },
    orderBy: { code: "asc" },
  });
  for (const position of positions) {
    const departmentCode = position.department?.code || position.code.split("-")[1] || "";
    let match: string | null = null;
    for (const key of Object.keys(deptMap).sort((a, b) => b.length - a.length)) {
      if (departmentCode.startsWith(key)) {
        match = key;
        break;
      }
    }
    if (match && deptMap[match]) deptMap[match].positions.push(`${position.code}|${position.name}`);
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

type PositionDescriptionLookup = {
  id?: string;
  positionId?: string;
  code?: string;
};

function positiveId(value: string | undefined) {
  if (!value) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function findPositionWithDescription(lookup: PositionDescriptionLookup) {
  const descriptionId = positiveId(lookup.id);
  const positionId = positiveId(lookup.positionId);
  return prisma.position.findFirst({
    where: {
      ...(positionId ? { id: positionId } : {}),
      ...(lookup.code ? { code: lookup.code } : {}),
      positionDescriptionId: descriptionId ? descriptionId : { not: null },
    },
    orderBy: [{ isArchived: "asc" }, { id: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      department: { select: { name: true } },
      reportToPositionId: true,
      reportToPosition: { select: { name: true } },
      positionDescription: {
        select: {
          id: true,
          positionPurpose: true,
          summary: true,
          headcount: true,
          version: true,
          effectiveDate: true,
          sourceFile: true,
          details: true,
        },
      },
    },
  });
}

export async function getPositionDescription(lookup: PositionDescriptionLookup) {
  const position = await findPositionWithDescription(lookup);
  const description = position?.positionDescription;
  if (!position || !description) return serviceError("未找到", 404);
  return serviceOk({
    positionDescription: {
      id: description.id,
      code: position.code,
      name: position.name,
      departmentName: position.department?.name || null,
      reportTo: position.reportToPosition?.name || null,
      reportToPositionId: position.reportToPositionId,
      positionPurpose: description.positionPurpose,
      summary: description.summary,
      headcount: description.headcount,
      version: description.version,
      effectiveDate: description.effectiveDate,
      sourceFile: description.sourceFile,
      managementGroup: await getManagementGroupByCode(position.code),
      details: parseDetails(description.details),
    },
    template: await getPublishedPositionDescriptionTemplate(),
  });
}

export async function listPositionDescriptions(search: string) {
  const positions = await prisma.position.findMany({
    where: { positionDescriptionId: { not: null } },
    select: {
      id: true,
      code: true,
      name: true,
      department: { select: { name: true } },
      reportToPosition: { select: { name: true } },
      positionDescription: {
        select: {
          id: true,
          positionPurpose: true,
          version: true,
          effectiveDate: true,
        },
      },
    },
    orderBy: { code: "asc" },
  });

  let result = positions.map((position) => ({
    id: position.positionDescription?.id ?? position.id,
    code: position.code,
    name: position.name,
    departmentName: position.department?.name || null,
    reportTo: position.reportToPosition?.name || null,
    positionPurpose: position.positionDescription?.positionPurpose || null,
    version: position.positionDescription?.version || null,
    effectiveDate: position.positionDescription?.effectiveDate || null,
  }));
  if (search) {
    result = result.filter((description) => matchSearchFields(description, search, ["code", "name", "departmentName"]));
  }
  return { positionDescriptions: result, total: result.length };
}

export async function updatePositionDescription(
  input: PositionDescriptionUpdateInput,
  userId: number,
): Promise<ServiceResult<{ success: true; positionDescription: unknown }>> {
  const command = mapValidationToServiceResult(await buildPositionDescriptionUpdateCommand(input));
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
      await syncPositionDescriptionResponsibilityNodesInTx(tx, positionDescription);
      await snapshotHistory("PositionDescription", command.data.id, userId, tx);
      return positionDescription;
    });
    return serviceOk({ success: true, positionDescription: updated });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("说明书关系冲突", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return serviceError("岗位说明书不存在", 404);
    }
    throw error;
  }
}
