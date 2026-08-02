import "server-only";

import { randomUUID } from "node:crypto";

import { checkHRRead, checkHRUpdate } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import {
  EMPLOYMENT_AGREEMENT_ATTACHMENT_MAX_ACTIVE,
  EMPLOYMENT_AGREEMENT_ATTACHMENT_MAX_TOTAL_BYTES,
  buildEmploymentAgreementAttachmentRemoveCommand,
  buildEmploymentAgreementAttachmentTargetCommand,
  buildEmploymentAgreementAttachmentUploadCommand,
} from "./domain/employment-agreement-attachment-validation";
import {
  readEmploymentAgreementAttachmentFile,
  removeUncommittedEmploymentAgreementAttachment,
  storeEmploymentAgreementAttachment,
} from "./employment-agreement-attachment-storage";

async function visibleAgreement(employeeId: number, agreementUid: string) {
  return prisma.employmentAgreement.findFirst({
    where: { agreementUid, employment: { employeeId } },
    select: { id: true, recordState: true },
  });
}

export async function executeUploadEmploymentAgreementAttachment(input: unknown) {
  const built = mapValidationToServiceResult(buildEmploymentAgreementAttachmentUploadCommand(input));
  if (!built.ok) return built;
  const command = built.data;
  if (!(await checkHRUpdate(command.userId, "hr.roster"))) return serviceError("无权限", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employmentAgreementAttachment.upload",
    actorUserId: command.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "协议附件上传已配置为必须走流程，请从协议入口提交",
  });
  if (!direct.ok) return direct;
  const agreement = await visibleAgreement(command.employeeId, command.agreementUid);
  if (!agreement) return serviceError("协议不存在或不属于该员工", 404);
  if (agreement.recordState !== "confirmed") return serviceError("只有现行协议可以上传附件", 409);
  const [activeCount, totalSize] = await Promise.all([
    prisma.employmentAgreementAttachment.count({ where: { agreementId: agreement.id, removedAt: null } }),
    prisma.employmentAgreementAttachment.aggregate({
      where: { agreementId: agreement.id, removedAt: null },
      _sum: { originalSizeBytes: true },
    }),
  ]);
  if (activeCount >= EMPLOYMENT_AGREEMENT_ATTACHMENT_MAX_ACTIVE) return serviceError("每份协议最多保留 30 个现行附件", 409);
  if ((totalSize._sum.originalSizeBytes ?? 0) + command.fileSize > EMPLOYMENT_AGREEMENT_ATTACHMENT_MAX_TOTAL_BYTES) {
    return serviceError("每份协议的现行附件总量不能超过 500 MB", 409);
  }
  const buffer = Buffer.from(await command.file.arrayBuffer());
  if (buffer.length !== command.fileSize) return serviceError("附件读取不完整，请重新上传", 400);
  const attachmentUid = randomUUID();
  const stored = await storeEmploymentAgreementAttachment({ attachmentUid, fileName: command.fileName, buffer });
  try {
    const created = await prisma.$transaction(async (tx) => {
      const current = await tx.employmentAgreement.findFirst({
        where: { id: agreement.id, agreementUid: command.agreementUid, recordState: "confirmed" },
        select: { id: true },
      });
      if (!current) return serviceError("协议已发生变化，请刷新后重试", 409);
      const [count, size] = await Promise.all([
        tx.employmentAgreementAttachment.count({ where: { agreementId: agreement.id, removedAt: null } }),
        tx.employmentAgreementAttachment.aggregate({
          where: { agreementId: agreement.id, removedAt: null },
          _sum: { originalSizeBytes: true },
        }),
      ]);
      if (count >= EMPLOYMENT_AGREEMENT_ATTACHMENT_MAX_ACTIVE) return serviceError("每份协议最多保留 30 个现行附件", 409);
      if ((size._sum.originalSizeBytes ?? 0) + command.fileSize > EMPLOYMENT_AGREEMENT_ATTACHMENT_MAX_TOTAL_BYTES) {
        return serviceError("每份协议的现行附件总量不能超过 500 MB", 409);
      }
      await tx.employmentAgreementAttachment.create({
        data: {
          attachmentUid,
          agreementId: agreement.id,
          fileName: command.fileName,
          mimeType: command.mimeType,
          ...stored,
          compressionSavingsRatio: stored.compressionSavingsRatio === null
            ? null
            : new Prisma.Decimal(stored.compressionSavingsRatio),
          note: command.note,
          uploadedBy: command.userId,
        },
      });
      return serviceOk({ success: true as const, attachmentUid });
    });
    if (!created.ok) await removeUncommittedEmploymentAgreementAttachment(attachmentUid);
    return created;
  } catch (error) {
    await removeUncommittedEmploymentAgreementAttachment(attachmentUid);
    throw error;
  }
}

export async function executeRemoveEmploymentAgreementAttachment(input: unknown) {
  const built = mapValidationToServiceResult(buildEmploymentAgreementAttachmentRemoveCommand(input));
  if (!built.ok) return built;
  const command = built.data;
  if (!(await checkHRUpdate(command.userId, "hr.roster"))) return serviceError("无权限", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employmentAgreementAttachment.remove",
    actorUserId: command.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "协议附件移除已配置为必须走流程，请从协议入口提交",
  });
  if (!direct.ok) return direct;
  const agreement = await visibleAgreement(command.employeeId, command.agreementUid);
  if (!agreement) return serviceError("协议不存在或不属于该员工", 404);
  const updated = await prisma.employmentAgreementAttachment.updateMany({
    where: { agreementId: agreement.id, attachmentUid: command.attachmentUid, removedAt: null },
    data: {
      removedAt: new Date(),
      removedBy: command.userId,
      removalReason: command.reason,
      version: { increment: 1 },
    },
  });
  return updated.count === 1
    ? serviceOk({ success: true as const })
    : serviceError("附件不存在或已经移除", 404);
}

export async function downloadEmploymentAgreementAttachment(input: unknown & { variant?: "original" | "optimized" }) {
  const built = mapValidationToServiceResult(buildEmploymentAgreementAttachmentTargetCommand(input));
  if (!built.ok) return built;
  const command = built.data;
  if (!(await checkHRRead(command.userId, "hr.roster"))) return serviceError("无权限", 403);
  const agreement = await visibleAgreement(command.employeeId, command.agreementUid);
  if (!agreement) return serviceError("协议不存在或不属于该员工", 404);
  const attachment = await prisma.employmentAgreementAttachment.findFirst({
    where: { agreementId: agreement.id, attachmentUid: command.attachmentUid },
    select: {
      fileName: true,
      mimeType: true,
      originalStoragePath: true,
      originalSizeBytes: true,
      originalChecksumSha256: true,
      optimizedStoragePath: true,
      optimizedSizeBytes: true,
      optimizedChecksumSha256: true,
      optimizationStatus: true,
    },
  });
  if (!attachment) return serviceError("附件不存在", 404);
  const variant = (input as { variant?: "original" | "optimized" }).variant;
  const useOptimized = Boolean(
    variant !== "original"
    && attachment.optimizationStatus === "optimized"
    && attachment.optimizedStoragePath
    && attachment.optimizedSizeBytes
    && attachment.optimizedChecksumSha256,
  );
  const storagePath = useOptimized ? attachment.optimizedStoragePath! : attachment.originalStoragePath;
  const size = useOptimized ? attachment.optimizedSizeBytes! : attachment.originalSizeBytes;
  const checksum = useOptimized ? attachment.optimizedChecksumSha256! : attachment.originalChecksumSha256;
  try {
    const buffer = await readEmploymentAgreementAttachmentFile({
      storagePath,
      expectedSizeBytes: size,
      expectedChecksumSha256: checksum,
    });
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        "Content-Length": String(buffer.length),
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "X-Employment-Agreement-Attachment-Variant": useOptimized ? "optimized" : "original",
      },
    });
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "协议附件不可用", 409);
  }
}
