import { authorize, type AuthorizeAction } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  buildInvestorDueDiligenceArchiveCommand,
  buildInvestorDueDiligenceCreateCommand,
  buildInvestorDueDiligenceUpdateCommand,
  buildInvestorShareholderProfileUpdateCommand,
} from "./domain/investor-relations-validation";

const RESOURCE_KEY = "capitalSecurities.investors";

class StaleInvestorRelationshipError extends Error {}

async function can(userId: number, action: AuthorizeAction) {
  return authorize({ user: userId, resourceKey: RESOURCE_KEY, action });
}

function mapWriteError(error: unknown) {
  if (error instanceof StaleInvestorRelationshipError) {
    return serviceError("记录已发生变化，请刷新后重试", 409);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return serviceError("关联的公司或股东已失效，请刷新后重试", 409);
  }
  throw error;
}

export async function updateInvestorShareholderProfile(command: {
  userId: number;
  issuerCompanyId: number;
  shareholderPartyId: number;
  expectedVersion: number | null;
  body: Record<string, unknown>;
}) {
  if (!(await can(command.userId, "update"))) return serviceError("无权限", 403);
  const validated = buildInvestorShareholderProfileUpdateCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const shareholderExists = await prisma.shareCapitalEvent.findFirst({
    where: {
      issuerCompanyId: validated.data.issuerCompanyId,
      OR: [
        { transactions: { some: { OR: [
          { fromPartyId: validated.data.shareholderPartyId },
          { toPartyId: validated.data.shareholderPartyId },
        ] } } },
        { snapshotPositions: { some: { partyId: validated.data.shareholderPartyId } } },
      ],
    },
    select: { id: true },
  });
  if (!shareholderExists) return serviceError("该主体不在目标公司的股权事件账本中", 404);

  try {
    const record = await prisma.$transaction(async (tx) => {
      const current = await tx.investorShareholderProfile.findUnique({
        where: {
          issuerCompanyId_shareholderPartyId: {
            issuerCompanyId: validated.data.issuerCompanyId,
            shareholderPartyId: validated.data.shareholderPartyId,
          },
        },
      });
      if (!current) {
        if (validated.data.expectedVersion !== null) throw new StaleInvestorRelationshipError();
        return tx.investorShareholderProfile.create({
          data: {
            issuerCompanyId: validated.data.issuerCompanyId,
            shareholderPartyId: validated.data.shareholderPartyId,
            ...validated.data.data,
            editedBy: command.userId,
            editedAt: new Date(),
          },
        });
      }
      if (validated.data.expectedVersion !== current.version) throw new StaleInvestorRelationshipError();
      const updated = await tx.investorShareholderProfile.updateMany({
        where: { id: current.id, version: current.version },
        data: {
          ...validated.data.data,
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new StaleInvestorRelationshipError();
      return tx.investorShareholderProfile.findUniqueOrThrow({ where: { id: current.id } });
    });
    return serviceOk({ record });
  } catch (error) {
    return mapWriteError(error);
  }
}

export async function createInvestorDueDiligenceRecord(command: {
  userId: number;
  issuerCompanyId: number;
  idempotencyKey: string;
  body: Record<string, unknown>;
}) {
  if (!(await can(command.userId, "create"))) return serviceError("无权限", 403);
  const validated = buildInvestorDueDiligenceCreateCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const existing = await prisma.investorDueDiligenceRecord.findUnique({
    where: { sourceKey: validated.data.idempotencyKey! },
  });
  if (existing) return serviceOk({ record: existing });
  const referencesValid = await validateReferences(
    validated.data.issuerCompanyId,
    validated.data.data.investorPartyId,
  );
  if (!referencesValid.ok) return referencesValid.result;
  try {
    const record = await prisma.investorDueDiligenceRecord.create({
      data: {
        sourceKey: validated.data.idempotencyKey!,
        issuerCompanyId: validated.data.issuerCompanyId,
        ...validated.data.data,
        editedBy: command.userId,
        editedAt: new Date(),
      },
    });
    return serviceOk({ record });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const record = await prisma.investorDueDiligenceRecord.findUnique({
        where: { sourceKey: validated.data.idempotencyKey! },
      });
      if (record) return serviceOk({ record });
    }
    return mapWriteError(error);
  }
}

export async function updateInvestorDueDiligenceRecord(command: {
  userId: number;
  id: number;
  issuerCompanyId: number;
  expectedVersion: number;
  body: Record<string, unknown>;
}) {
  if (!(await can(command.userId, "update"))) return serviceError("无权限", 403);
  const validated = buildInvestorDueDiligenceUpdateCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const referencesValid = await validateReferences(
    validated.data.issuerCompanyId,
    validated.data.data.investorPartyId,
  );
  if (!referencesValid.ok) return referencesValid.result;
  try {
    const updated = await prisma.investorDueDiligenceRecord.updateMany({
      where: {
        id: validated.data.id!,
        issuerCompanyId: validated.data.issuerCompanyId,
        version: validated.data.expectedVersion!,
        isArchived: false,
      },
      data: {
        ...validated.data.data,
        editedBy: command.userId,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new StaleInvestorRelationshipError();
    const record = await prisma.investorDueDiligenceRecord.findUniqueOrThrow({
      where: { id: validated.data.id! },
    });
    return serviceOk({ record });
  } catch (error) {
    return mapWriteError(error);
  }
}

export async function archiveInvestorDueDiligenceRecord(command: {
  userId: number;
  id: number;
  expectedVersion: number;
}) {
  if (!(await can(command.userId, "delete"))) return serviceError("无权限", 403);
  const validated = buildInvestorDueDiligenceArchiveCommand(command);
  if (!validated.ok) return serviceError(validated.issue.message, validated.issue.status);
  const result = await guardedDelete({
    entityType: "InvestorDueDiligenceRecord",
    modelKey: "investorDueDiligenceRecord",
    id: validated.data.id,
    userId: command.userId,
    actionLabel: "移除尽调记录",
    deleteMode: "archive",
    expectedVersion: validated.data.expectedVersion,
    auditPolicy: "none",
    referencePolicy: "none",
  });
  return result.ok
    ? serviceOk({ success: true })
    : serviceError(result.error, result.status ?? 400);
}

async function validateReferences(issuerCompanyId: number, investorPartyId: number | null) {
  const [company, party] = await Promise.all([
    prisma.company.findUnique({ where: { id: issuerCompanyId }, select: { id: true } }),
    investorPartyId
      ? prisma.party.findUnique({ where: { id: investorPartyId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!company) return { ok: false as const, result: serviceError("目标公司不存在", 404) };
  if (investorPartyId && !party) return { ok: false as const, result: serviceError("关联股东不存在", 404) };
  return { ok: true as const };
}
