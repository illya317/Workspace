import {
  businessDateWindowsOverlap,
  businessTemporalRetrospectiveChanges,
  inclusiveBusinessPeriodToWindow,
} from "@workspace/platform/contracts/business-temporal";
import { businessTemporalBaselineMissingRequiredFields } from "@workspace/platform/contracts/business-temporal-baseline";
import { checkHRUpdate } from "@workspace/platform/server/auth";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { businessTemporalIdempotencyMatches, businessTemporalRequestFingerprint } from "@workspace/platform/server/business-temporal-idempotency";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { runSerializableTransaction, SerializableTransactionConflictError } from "@workspace/platform/server/serializable-transaction";
import type { ContractRow } from "@workspace/hr/types";
import { employmentForAgreementDate } from "@workspace/hr/utils/employment-selection";
import { HR_EMPLOYMENT_AGREEMENT_TEMPORAL } from "../business-temporal";
import {
  buildEmploymentAgreementCommand,
  validateEmploymentAgreementContentReferences,
  type EmploymentAgreementCommand,
} from "./domain/employment-agreement-validation";
import { employmentAgreementChangeManifest } from "./domain/employment-agreement-change";
import { applyEmploymentAgreementBaselineMutation } from "./employment-agreement-baseline-mutation";
import {
  parseEmploymentAgreementMissingFields,
  refreshEmploymentAgreementBaselineMissingFields,
} from "./employment-agreement-baseline-storage";
import { buildLegacyAgreementRows, inspectLegacyEmploymentAgreements } from "./employment-agreement-legacy";
import { EMPLOYMENT_AGREEMENT_INCLUDE, normalizedEmploymentAgreementRow } from "./employment-agreement-rows";

export async function executeEmploymentAgreementCommand(input: {
  employeeId: number;
  userId: number;
  idempotencyKey: string;
  command: unknown;
}) {
  const built = mapValidationToServiceResult(buildEmploymentAgreementCommand(input.command));
  if (!built.ok) return built;
  if (!(await checkHRUpdate(input.userId, "hr.roster"))) return serviceError("无权限", 403);
  const direct = await assertBusinessActionDirectExecutionAllowed({
    businessActionKey: "hr.roster.employmentAgreement.command",
    actorUserId: input.userId,
    resourceKey: "hr.roster",
    scopeType: "global",
    scopeId: null,
    blockedMessage: "员工合同变更已配置为必须走流程，请从合同入口提交",
  });
  if (!direct.ok) return direct;
  const contentError = built.data.kind === "create"
    ? await validateEmploymentAgreementContentReferences(built.data.content)
    : null;
  if (contentError) return serviceError(contentError.message, 400);
  const temporalContractError = validateAgreementTemporalContract(built.data);
  if (temporalContractError) return serviceError(temporalContractError, 409);
  const requestFingerprint = businessTemporalRequestFingerprint({
    aggregate: "EmploymentAgreement",
    employeeId: input.employeeId,
    command: built.data,
  });

  try {
    const persisted = await runSerializableTransaction(async (tx) => {
      const duplicate = await tx.employmentAgreementChange.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (duplicate) {
        if (
          duplicate.employeeId !== input.employeeId
          || !businessTemporalIdempotencyMatches(duplicate.requestFingerprint, requestFingerprint)
        ) {
          throw new EmploymentAgreementCommandError("幂等键已被不同的员工协议命令使用", 409);
        }
        return { idempotent: true };
      }
      const outcome = built.data.kind === "create"
        ? await createAgreement(tx, input.employeeId, input.userId, built.data)
        : await changeAgreement(tx, input.employeeId, input.userId, built.data);
      await tx.employmentAgreementChange.create({
        data: {
          employeeId: input.employeeId,
          agreementId: outcome.agreementId,
          commandKind: built.data.kind,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          expectedVersion: built.data.kind === "create" ? null : built.data.expectedVersion,
          effectManifestJson: JSON.stringify(employmentAgreementChangeManifest(built.data)),
          actorUserId: input.userId,
        },
      });
      return { idempotent: false };
    });
    const rows = await listEmploymentAgreementsForEmployee(input.employeeId);
    return serviceOk({ success: true as const, commandKind: built.data.kind, idempotent: persisted.idempotent, agreements: rows });
  } catch (error) {
    if (error instanceof EmploymentAgreementCommandError) return serviceError(error.message, error.status);
    if (error instanceof SerializableTransactionConflictError) return serviceError(error.message, 409);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === "P2002" || error.code === "P2004")
    ) {
      if (error.code === "P2002") {
        const duplicate = await prisma.employmentAgreementChange.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (
          duplicate?.employeeId === input.employeeId
          && businessTemporalIdempotencyMatches(duplicate.requestFingerprint, requestFingerprint)
        ) {
          const rows = await listEmploymentAgreementsForEmployee(input.employeeId);
          return serviceOk({ success: true as const, commandKind: built.data.kind, idempotent: true, agreements: rows });
        }
        if (duplicate) return serviceError("幂等键已被不同的员工协议命令使用", 409);
      }
      return serviceError("协议期限或主协议状态已发生冲突，请刷新后重试", 409);
    }
    throw error;
  }
}

export async function listEmploymentAgreementsForEmployee(
  employeeId: number,
  asOfDate = workspaceBusinessDate(new Date()),
): Promise<ContractRow[]> {
  const [agreements, legacyEmployments] = await Promise.all([
    prisma.employmentAgreement.findMany({
      where: { employment: { employeeId } },
      include: EMPLOYMENT_AGREEMENT_INCLUDE,
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    }),
    prisma.employment.findMany({
      where: { employeeId, contracts: { not: null } },
      select: {
        id: true,
        contracts: true,
        employee: { select: { employeeId: true, name: true } },
      },
      orderBy: { id: "asc" },
    }),
  ]);
  return [
    ...agreements.map((agreement) => normalizedEmploymentAgreementRow(agreement, asOfDate)),
    ...buildLegacyAgreementRows(
      legacyEmployments.filter((employment) => !agreements.some((agreement) => (
        agreement.employmentId === employment.id && agreement.sourceKind === "legacy-baseline"
      ))),
      asOfDate,
    ),
  ];
}

export async function loadNormalizedEmploymentAgreementRowsByIds(
  agreementIds: number[],
  asOfDate: string,
): Promise<ContractRow[]> {
  if (agreementIds.length === 0) return [];
  const agreements = await prisma.employmentAgreement.findMany({
    where: { id: { in: agreementIds } },
    include: EMPLOYMENT_AGREEMENT_INCLUDE,
  });
  const byId = new Map(agreements.map((agreement) => [agreement.id, normalizedEmploymentAgreementRow(agreement, asOfDate)]));
  return agreementIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
}

export async function listAllNormalizedEmploymentAgreementRows(
  asOfDate: string,
): Promise<ContractRow[]> {
  const agreements = await prisma.employmentAgreement.findMany({
    include: EMPLOYMENT_AGREEMENT_INCLUDE,
    orderBy: { id: "asc" },
  });
  return agreements.map((agreement) => normalizedEmploymentAgreementRow(agreement, asOfDate));
}

export async function inspectLegacyEmploymentAgreementData(employeeId?: number) {
  const employments = await prisma.employment.findMany({
    where: {
      employeeId: employeeId ? employeeId : undefined,
      contracts: { not: null },
    },
    select: { id: true, contracts: true },
    orderBy: { id: "asc" },
  });
  return employments.flatMap(inspectLegacyEmploymentAgreements);
}

async function createAgreement(
  tx: Prisma.TransactionClient,
  employeeId: number,
  userId: number,
  command: Extract<EmploymentAgreementCommand, { kind: "create" }>,
) {
  const employments = await tx.employment.findMany({
    where: { employeeId },
    select: { id: true, joinDate: true, leaveDate: true },
  });
  const owner = employmentForAgreementDate(employments, command.effectiveFrom);
  if (!owner.ok) return failed(owner.message, 409);
  if (owner.id !== command.employmentId) return failed("合同所属雇佣周期与开始日期不一致", 409);
  const employment = employments.find((row) => row.id === owner.id)!;
  if (command.isPrimary) await clearPrimaryAgreements(tx, employeeId, userId);
  const agreement = await tx.employmentAgreement.create({
    data: {
      employmentId: employment.id,
      recordState: "confirmed",
      isPrimary: command.isPrimary,
      sourceKind: command.sourceKind,
      sourceRef: command.sourceRef,
      reason: command.reason,
      createdBy: userId,
      updatedBy: userId,
    },
  });
  const revision = await tx.employmentAgreementRevision.create({
    data: {
      agreementId: agreement.id,
      revisionNo: 1,
      recordState: "published",
      changeKind: "initial",
      contentJson: JSON.stringify(command.content),
      sourceKind: command.sourceKind,
      sourceRef: command.sourceRef,
      reason: command.reason,
      createdBy: userId,
    },
  });
  await tx.employmentAgreement.update({
    where: { id: agreement.id },
    data: { currentPublishedRevisionId: revision.id },
  });
  await tx.employmentAgreementTerm.create({
    data: {
      agreementId: agreement.id,
      sequence: 1,
      termKind: command.termKind,
      effectiveFrom: command.effectiveFrom,
      effectiveThrough: command.effectiveThrough,
      recordState: "confirmed",
      changeKind: "schedule",
      sourceKind: command.sourceKind,
      sourceRef: command.sourceRef,
      reason: command.reason,
      createdBy: userId,
    },
  });
  return succeeded(agreement.id);
}

async function changeAgreement(
  tx: Prisma.TransactionClient,
  employeeId: number,
  userId: number,
  command: Exclude<EmploymentAgreementCommand, { kind: "create" }>,
) {
  const agreement = await tx.employmentAgreement.findFirst({
    where: { agreementUid: command.agreementUid, employment: { employeeId } },
    include: EMPLOYMENT_AGREEMENT_INCLUDE,
  });
  if (!agreement) return failed("协议不存在或不属于该员工", 404);
  if (agreement.recordState !== "confirmed") return failed("只有已确认协议可以变更", 409);
  const missingFields = parseEmploymentAgreementMissingFields(agreement.missingFieldsJson);
  const missingRequiredFields = HR_EMPLOYMENT_AGREEMENT_TEMPORAL.baseline
    ? businessTemporalBaselineMissingRequiredFields(HR_EMPLOYMENT_AGREEMENT_TEMPORAL.baseline, missingFields)
    : [];
  const incompleteBaselineTerm = agreement.terms.find((item) => (
    missingRequiredFields.includes(`terms.${item.sequence}.effectiveFrom`)
  ));
  const contentOnlyCommand = command.kind === "supplement-missing" || command.kind === "correct-existing";
  if (
    incompleteBaselineTerm
    && !contentOnlyCommand
    && (command.kind !== "correct" || command.termUid !== incompleteBaselineTerm.termUid)
  ) {
    return failed("合同期限缺少开始日期，请先通过修正期限补齐后再保存其他变更", 409);
  }
  const claimed = await tx.employmentAgreement.updateMany({
    where: { id: agreement.id, version: command.expectedVersion, recordState: "confirmed" },
    data: {
      version: { increment: 1 },
      reason: command.reason,
      updatedBy: userId,
    },
  });
  if (claimed.count !== 1) return failed("协议已被其他人修改，请刷新后重试", 409);

  if (command.kind === "set-primary") {
    await clearPrimaryAgreements(tx, employeeId, userId, agreement.id);
    await tx.employmentAgreement.update({ where: { id: agreement.id }, data: { isPrimary: true } });
    return succeeded(agreement.id);
  }

  if (command.kind === "supplement-missing" || command.kind === "correct-existing") {
    const mutation = await applyEmploymentAgreementBaselineMutation({
      tx,
      agreement,
      missingFields,
      command,
      userId,
    });
    if (!mutation.ok) return failed(mutation.error, mutation.status);
    return succeeded(agreement.id);
  }

  if (command.kind === "renew") {
    assertAgreementTermOverlapAllowed(agreement.terms, {
      effectiveFrom: command.effectiveFrom,
      effectiveThrough: command.effectiveThrough,
    });
    await tx.employmentAgreementTerm.create({
      data: {
        agreementId: agreement.id,
        sequence: nextTermSequence(agreement.terms),
        termKind: command.termKind,
        effectiveFrom: command.effectiveFrom,
        effectiveThrough: command.effectiveThrough,
        recordState: "confirmed",
        changeKind: "renew",
        sourceKind: command.sourceKind,
        sourceRef: command.sourceRef,
        reason: command.reason,
        createdBy: userId,
      },
    });
    await refreshEmploymentAgreementBaselineMissingFields(tx, agreement.id);
    return succeeded(agreement.id);
  }

  const term = agreement.terms.find((item) => item.termUid === command.termUid);
  if (!term) return failed("协议期限不存在", 404);
  if (command.kind === "correct") {
    if (term.recordState !== "confirmed" && term.recordState !== "unknown") {
      return failed("只有已确认或待补全的合同期限可以修正", 409);
    }
  } else if (term.recordState !== "confirmed") {
    return failed("已确认的协议期限不存在", 404);
  }
  if (command.kind === "cancel-future") {
    const today = workspaceBusinessDate(new Date());
    if (!term.effectiveFrom || term.effectiveFrom <= today) return failed("只有尚未生效的期限可以取消", 409);
    await tx.employmentAgreementTerm.update({
      where: { id: term.id },
      data: {
        recordState: "cancelled",
        sourceKind: command.sourceKind,
        sourceRef: command.sourceRef,
        reason: command.reason,
      },
    });
    await refreshEmploymentAgreementBaselineMissingFields(tx, agreement.id);
    return succeeded(agreement.id);
  }

  if (command.kind === "end") {
    if (!term.effectiveFrom) return failed("历史合同缺少开始日期，请先修正期限并补齐", 409);
    if (command.effectiveThrough < term.effectiveFrom) {
      return failed("结束日期不能早于开始日期", 409);
    }
    if (term.effectiveThrough && command.effectiveThrough > term.effectiveThrough) {
      return failed("结束日期不能晚于合同到期日期", 409);
    }
    await tx.employmentAgreement.update({
      where: { id: agreement.id },
      data: { actualEndDate: command.effectiveThrough },
    });
    await refreshEmploymentAgreementBaselineMissingFields(tx, agreement.id);
    return succeeded(agreement.id);
  }

  const replacement = {
    effectiveFrom: command.effectiveFrom,
    effectiveThrough: command.effectiveThrough,
    termKind: command.termKind,
    changeKind: "correct",
  };
  if (!replacement.effectiveFrom) return failed("历史合同缺少开始日期，请先修正期限并补齐", 409);
  if (replacement.effectiveThrough && replacement.effectiveFrom > replacement.effectiveThrough) {
    return failed("协议开始日期不能晚于到期日期", 409);
  }
  assertAgreementTermOverlapAllowed(
    agreement.terms.filter((item) => item.id !== term.id),
    replacement,
  );
  await tx.employmentAgreementTerm.update({ where: { id: term.id }, data: { recordState: "superseded" } });
  await tx.employmentAgreementTerm.create({
    data: {
      agreementId: agreement.id,
      sequence: nextTermSequence(agreement.terms),
      termKind: replacement.termKind,
      effectiveFrom: replacement.effectiveFrom,
      effectiveThrough: replacement.effectiveThrough,
      recordState: "confirmed",
      changeKind: replacement.changeKind,
      supersedesId: term.id,
      sourceKind: command.sourceKind,
      sourceRef: command.sourceRef,
      reason: command.reason,
      createdBy: userId,
    },
  });
  if (term.changeKind === "end-date") {
    await tx.employmentAgreement.update({
      where: { id: agreement.id },
      data: { actualEndDate: replacement.effectiveThrough },
    });
  }
  await refreshEmploymentAgreementBaselineMissingFields(tx, agreement.id);
  return succeeded(agreement.id);
}

async function clearPrimaryAgreements(
  tx: Prisma.TransactionClient,
  employeeId: number,
  userId: number,
  exceptAgreementId?: number,
) {
  await tx.employmentAgreement.updateMany({
    where: {
      employment: { employeeId },
      recordState: "confirmed",
      isPrimary: true,
      id: exceptAgreementId ? { not: exceptAgreementId } : undefined,
    },
    data: { isPrimary: false, version: { increment: 1 }, updatedBy: userId },
  });
}

function nextTermSequence(terms: Array<{ sequence: number }>) {
  return Math.max(0, ...terms.map((term) => term.sequence)) + 1;
}

function succeeded(agreementId: number) {
  return { ok: true as const, agreementId };
}

function failed(error: string, status: number): never {
  throw new EmploymentAgreementCommandError(error, status);
}

class EmploymentAgreementCommandError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "EmploymentAgreementCommandError";
  }
}

function validateAgreementTemporalContract(command: EmploymentAgreementCommand) {
  if (businessTemporalRetrospectiveChanges(HR_EMPLOYMENT_AGREEMENT_TEMPORAL.policy) === "allow") return null;
  const effectiveDate = command.kind === "create" || command.kind === "renew" || command.kind === "correct"
    ? command.effectiveFrom
    : command.kind === "end"
      ? command.effectiveThrough
      : null;
  return effectiveDate && effectiveDate < workspaceBusinessDate(new Date())
    ? "该合同期限不允许补录历史日期"
    : null;
}

function assertAgreementTermOverlapAllowed(
  existing: Array<{ recordState: string; effectiveFrom: string | null; effectiveThrough: string | null }>,
  proposed: { effectiveFrom: string; effectiveThrough: string | null },
) {
  if (HR_EMPLOYMENT_AGREEMENT_TEMPORAL.policy.overlaps === "allow") return;
  const proposedWindow = inclusiveBusinessPeriodToWindow({
    validFrom: proposed.effectiveFrom,
    validThrough: proposed.effectiveThrough,
  });
  if (!proposedWindow) return failed("合同期限无效", 409);
  const overlaps = existing.some((term) => {
    if (term.recordState !== "confirmed" || !term.effectiveFrom) return false;
    const window = inclusiveBusinessPeriodToWindow({
      validFrom: term.effectiveFrom,
      validThrough: term.effectiveThrough,
    });
    return !window || businessDateWindowsOverlap(window, proposedWindow);
  });
  if (overlaps) return failed("合同期限不能与已有期限重叠", 409);
}
