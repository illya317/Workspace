import { randomUUID } from "node:crypto";

import { Prisma } from "@workspace/platform/server/prisma";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";

import {
  assertPositionDescriptionRevisionDraft,
  type PositionDescriptionUpdateCommand,
} from "./domain/position-description-validation";
import { nextPositionDescriptionRevision } from "./domain/position-description-revision-validation";
import { syncPositionDescriptionResponsibilityNodesInTx } from "./position-responsibility-nodes";

export type PositionDescriptionRevisionDraft = {
  positionPurpose: string | null;
  summary: string | null;
  headcount: number | null;
  version: string | null;
  effectiveDate: string | null;
  sourceFile: string;
  details?: string | null;
};

function responsibilityProjection(descriptionId: number, revision: {
  id: number;
  revisionUid: string;
  details: string | null;
  version: string | null;
  createdAt: Date;
}) {
  return {
    id: descriptionId,
    revisionId: revision.id,
    revisionUid: revision.revisionUid,
    details: revision.details,
    version: revision.version,
    updatedAt: revision.createdAt,
  };
}

export async function createPositionDescriptionInTx(
  tx: Prisma.TransactionClient,
  draft: PositionDescriptionRevisionDraft | null | undefined,
  userId: number,
) {
  assertPositionDescriptionRevisionDraft(draft);
  const description = await tx.positionDescription.create({
    data: { createdBy: userId },
    select: { id: true },
  });
  const revision = await tx.positionDescriptionRevision.create({
    data: {
      revisionUid: randomUUID(),
      positionDescriptionId: description.id,
      sequence: 1,
      changeKind: "initial",
      positionPurpose: draft?.positionPurpose ?? null,
      summary: draft?.summary ?? null,
      headcount: draft?.headcount ?? null,
      version: draft?.version ?? null,
      effectiveDate: draft?.effectiveDate ?? null,
      sourceFile: draft?.sourceFile ?? "",
      details: draft?.details ?? "{}",
      createdBy: userId,
    },
    select: { id: true, revisionUid: true, sequence: true, details: true, version: true, createdAt: true },
  });
  await syncPositionDescriptionResponsibilityNodesInTx(tx, responsibilityProjection(description.id, revision));
  return { ...description, revision };
}

export async function appendPositionDescriptionRevision(
  command: PositionDescriptionUpdateCommand,
  userId: number,
): Promise<ServiceResult<{ success: true; positionDescription: unknown }>> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.positionDescriptionRevision.findUnique({
        where: { revisionUid: command.revisionUid },
        select: { id: true, positionDescriptionId: true, sequence: true },
      });
      if (receipt) {
        if (receipt.positionDescriptionId !== command.id) {
          return { ok: false, error: "幂等键已用于其他岗位说明书", status: 409 } as const;
        }
        return { ok: true, receipt } as const;
      }

      const description = await tx.positionDescription.findUnique({
        where: { id: command.id },
        select: { id: true },
      });
      if (!description) return { ok: false, error: "岗位说明书不存在", status: 404 } as const;

      const latest = await tx.positionDescriptionRevision.findFirst({
        where: { positionDescriptionId: command.id },
        orderBy: { sequence: "desc" },
        select: { id: true, sequence: true, details: true },
      });
      if (!latest) {
        return { ok: false, error: "岗位说明书已产生新修订，请刷新后重试", status: 409 } as const;
      }
      const next = nextPositionDescriptionRevision({
        latest,
        expectedSequence: command.expectedSequence,
        changeKind: command.changeKind,
      });
      if (!next.ok) return { ok: false, error: next.error, status: 409 } as const;

      const revision = await tx.positionDescriptionRevision.create({
        data: {
          revisionUid: command.revisionUid,
          positionDescriptionId: command.id,
          sequence: next.sequence,
          changeKind: command.changeKind,
          supersedesRevisionId: next.supersedesRevisionId,
          ...command.revision,
          details: command.revision.details === undefined ? latest.details : command.revision.details,
          changeReason: command.changeReason,
          createdBy: userId,
        },
        select: {
          id: true,
          revisionUid: true,
          sequence: true,
          changeKind: true,
          effectiveDate: true,
          details: true,
          version: true,
          createdAt: true,
        },
      });
      await syncPositionDescriptionResponsibilityNodesInTx(tx, responsibilityProjection(command.id, revision));
      return { ok: true, revision } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result.ok) return serviceError(result.error, result.status);
    return serviceOk({
      success: true,
      positionDescription: "receipt" in result ? result.receipt : result.revision,
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("岗位说明书修订冲突，请刷新后重试", 409);
    }
    throw error;
  }
}
