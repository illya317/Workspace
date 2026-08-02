import { randomUUID } from "node:crypto";
import { Prisma } from "@workspace/platform/server/prisma";
import { runSerializableTransaction, SerializableTransactionConflictError } from "@workspace/platform/server/serializable-transaction";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import {
  businessTemporalIdempotencyMatches,
  businessTemporalRequestFingerprint,
} from "@workspace/platform/server/business-temporal-idempotency";
import {
  buildProjectMembershipCorrectionPlan,
  buildProjectMembershipEndPlan,
  buildProjectMembershipRoleChangePlan,
  buildProjectMembershipSchedulePlan,
  ProjectMembershipLifecycleError,
  type ProjectMembershipMutationPlan,
  type ProjectMembershipVersionSnapshot,
} from "./domain/project-membership-lifecycle-validation";

type TransactionClient = Prisma.TransactionClient;

export class ProjectMembershipConcurrentUpdateError extends Error {
  constructor() {
    super("项目成员已发生变化，请刷新后重试");
    this.name = "ProjectMembershipConcurrentUpdateError";
  }
}

export type ProjectMembershipCommitReceipt = {
  changeId: number;
  changeUid: string;
  membershipUid: string;
  commandKind: string;
  createdVersionId: number | null;
  updatedVersionId: number | null;
  sourceBefore: ProjectMembershipVersionSnapshot | null;
  reopenedSourceBefore?: ProjectMembershipVersionSnapshot | null;
  reopenedVersionId?: number | null;
};

const versionSelect = {
  id: true,
  membershipUid: true,
  sequence: true,
  employeeId: true,
  projectId: true,
  role: true,
  startDate: true,
  endDate: true,
  recordState: true,
  changeKind: true,
  supersedesId: true,
  createdByChangeId: true,
  terminalChangeId: true,
  reason: true,
  editedBy: true,
  editedAt: true,
  version: true,
} as const;

export async function scheduleProjectMembership(input: {
  employeeId: number;
  projectId: number;
  role: string;
  startDate?: string | null;
  endDate?: string | null;
  reason?: string | null;
  userId: number;
  idempotencyKey: string;
}) {
  const requestFingerprint = membershipRequestFingerprint("schedule", input);
  return executeMembershipTransaction(input.idempotencyKey, requestFingerprint, async (tx) => {
    const existing = await tx.employeeProject.findMany({
      where: { employeeId: input.employeeId, projectId: input.projectId },
      select: versionSelect,
    });
    const plan = buildProjectMembershipSchedulePlan({
      membershipUid: randomUUID(),
      employeeId: input.employeeId,
      projectId: input.projectId,
      role: input.role,
      startDate: input.startDate?.trim() || workspaceBusinessDate(new Date()),
      endDate: input.endDate?.trim() || null,
      reason: input.reason,
    }, existing);
    return commitProjectMembershipPlan(tx, plan, {
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
    });
  });
}

export async function changeProjectMembershipRole(input: {
  recordId: number;
  nextRole: string;
  effectiveOn?: string | null;
  reason?: string | null;
  expectedVersion: number;
  userId: number;
  idempotencyKey: string;
}) {
  const requestFingerprint = membershipRequestFingerprint("change-role", input);
  return executeMembershipTransaction(input.idempotencyKey, requestFingerprint, async (tx) => {
    const source = await requireMembershipVersion(tx, input.recordId);
    if (source.version !== input.expectedVersion) throw new ProjectMembershipConcurrentUpdateError();
    const rowsInSeries = await tx.employeeProject.findMany({
      where: { membershipUid: source.membershipUid },
      select: versionSelect,
    });
    const plan = buildProjectMembershipRoleChangePlan({
      source,
      rowsInSeries,
      nextRole: input.nextRole,
      effectiveOn: input.effectiveOn?.trim() || workspaceBusinessDate(new Date()),
      reason: input.reason,
    });
    return commitProjectMembershipPlan(tx, plan, {
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
    });
  });
}

export async function endProjectMembership(input: {
  recordId: number;
  effectiveOn?: string | null;
  reason?: string | null;
  expectedVersion: number;
  userId: number;
  idempotencyKey: string;
}) {
  const requestFingerprint = membershipRequestFingerprint("end-date", input);
  return executeMembershipTransaction(input.idempotencyKey, requestFingerprint, async (tx) => {
    const source = await requireMembershipVersion(tx, input.recordId);
    if (source.version !== input.expectedVersion) throw new ProjectMembershipConcurrentUpdateError();
    const plan = buildProjectMembershipEndPlan({
      source,
      effectiveOn: input.effectiveOn?.trim() || workspaceBusinessDate(new Date()),
      reason: input.reason,
    });
    return commitProjectMembershipPlan(tx, plan, {
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
    });
  });
}

export async function correctProjectMembership(input: {
  recordId: number;
  role?: string;
  startDate: string | null;
  endDate: string | null;
  reason: string;
  expectedVersion: number;
  userId: number;
  idempotencyKey: string;
}) {
  const requestFingerprint = membershipRequestFingerprint("correct", input);
  return executeMembershipTransaction(input.idempotencyKey, requestFingerprint, async (tx) => {
    const source = await requireMembershipVersion(tx, input.recordId);
    if (source.version !== input.expectedVersion) throw new ProjectMembershipConcurrentUpdateError();
    const rows = await tx.employeeProject.findMany({
      where: { employeeId: source.employeeId, projectId: source.projectId },
      select: versionSelect,
    });
    const plan = buildProjectMembershipCorrectionPlan({
      source,
      rows,
      role: input.role,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason,
    });
    return commitProjectMembershipPlan(tx, plan, {
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
    });
  });
}

export async function applyProjectMembershipEndInTransaction(
  tx: TransactionClient,
  input: {
    recordId: number;
    effectiveOn: string;
    reason: string;
    userId: number;
    idempotencyKey: string;
    commandKind?: "reject";
  },
) {
  const requestFingerprint = membershipRequestFingerprint(input.commandKind ?? "end-date", input);
  const duplicate = await findIdempotentReceipt(tx, input.idempotencyKey, requestFingerprint);
  if (duplicate) return duplicate;
  const source = await requireMembershipVersion(tx, input.recordId);
  const plan = buildProjectMembershipEndPlan({ source, effectiveOn: input.effectiveOn, reason: input.reason });
  return commitProjectMembershipPlan(tx, plan, {
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    commandKind: input.commandKind,
  });
}

export async function rejectProjectMembershipInTransaction(
  tx: TransactionClient,
  input: {
    recordId: number;
    effectiveOn: string;
    reason: string;
    userId: number;
    idempotencyKey: string;
  },
) {
  const requestFingerprint = membershipRequestFingerprint("reject", input);
  const duplicate = await findIdempotentReceipt(tx, input.idempotencyKey, requestFingerprint);
  if (duplicate) return duplicate;
  const source = await tx.employeeProject.findUnique({
    where: { id: input.recordId },
    select: versionSelect,
  });
  if (!source) throw new ProjectMembershipLifecycleError("项目成员记录不存在");
  const plan = buildProjectMembershipEndPlan({ source, effectiveOn: input.effectiveOn, reason: input.reason });
  const receipt = await commitProjectMembershipPlan(tx, plan, {
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint,
    commandKind: "reject",
  });

  let reopenedVersionId: number | null = null;
  let reopenedSourceBefore: ProjectMembershipVersionSnapshot | null = null;
  if (source.changeKind === "role_change" && source.supersedesId && source.createdByChangeId) {
    reopenedSourceBefore = await requireMembershipVersion(tx, source.supersedesId);
    const sourceChange = await tx.projectMembershipChange.findUnique({
      where: { id: source.createdByChangeId },
      select: { effectsJson: true },
    });
    const originalBefore = parseMembershipReceipt(sourceChange?.effectsJson ?? null)?.sourceBefore;
    if (!originalBefore || originalBefore.id !== source.supersedesId) throw new ProjectMembershipConcurrentUpdateError();
    const reopened = await tx.employeeProject.updateMany({
      where: {
        id: source.supersedesId,
        version: reopenedSourceBefore.version,
        terminalChangeId: source.createdByChangeId,
        recordState: { in: ["confirmed", "superseded"] },
      },
      data: {
        endDate: originalBefore.endDate,
        recordState: originalBefore.recordState,
        reason: originalBefore.reason ?? null,
        terminalChangeId: null,
        editedBy: input.userId,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (reopened.count !== 1) throw new ProjectMembershipConcurrentUpdateError();
    reopenedVersionId = source.supersedesId;
    await tx.projectMembershipChange.update({
      where: { id: receipt.changeId },
      data: { effectsJson: JSON.stringify({ ...receipt, reopenedVersionId, reopenedSourceBefore }) },
    });
  }
  return { ...receipt, reopenedVersionId, reopenedSourceBefore };
}

export async function createProjectMembershipsInTransaction(
  tx: TransactionClient,
  input: {
    projectId: number;
    members: readonly { employeeId: number; role: string }[];
    userId: number;
    idempotencyPrefix: string;
    effectiveOn?: string;
  },
) {
  const receipts: ProjectMembershipCommitReceipt[] = [];
  for (const member of input.members) {
    const idempotencyKey = `${input.idempotencyPrefix}:${member.employeeId}:${member.role}`;
    const requestFingerprint = membershipRequestFingerprint("schedule", { ...member, projectId: input.projectId, effectiveOn: input.effectiveOn ?? null });
    const duplicate = await findIdempotentReceipt(tx, idempotencyKey, requestFingerprint);
    if (duplicate) {
      receipts.push(duplicate);
      continue;
    }
    const existing = await tx.employeeProject.findMany({
      where: { employeeId: member.employeeId, projectId: input.projectId },
      select: versionSelect,
    });
    const plan = buildProjectMembershipSchedulePlan({
      membershipUid: randomUUID(),
      employeeId: member.employeeId,
      projectId: input.projectId,
      role: member.role,
      startDate: input.effectiveOn ?? workspaceBusinessDate(new Date()),
      endDate: null,
      reason: "项目创建时登记成员",
    }, existing);
    receipts.push(await commitProjectMembershipPlan(tx, plan, { userId: input.userId, idempotencyKey, requestFingerprint }));
  }
  return receipts;
}

async function executeMembershipTransaction(
  idempotencyKey: string,
  requestFingerprint: string,
  operation: (tx: TransactionClient) => Promise<ProjectMembershipCommitReceipt>,
) {
  if (!idempotencyKey.trim()) throw new ProjectMembershipLifecycleError("幂等键不能为空");
  try {
    return await runSerializableTransaction(async (tx) => {
      const duplicate = await findIdempotentReceipt(tx, idempotencyKey, requestFingerprint);
      return duplicate ?? operation(tx);
    });
  } catch (error) {
    if (error instanceof SerializableTransactionConflictError) throw new ProjectMembershipConcurrentUpdateError();
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2004")) {
      throw new ProjectMembershipLifecycleError("项目成员有效期间与已有记录冲突");
    }
    throw error;
  }
}

async function commitProjectMembershipPlan(
  tx: TransactionClient,
  plan: ProjectMembershipMutationPlan,
  input: { userId: number; idempotencyKey: string; requestFingerprint: string; commandKind?: "reject" },
): Promise<ProjectMembershipCommitReceipt> {
  const duplicate = await findIdempotentReceipt(tx, input.idempotencyKey, input.requestFingerprint);
  if (duplicate) return duplicate;
  const change = await tx.projectMembershipChange.create({
    data: {
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      membershipUid: plan.membershipUid,
      employeeId: plan.employeeId,
      projectId: plan.projectId,
      commandKind: input.commandKind ?? plan.commandKind,
      effectiveOn: plan.effectiveOn,
      reason: plan.sourceUpdate?.data.reason ?? plan.create?.reason ?? null,
      effectsJson: "{}",
      recordedBy: input.userId,
    },
    select: { id: true, changeUid: true },
  });

  let updatedVersionId: number | null = null;
  if (plan.sourceUpdate) {
    const updated = await tx.employeeProject.updateMany({
      where: {
        id: plan.sourceUpdate.id,
        version: plan.sourceUpdate.expectedVersion,
        recordState: "confirmed",
      },
      data: {
        ...plan.sourceUpdate.data,
        terminalChangeId: change.id,
        editedBy: input.userId,
        editedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ProjectMembershipConcurrentUpdateError();
    updatedVersionId = plan.sourceUpdate.id;
  }

  let createdVersionId: number | null = null;
  if (plan.create) {
    const created = await tx.employeeProject.create({
      data: {
        ...plan.create,
        createdByChangeId: change.id,
        editedBy: input.userId,
        editedAt: new Date(),
      },
      select: { id: true },
    });
    createdVersionId = created.id;
  }

  const receipt: ProjectMembershipCommitReceipt = {
    changeId: change.id,
    changeUid: change.changeUid,
    membershipUid: plan.membershipUid,
    commandKind: input.commandKind ?? plan.commandKind,
    createdVersionId,
    updatedVersionId,
    sourceBefore: plan.sourceBefore ?? null,
  };
  await tx.projectMembershipChange.update({
    where: { id: change.id },
    data: { effectsJson: JSON.stringify(receipt) },
  });
  return receipt;
}

async function requireMembershipVersion(tx: TransactionClient, recordId: number): Promise<ProjectMembershipVersionSnapshot> {
  const source = await tx.employeeProject.findUnique({ where: { id: recordId }, select: versionSelect });
  if (!source) throw new ProjectMembershipLifecycleError("项目成员记录不存在");
  return source;
}

async function findIdempotentReceipt(tx: TransactionClient, idempotencyKey: string, requestFingerprint: string) {
  const existing = await tx.projectMembershipChange.findUnique({
    where: { idempotencyKey },
    select: { effectsJson: true, requestFingerprint: true },
  });
  if (!existing) return null;
  if (!businessTemporalIdempotencyMatches(existing.requestFingerprint, requestFingerprint)) {
    throw new ProjectMembershipLifecycleError("幂等键已用于不同的项目成员命令");
  }
  const receipt = parseMembershipReceipt(existing.effectsJson);
  if (!receipt) throw new ProjectMembershipConcurrentUpdateError();
  return receipt;
}

function membershipRequestFingerprint(commandKind: string, input: Record<string, unknown>) {
  const { idempotencyKey: _idempotencyKey, userId: _userId, ...request } = input;
  return businessTemporalRequestFingerprint({ aggregate: "ProjectMembership", commandKind, request });
}

function parseMembershipReceipt(value: string | null): ProjectMembershipCommitReceipt | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as ProjectMembershipCommitReceipt;
  } catch {
    return null;
  }
}
