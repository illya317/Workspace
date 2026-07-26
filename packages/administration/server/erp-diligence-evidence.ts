import { createHash } from "node:crypto";

import {
  ERP_DILIGENCE_CAMPAIGN_KEY,
  type ErpDiligenceEvidenceAttachment,
} from "@workspace/administration/types";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import { guardedDelete } from "@workspace/platform/server/delete-guard";
import { prisma } from "@workspace/platform/server/prisma";
import {
  buildErpDiligenceEvidenceAttachmentCommand,
  buildErpDiligenceEvidenceUploadCommand,
  ERP_DILIGENCE_ATTACHMENT_MAX_PER_EVIDENCE,
  ERP_DILIGENCE_ATTACHMENT_MAX_TOTAL_BYTES,
  type ErpDiligenceEvidenceAttachmentCommand,
  type ErpDiligenceEvidenceUploadInput,
  type ErpDiligenceEvidenceUploadCommand,
} from "./domain/erp-diligence-attachment-validation";
import { ErpDiligenceEvidenceItemSchema } from "./erp-diligence-schemas";

const VIEW_ALL_RESOURCE = "administration.erpDiligence.viewAll";

export const ERP_DILIGENCE_ATTACHMENT_METADATA_SELECT = {
  attachmentUid: true,
  evidenceKey: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  checksumSha256: true,
  uploadedAt: true,
} as const;

export function toErpDiligenceEvidenceAttachmentDto(record: {
  attachmentUid: string;
  evidenceKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  checksumSha256: string;
  uploadedAt: Date;
}): ErpDiligenceEvidenceAttachment {
  return {
    attachmentUid: record.attachmentUid,
    evidenceKey: record.evidenceKey,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    checksumSha256: record.checksumSha256,
    uploadedAt: record.uploadedAt.toISOString(),
  };
}

export function buildUploadErpDiligenceEvidenceRouteCommand(
  input: ErpDiligenceEvidenceUploadInput,
  userId: number,
) {
  return buildErpDiligenceEvidenceUploadCommand(input, userId);
}

export function buildErpDiligenceEvidenceAttachmentRouteCommand(
  attachmentUid: string,
  userId: number,
) {
  return buildErpDiligenceEvidenceAttachmentCommand(attachmentUid, userId);
}

function evidenceKeys(value: unknown) {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(value.flatMap((item) => {
    const parsed = ErpDiligenceEvidenceItemSchema.safeParse(item);
    return parsed.success ? [parsed.data.key] : [];
  }));
}

export async function uploadErpDiligenceEvidenceAttachment(command: ErpDiligenceEvidenceUploadCommand) {
  const validation = buildErpDiligenceEvidenceUploadCommand({
    evidenceKey: command.evidenceKey,
    file: command.file,
  }, command.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const input = validation.data;
  const submission = await prisma.erpDueDiligenceSubmission.findUnique({
    where: {
      campaignKey_respondentUserId: {
        campaignKey: ERP_DILIGENCE_CAMPAIGN_KEY,
        respondentUserId: input.userId,
      },
    },
    select: { id: true, evidenceItemsJson: true },
  });
  if (!submission) return serviceError("请先保存尽调草稿后再上传材料", 409);
  if (!evidenceKeys(submission.evidenceItemsJson).has(input.evidenceKey)) {
    return serviceError("请先选择材料类型并保存该材料条目", 409);
  }

  const [itemCount, totalSize] = await Promise.all([
    prisma.erpDueDiligenceEvidenceAttachment.count({
      where: { submissionId: submission.id, evidenceKey: input.evidenceKey },
    }),
    prisma.erpDueDiligenceEvidenceAttachment.aggregate({
      where: { submissionId: submission.id },
      _sum: { fileSize: true },
    }),
  ]);
  if (itemCount >= ERP_DILIGENCE_ATTACHMENT_MAX_PER_EVIDENCE) {
    return serviceError(`每份材料最多上传 ${ERP_DILIGENCE_ATTACHMENT_MAX_PER_EVIDENCE} 个附件`, 409);
  }
  if ((totalSize._sum.fileSize ?? 0) + input.fileSize > ERP_DILIGENCE_ATTACHMENT_MAX_TOTAL_BYTES) {
    return serviceError("每份尽调表的附件总量不能超过 100 MB", 409);
  }

  const fileContent = Buffer.from(await input.file.arrayBuffer());
  const checksumSha256 = createHash("sha256").update(fileContent).digest("hex");
  const attachment = await prisma.erpDueDiligenceEvidenceAttachment.create({
    data: {
      submissionId: submission.id,
      evidenceKey: input.evidenceKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      checksumSha256,
      fileContent,
      uploadedBy: input.userId,
    },
    select: ERP_DILIGENCE_ATTACHMENT_METADATA_SELECT,
  });
  return serviceOk({ attachment: toErpDiligenceEvidenceAttachmentDto(attachment) });
}

export async function deleteErpDiligenceEvidenceAttachment(command: ErpDiligenceEvidenceAttachmentCommand) {
  const validation = buildErpDiligenceEvidenceAttachmentCommand(command.attachmentUid, command.userId);
  if (!validation.ok) return serviceError(validation.issue.message, validation.issue.status);
  const input = validation.data;
  const attachment = await prisma.erpDueDiligenceEvidenceAttachment.findUnique({
    where: { attachmentUid: input.attachmentUid },
    select: { id: true },
  });
  if (!attachment) return serviceError("附件不存在", 404);
  const result = await guardedDelete({
    entityType: "ErpDueDiligenceEvidenceAttachment",
    modelKey: "erpDueDiligenceEvidenceAttachment",
    id: attachment.id,
    userId: input.userId,
    actionLabel: "删除ERP尽调样表附件",
    deleteMode: "hard",
    referencePolicy: "none",
    auditPolicy: "none",
    scopeGuard: async (context) => {
      const submissionId = Number(context.record.submissionId);
      const submission = Number.isInteger(submissionId)
        ? await context.tx.erpDueDiligenceSubmission.findUnique({
            where: { id: submissionId },
            select: { respondentUserId: true },
          })
        : null;
      return submission?.respondentUserId === input.userId
        ? { ok: true }
        : { error: "只能删除本人尽调表中的附件", status: 403 };
    },
  });
  if (!result.ok) return serviceError(result.error, result.status || 400);
  return serviceOk({ attachmentUid: input.attachmentUid });
}

export async function downloadErpDiligenceEvidenceAttachment(command: ErpDiligenceEvidenceAttachmentCommand) {
  const attachment = await prisma.erpDueDiligenceEvidenceAttachment.findUnique({
    where: { attachmentUid: command.attachmentUid },
    select: {
      fileName: true,
      mimeType: true,
      fileSize: true,
      fileContent: true,
      submission: { select: { respondentUserId: true } },
    },
  });
  if (!attachment) return serviceError("附件不存在", 404);
  const canView = attachment.submission.respondentUserId === command.userId
    || await evaluatePermissionAction(command.userId, VIEW_ALL_RESOURCE, "read");
  if (!canView) return serviceError("无权查看该尽调附件", 403);
  return new Response(new Uint8Array(attachment.fileContent), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Content-Length": String(attachment.fileSize),
      "Content-Type": attachment.mimeType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
