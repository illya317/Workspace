import { serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { prisma } from "@workspace/platform/server/prisma";
import {
  buildPositionReportOverrideSaveCommand,
  validateReportOverrideSourcePosition,
  type PositionReportOverrideInput,
} from "./domain/position-report-override-validation";

type PositionReportOverrideRecord = {
  id: number;
  positionId: number;
  companyId: number;
  company: { code: string; party: { name: string } } | null;
  departmentId: number;
  department: {
    code: string;
    name: string;
    parent: { code: string; name: string; parent: { code: string; name: string } | null } | null;
  };
  reportToPositionId: number | null;
  reportToPosition: { name: string } | null;
  headcount: number | null;
  isActive: boolean;
  _count: { edps: number };
};

export async function listPositionReportOverrides(positionId: number) {
  const source = mapValidationToServiceResult(await validateReportOverrideSourcePosition(positionId, { strict: false }));
  if (!source.ok) return source;

  const overrides = await prisma.positionReportOverride.findMany({
    where: { positionId },
    include: {
      company: { select: { id: true, code: true, party: { select: { name: true } } } },
      department: {
        select: {
          id: true,
          code: true,
          name: true,
          hierarchyKind: true,
          isArchived: true,
          parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
        },
      },
      reportToPosition: { select: { id: true, code: true, name: true } },
      _count: { select: { edps: true } },
    },
    orderBy: [{ company: { code: "asc" } }, { department: { code: "asc" } }, { id: "asc" }],
  });

  return {
    position: source.data.position,
    isFunctionalPosition: source.data.functional,
    overrides: overrides.map(toPositionReportOverrideDto),
  };
}

function toPositionReportOverrideDto(override: PositionReportOverrideRecord) {
  return {
    id: override.id,
    positionId: override.positionId,
    companyId: override.companyId,
    companyCode: override.company?.code ?? null,
    companyName: override.company?.party.name ?? null,
    departmentId: override.departmentId,
    departmentCode: override.department.code,
    departmentName: override.department.name,
    departmentPath: override.department.name,
    reportToPositionId: override.reportToPositionId,
    reportToPositionName: override.reportToPosition?.name ?? null,
    headcount: override.headcount,
    isActive: override.isActive,
    edpCount: override._count.edps,
  };
}

export async function savePositionReportOverrides(
  input: { positionId: number; overrides: PositionReportOverrideInput[] },
  userId: number,
): Promise<ServiceResult<{ success: true }>> {
  const command = mapValidationToServiceResult(await buildPositionReportOverrideSaveCommand(input));
  if (!command.ok) return command;

  await prisma.$transaction(async (tx) => {
    if (command.data.deleteIds.length > 0) {
      await tx.positionReportOverride.deleteMany({ where: { id: { in: command.data.deleteIds } } });
    }

    for (const override of command.data.overrides) {
      await tx.positionReportOverride.upsert({
        where: {
          positionId_companyId_departmentId: {
            positionId: command.data.positionId,
            companyId: override.companyId,
            departmentId: override.departmentId,
          },
        },
        create: {
          positionId: command.data.positionId,
          companyId: override.companyId,
          departmentId: override.departmentId,
          reportToPositionId: override.reportToPositionId,
          headcount: override.headcount,
          isActive: override.isActive,
          remark: null,
          editedBy: userId,
          editedAt: new Date(),
        },
        update: {
          reportToPositionId: override.reportToPositionId,
          headcount: override.headcount,
          isActive: override.isActive,
          remark: null,
          editedBy: userId,
          editedAt: new Date(),
        },
      });
    }
  });

  return serviceOk({ success: true });
}
