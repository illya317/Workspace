import "server-only";

import { randomUUID } from "node:crypto";

import type { ContractArchivePackage, ContractArchiveRecord, ContractAttachment } from "@workspace/administration/types";
import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import {
  defineBusinessActionCommandAdapter,
  executeDirectBusinessActionCommand,
} from "@workspace/platform/server/business-action-executor";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { ensureEditHistoryBaseline, snapshotHistory } from "@workspace/platform/server/history";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { buildContractRecordAccessWhere } from "./contract-access";
import {
  readContractAttachmentFile,
  removeUncommittedContractAttachment,
  storeContractAttachment,
} from "./contract-attachment-storage";
import {
  CONTRACT_ATTACHMENT_MAX_ACTIVE,
  CONTRACT_ATTACHMENT_MAX_TOTAL_BYTES,
  buildContractApprovalReferenceCommand,
  buildContractAttachmentRemoveCommand,
  buildContractAttachmentTargetCommand,
  buildContractAttachmentUploadCommand,
  buildContractRecordCreateCommand,
  type ContractApprovalReferenceCommand,
  type ContractAttachmentRemoveCommand,
  type ContractAttachmentTargetCommand,
  type ContractAttachmentUploadCommand,
  type ContractRecordCreateCommand,
} from "./domain/contract-package-validation";
import type {
  ContractApprovalReferenceInput,
  ContractAttachmentRemoveInput,
  ContractAttachmentUploadInput,
  ContractRecordCreateInput,
} from "./contract-package-schemas";

const USER_NAME_SELECT = { alias: true, username: true } as const;

const ATTACHMENT_SELECT = {
  attachmentUid: true,
  kind: true,
  fileName: true,
  mimeType: true,
  originalSizeBytes: true,
  optimizedSizeBytes: true,
  optimizationStatus: true,
  optimizationError: true,
  compressionSavingsRatio: true,
  pageCount: true,
  note: true,
  uploadedAt: true,
  removedAt: true,
  removalReason: true,
  version: true,
  uploader: { select: USER_NAME_SELECT },
} satisfies Prisma.ContractAttachmentSelect;

const RECORD_SELECT = {
  recordUid: true,
  recordType: true,
  occurredOn: true,
  title: true,
  content: true,
  sourceKey: true,
  externalRecordId: true,
  externalUrl: true,
  statusSnapshot: true,
  attachmentUid: true,
  createdAt: true,
  creator: { select: USER_NAME_SELECT },
} satisfies Prisma.ContractRecordSelect;

type AttachmentRecord = Prisma.ContractAttachmentGetPayload<{ select: typeof ATTACHMENT_SELECT }>;
type ArchiveRecord = Prisma.ContractRecordGetPayload<{ select: typeof RECORD_SELECT }>;

function actorName(actor: { alias: string | null; username: string } | null) {
  return actor?.alias || actor?.username || null;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toAttachmentDto(record: AttachmentRecord): ContractAttachment {
  const { uploader, compressionSavingsRatio, ...attachment } = record;
  return {
    ...attachment,
    kind: record.kind as ContractAttachment["kind"],
    optimizationStatus: record.optimizationStatus as ContractAttachment["optimizationStatus"],
    compressionSavingsRatio: compressionSavingsRatio?.toNumber() ?? null,
    uploadedByName: actorName(uploader),
    uploadedAt: record.uploadedAt.toISOString(),
    removedAt: record.removedAt?.toISOString() ?? null,
  };
}

function toRecordDto(record: ArchiveRecord): ContractArchiveRecord {
  const { creator, ...archiveRecord } = record;
  return {
    ...archiveRecord,
    recordType: record.recordType as ContractArchiveRecord["recordType"],
    occurredOn: isoDate(record.occurredOn),
    createdByName: actorName(creator),
    createdAt: record.createdAt.toISOString(),
  };
}

function businessDate() {
  return new Date(`${workspaceBusinessDate(new Date())}T00:00:00.000Z`);
}

async function visibleContract(contractId: number, userId: number, options: { mutable?: boolean } = {}) {
  const accessWhere = await buildContractRecordAccessWhere(userId);
  const contract = await prisma.contract.findFirst({
    where: { AND: [{ id: contractId }, accessWhere] },
    select: {
      id: true,
      name: true,
      version: true,
      lifecycleStatus: true,
      isArchived: true,
      approvalSourceKey: true,
      approvalRecordId: true,
      approvalRecordUrl: true,
      approvalStatusSnapshot: true,
      approvedOn: true,
      approvalSyncedAt: true,
    },
  });
  if (!contract) return { error: serviceError("合同不存在", 404) } as const;
  if (options.mutable && contract.isArchived) return { error: serviceError("已归档合同不能再新增或修改材料", 409) } as const;
  if (options.mutable && contract.lifecycleStatus === "draft") {
    return { error: serviceError("草稿合同不能归档材料，请先完成合同主数据", 409) } as const;
  }
  return { contract, accessWhere } as const;
}

export async function loadContractArchivePackage(input: { contractId: number; userId: number }) {
  const visible = await visibleContract(input.contractId, input.userId);
  if ("error" in visible) return visible.error;
  const [attachments, records] = await Promise.all([
    prisma.contractAttachment.findMany({
      where: { contractId: input.contractId },
      select: ATTACHMENT_SELECT,
      orderBy: [{ removedAt: "asc" }, { uploadedAt: "desc" }],
    }),
    prisma.contractRecord.findMany({
      where: { contractId: input.contractId },
      select: RECORD_SELECT,
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const { contract } = visible;
  const approvalReference = contract.approvalSourceKey && contract.approvalRecordId && contract.approvedOn ? {
    sourceKey: contract.approvalSourceKey,
    externalRecordId: contract.approvalRecordId,
    externalUrl: contract.approvalRecordUrl,
    statusSnapshot: contract.approvalStatusSnapshot,
    approvedOn: isoDate(contract.approvedOn),
    syncedAt: contract.approvalSyncedAt?.toISOString() ?? null,
  } : null;
  return serviceOk({
    contractId: contract.id,
    approvalReference,
    attachments: attachments.map(toAttachmentDto),
    records: records.map(toRecordDto),
  } satisfies ContractArchivePackage);
}

type ContractAttachmentUploadResult = ServiceResult<{ attachment: ContractAttachment }>;

export async function commitUploadContractAttachment(
  command: ContractAttachmentUploadCommand,
): Promise<ContractAttachmentUploadResult> {
  const visible = await visibleContract(command.contractId, command.userId, { mutable: true });
  if ("error" in visible) return visible.error;
  const [activeCount, totalSize] = await Promise.all([
    prisma.contractAttachment.count({ where: { contractId: command.contractId, removedAt: null } }),
    prisma.contractAttachment.aggregate({
      where: { contractId: command.contractId, removedAt: null },
      _sum: { originalSizeBytes: true },
    }),
  ]);
  if (activeCount >= CONTRACT_ATTACHMENT_MAX_ACTIVE) return serviceError("每份合同最多保留 30 个现行附件", 409);
  if ((totalSize._sum.originalSizeBytes ?? 0) + command.fileSize > CONTRACT_ATTACHMENT_MAX_TOTAL_BYTES) {
    return serviceError("每份合同的现行附件总量不能超过 500 MB", 409);
  }
  const buffer = Buffer.from(await command.file.arrayBuffer());
  if (buffer.length !== command.fileSize) return serviceError("附件读取不完整，请重新上传", 400);
  const attachmentUid = randomUUID();
  const stored = await storeContractAttachment({ attachmentUid, fileName: command.fileName, buffer });
  try {
    const result = await prisma.$transaction(async (tx): Promise<ContractAttachmentUploadResult> => {
      const mutable = await recheckMutableContract(command.contractId, visible.accessWhere, tx);
      if (!mutable.ok) return mutable;
      const [currentActiveCount, currentTotalSize] = await Promise.all([
        tx.contractAttachment.count({ where: { contractId: command.contractId, removedAt: null } }),
        tx.contractAttachment.aggregate({
          where: { contractId: command.contractId, removedAt: null },
          _sum: { originalSizeBytes: true },
        }),
      ]);
      if (currentActiveCount >= CONTRACT_ATTACHMENT_MAX_ACTIVE) {
        return serviceError("每份合同最多保留 30 个现行附件", 409);
      }
      if ((currentTotalSize._sum.originalSizeBytes ?? 0) + command.fileSize > CONTRACT_ATTACHMENT_MAX_TOTAL_BYTES) {
        return serviceError("每份合同的现行附件总量不能超过 500 MB", 409);
      }
      const created = await tx.contractAttachment.create({
        data: {
          attachmentUid,
          contractId: command.contractId,
          kind: command.kind,
          fileName: command.fileName,
          mimeType: command.mimeType,
          ...stored,
          compressionSavingsRatio: stored.compressionSavingsRatio === null
            ? null
            : new Prisma.Decimal(stored.compressionSavingsRatio),
          note: command.note,
          uploadedBy: command.userId,
        },
        select: ATTACHMENT_SELECT,
      });
      await tx.contractRecord.create({
        data: {
          contractId: command.contractId,
          recordType: "attachment_added",
          occurredOn: businessDate(),
          title: `上传附件：${command.fileName}`,
          content: command.note,
          attachmentUid,
          createdBy: command.userId,
        },
      });
      return serviceOk({ attachment: toAttachmentDto(created) });
    });
    if (!result.ok) await removeUncommittedContractAttachment(attachmentUid);
    return result;
  } catch (error) {
    await removeUncommittedContractAttachment(attachmentUid);
    throw error;
  }
}

export async function commitCreateContractRecord(command: ContractRecordCreateCommand) {
  const visible = await visibleContract(command.contractId, command.userId, { mutable: true });
  if ("error" in visible) return visible.error;
  return prisma.$transaction(async (tx) => {
    const mutable = await recheckMutableContract(command.contractId, visible.accessWhere, tx);
    if (!mutable.ok) return mutable;
    const record = await tx.contractRecord.create({
      data: {
        contractId: command.contractId,
        recordType: command.recordType,
        occurredOn: command.occurredOn,
        title: command.title,
        content: command.content,
        createdBy: command.userId,
      },
      select: RECORD_SELECT,
    });
    return serviceOk({ record: toRecordDto(record) });
  });
}

async function lockContract(contractId: number, tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT "id" FROM "Contract" WHERE "id" = ${contractId} FOR UPDATE
  `);
  return rows.length > 0;
}

async function recheckMutableContract(
  contractId: number,
  accessWhere: Prisma.ContractWhereInput,
  tx: Prisma.TransactionClient,
) {
  if (!await lockContract(contractId, tx)) return serviceError("合同不存在", 404);
  const current = await tx.contract.findFirst({
    where: { AND: [{ id: contractId, isArchived: false }, accessWhere] },
    select: { version: true, lifecycleStatus: true },
  });
  if (!current) return serviceError("合同不存在", 404);
  if (current.lifecycleStatus === "draft") return serviceError("草稿合同不能归档材料，请先完成合同主数据", 409);
  return serviceOk(current);
}

export async function commitSetContractApprovalReference(command: ContractApprovalReferenceCommand) {
  const visible = await visibleContract(command.contractId, command.userId, { mutable: true });
  if ("error" in visible) return visible.error;
  try {
    return await prisma.$transaction(async (tx) => {
      const mutable = await recheckMutableContract(command.contractId, visible.accessWhere, tx);
      if (!mutable.ok) return mutable;
      if (mutable.data.version !== command.expectedVersion) return serviceError("合同已被其他人修改，请刷新后重试", 409);
      await ensureEditHistoryBaseline("Contract", command.contractId, command.userId, tx);
      await tx.contract.update({
        where: { id: command.contractId },
        data: {
          approvalSourceKey: command.sourceKey,
          approvalRecordId: command.externalRecordId,
          approvalRecordUrl: command.externalUrl,
          approvalStatusSnapshot: command.statusSnapshot,
          approvedOn: command.approvedOn,
          approvalSyncedAt: new Date(),
          editedBy: command.userId,
          editedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.contractRecord.create({
        data: {
          contractId: command.contractId,
          recordType: "approval",
          occurredOn: command.approvedOn,
          title: `登记审批记录：${command.sourceKey} / ${command.externalRecordId}`,
          content: command.note,
          sourceKey: command.sourceKey,
          externalRecordId: command.externalRecordId,
          externalUrl: command.externalUrl,
          statusSnapshot: command.statusSnapshot,
          createdBy: command.userId,
        },
      });
      await snapshotHistory("Contract", command.contractId, command.userId, tx);
      const updated = await tx.contract.findUniqueOrThrow({
        where: { id: command.contractId },
        select: { version: true, approvalSyncedAt: true },
      });
      return serviceOk({ success: true, version: updated.version, syncedAt: updated.approvalSyncedAt?.toISOString() ?? null });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return serviceError("该审批记录已经关联到另一份合同", 409);
    }
    throw error;
  }
}

export async function commitRemoveContractAttachment(command: ContractAttachmentRemoveCommand) {
  const visible = await visibleContract(command.contractId, command.userId, { mutable: true });
  if ("error" in visible) return visible.error;
  return prisma.$transaction(async (tx) => {
    const mutable = await recheckMutableContract(command.contractId, visible.accessWhere, tx);
    if (!mutable.ok) return mutable;
    const attachment = await tx.contractAttachment.findFirst({
      where: { contractId: command.contractId, attachmentUid: command.attachmentUid },
      select: { id: true, fileName: true, removedAt: true },
    });
    if (!attachment) return serviceError("附件不存在", 404);
    if (attachment.removedAt) return serviceError("附件已经移除", 409);
    const updated = await tx.contractAttachment.updateMany({
      where: { id: attachment.id, removedAt: null },
      data: {
        removedAt: new Date(),
        removedBy: command.userId,
        removalReason: command.reason,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) return serviceError("附件已经移除", 409);
    await tx.contractRecord.create({
      data: {
        contractId: command.contractId,
        recordType: "attachment_removed",
        occurredOn: businessDate(),
        title: `移除附件：${attachment.fileName}`,
        content: command.reason,
        attachmentUid: command.attachmentUid,
        createdBy: command.userId,
      },
    });
    return serviceOk({ success: true });
  });
}

export async function downloadContractAttachment(input: ContractAttachmentTargetCommand & { variant?: "original" | "optimized" }) {
  const visible = await visibleContract(input.contractId, input.userId);
  if ("error" in visible) return visible.error;
  const attachment = await prisma.contractAttachment.findFirst({
    where: { contractId: input.contractId, attachmentUid: input.attachmentUid },
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
  const useOptimized = Boolean(input.variant !== "original"
    && attachment.optimizationStatus === "optimized"
    && attachment.optimizedStoragePath
    && attachment.optimizedSizeBytes
    && attachment.optimizedChecksumSha256);
  const storagePath = useOptimized ? attachment.optimizedStoragePath! : attachment.originalStoragePath;
  const size = useOptimized ? attachment.optimizedSizeBytes! : attachment.originalSizeBytes;
  const checksum = useOptimized ? attachment.optimizedChecksumSha256! : attachment.originalChecksumSha256;
  try {
    const buffer = await readContractAttachmentFile({
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
        "X-Contract-Attachment-Variant": useOptimized ? "optimized" : "original",
      },
    });
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "合同附件不可用", 409);
  }
}

type UploadInput = { contractId: number; userId: number; body: ContractAttachmentUploadInput };
type RecordInput = { contractId: number; userId: number; body: ContractRecordCreateInput };
type ApprovalInput = { contractId: number; userId: number; expectedVersion?: number; body: ContractApprovalReferenceInput };
type RemoveInput = { contractId: number; attachmentUid: string; userId: number; body: ContractAttachmentRemoveInput };

function validationError(issue: { message: string; status?: number }) {
  return serviceError(issue.message, issue.status || 400);
}

const uploadAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.attachment.upload",
  validatorKey: "packages/administration/server/domain/contract-package-validation.buildContractAttachmentUploadCommand",
  commitKey: "packages/administration/server/contract-package.commitUploadContractAttachment",
  validate: (input: UploadInput) => {
    const command = buildContractAttachmentUploadCommand(input.contractId, input.body, input.userId);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitUploadContractAttachment,
});

const recordAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.record.create",
  validatorKey: "packages/administration/server/domain/contract-package-validation.buildContractRecordCreateCommand",
  commitKey: "packages/administration/server/contract-package.commitCreateContractRecord",
  validate: (input: RecordInput) => {
    const command = buildContractRecordCreateCommand(input.contractId, input.body, input.userId);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitCreateContractRecord,
});

const approvalAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.approvalReference.set",
  validatorKey: "packages/administration/server/domain/contract-package-validation.buildContractApprovalReferenceCommand",
  commitKey: "packages/administration/server/contract-package.commitSetContractApprovalReference",
  validate: (input: ApprovalInput) => {
    const command = buildContractApprovalReferenceCommand(input.contractId, input.body, input.userId, input.expectedVersion);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitSetContractApprovalReference,
});

const removeAdapter = defineBusinessActionCommandAdapter({
  businessActionKey: "administration.contract.attachment.remove",
  validatorKey: "packages/administration/server/domain/contract-package-validation.buildContractAttachmentRemoveCommand",
  commitKey: "packages/administration/server/contract-package.commitRemoveContractAttachment",
  validate: (input: RemoveInput) => {
    const command = buildContractAttachmentRemoveCommand(input.contractId, input.attachmentUid, input.body, input.userId);
    return command.ok ? serviceOk(command.data) : validationError(command.issue);
  },
  commit: commitRemoveContractAttachment,
});

export function executeUploadContractAttachment(input: UploadInput) {
  return executeDirectBusinessActionCommand({ command: uploadAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeCreateContractRecord(input: RecordInput) {
  return executeDirectBusinessActionCommand({ command: recordAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeSetContractApprovalReference(input: ApprovalInput) {
  return executeDirectBusinessActionCommand({ command: approvalAdapter, input, context: undefined, actorUserId: input.userId });
}

export function executeRemoveContractAttachment(input: RemoveInput) {
  return executeDirectBusinessActionCommand({ command: removeAdapter, input, context: undefined, actorUserId: input.userId });
}

export function buildContractAttachmentTargetRouteCommand(contractId: number, attachmentUid: string, userId: number) {
  return buildContractAttachmentTargetCommand(contractId, attachmentUid, userId);
}
