import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { getPublishedHrPositionDescriptionOfficialTemplate } from "@workspace/platform/server/docs-editor";
import { prisma } from "@workspace/platform/server/prisma";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { parseBusinessDate } from "@workspace/platform/contracts/business-temporal";
import { matchSearchFields } from "@workspace/platform/search";
import { getManagementGroupByCode } from "@workspace/platform/server/company-directory";
import {
  buildPositionDescriptionUpdateCommand,
  type PositionDescriptionUpdateInput,
} from "./domain/position-description-validation";
import {
  appendPositionDescriptionRevision,
} from "./position-description-revision-service";
import { pickPositionDescriptionRevisionAsOf } from "./domain/position-description-revision";

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
  asOf?: string;
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
          revisions: {
            orderBy: [{ effectiveDate: { sort: "desc", nulls: "last" } }, { sequence: "desc" }],
            select: {
              id: true,
              revisionUid: true,
              sequence: true,
              changeKind: true,
              positionPurpose: true,
              summary: true,
              headcount: true,
              version: true,
              effectiveDate: true,
              sourceFile: true,
              details: true,
              changeReason: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
}

export async function getPositionDescription(lookup: PositionDescriptionLookup) {
  const position = await findPositionWithDescription(lookup);
  const description = position?.positionDescription;
  if (!position || !description) return serviceError("未找到", 404);
  const asOfDate = lookup.asOf ? parseBusinessDate(lookup.asOf) : workspaceBusinessDate(new Date());
  if (!asOfDate) return serviceError("截至业务日必须是合法 YYYY-MM-DD 日期", 400);
  const revision = pickPositionDescriptionRevisionAsOf(description.revisions, asOfDate);
  const revisions = description.revisions.map((item) => ({
    id: item.id,
    revisionUid: item.revisionUid,
    sequence: item.sequence,
    changeKind: item.changeKind,
    effectiveDate: item.effectiveDate,
    version: item.version,
    changeReason: item.changeReason,
    createdAt: item.createdAt.toISOString(),
    temporalState: item.id === revision?.id ? "current" : item.effectiveDate && item.effectiveDate > asOfDate ? "upcoming" : "history",
    recordState: "published",
  }));
  if (!revision) return serviceOk({
    positionDescription: null,
    asOfDate,
    revisions,
    template: await getPublishedPositionDescriptionTemplate(),
  });
  return serviceOk({
    positionDescription: {
      id: description.id,
      revisionId: revision.id,
      sequence: revision.sequence,
      code: position.code,
      name: position.name,
      departmentName: position.department?.name || null,
      reportTo: position.reportToPosition?.name || null,
      reportToPositionId: position.reportToPositionId,
      positionPurpose: revision.positionPurpose,
      summary: revision.summary,
      headcount: revision.headcount,
      version: revision.version,
      effectiveDate: revision.effectiveDate,
      sourceFile: revision.sourceFile,
      managementGroup: await getManagementGroupByCode(position.code),
      details: parseDetails(revision.details),
    },
    asOfDate,
    revisions,
    template: await getPublishedPositionDescriptionTemplate(),
  });
}

export async function listPositionDescriptions(search: string) {
  const asOfDate = workspaceBusinessDate(new Date());
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
          revisions: {
            where: { OR: [{ effectiveDate: null }, { effectiveDate: { lte: asOfDate } }] },
            orderBy: [{ effectiveDate: { sort: "desc", nulls: "last" } }, { sequence: "desc" }],
            take: 1,
            select: {
              sequence: true,
              positionPurpose: true,
              version: true,
              effectiveDate: true,
            },
          },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  let result = positions.map((position) => {
    const revision = position.positionDescription?.revisions[0] ?? null;
    return {
      id: position.positionDescription?.id ?? position.id,
      code: position.code,
      name: position.name,
      departmentName: position.department?.name || null,
      reportTo: position.reportToPosition?.name || null,
      positionPurpose: revision?.positionPurpose || null,
      version: revision?.version || null,
      sequence: revision?.sequence ?? null,
      effectiveDate: revision?.effectiveDate || null,
    };
  });
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

  return appendPositionDescriptionRevision(command.data, userId);
}
