import { classifyInclusiveBusinessPeriod } from "@workspace/platform/contracts/business-temporal";
import { checkHRUpdate } from "@workspace/platform/server/auth";
import { assertBusinessActionDirectExecutionAllowed } from "@workspace/platform/server/business-action-executor";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import { businessTemporalIdempotencyMatches, businessTemporalRequestFingerprint } from "@workspace/platform/server/business-temporal-idempotency";
import { mapValidationToServiceResult } from "@workspace/platform/server/domain-validation";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { runSerializableTransaction, SerializableTransactionConflictError } from "@workspace/platform/server/serializable-transaction";
import type {
  ContractRow,
  EmploymentAgreementRevisionRow,
  EmploymentAgreementTermRow,
} from "@workspace/hr/types";
import {
  buildEmploymentAgreementCommand,
  employmentAgreementPeriodsOverlap,
  validateEmploymentAgreementContentReferences,
  type EmploymentAgreementCommand,
} from "./domain/employment-agreement-validation";
import { employmentAgreementChangeManifest } from "./domain/employment-agreement-change";
import { buildLegacyAgreementRows, inspectLegacyEmploymentAgreements } from "./employment-agreement-legacy";

const AGREEMENT_INCLUDE = {
  currentPublishedRevision: true,
  revisions: {
    orderBy: { revisionNo: "desc" as const },
    include: { supersedes: { select: { revisionUid: true } } },
  },
  terms: { orderBy: { sequence: "asc" as const } },
  employment: {
    include: { employee: { select: { id: true, employeeId: true, name: true } } },
  },
} as const;

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
    blockedMessage: "员工协议变更已配置为必须走流程，请从协议生命周期入口提交",
  });
  if (!direct.ok) return direct;
  const contentError = "content" in built.data
    ? await validateEmploymentAgreementContentReferences(built.data.content)
    : null;
  if (contentError) return serviceError(contentError.message, 400);
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
      include: AGREEMENT_INCLUDE,
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
    ...agreements.map((agreement) => normalizedAgreementRow(agreement, asOfDate)),
    ...buildLegacyAgreementRows(legacyEmployments, asOfDate),
  ];
}

export async function loadNormalizedEmploymentAgreementRowsByIds(
  agreementIds: number[],
  asOfDate: string,
): Promise<ContractRow[]> {
  if (agreementIds.length === 0) return [];
  const agreements = await prisma.employmentAgreement.findMany({
    where: { id: { in: agreementIds } },
    include: AGREEMENT_INCLUDE,
  });
  const byId = new Map(agreements.map((agreement) => [agreement.id, normalizedAgreementRow(agreement, asOfDate)]));
  return agreementIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
}

export async function listAllNormalizedEmploymentAgreementRows(
  asOfDate: string,
): Promise<ContractRow[]> {
  const agreements = await prisma.employmentAgreement.findMany({
    include: AGREEMENT_INCLUDE,
    orderBy: { id: "asc" },
  });
  return agreements.map((agreement) => normalizedAgreementRow(agreement, asOfDate));
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
  const employment = await tx.employment.findFirst({
    where: { id: command.employmentId, employeeId },
    select: { id: true },
  });
  if (!employment) return failed("雇佣记录不存在或不属于该员工", 404);
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
    include: AGREEMENT_INCLUDE,
  });
  if (!agreement) return failed("协议不存在或不属于该员工", 404);
  if (agreement.recordState !== "confirmed") return failed("只有已确认协议可以变更", 409);
  const claimed = await tx.employmentAgreement.updateMany({
    where: { id: agreement.id, version: command.expectedVersion, recordState: "confirmed" },
    data: {
      version: { increment: 1 },
      sourceKind: command.sourceKind,
      sourceRef: command.sourceRef,
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

  if (command.kind === "revise" || command.kind === "supersede") {
    const revisionNo = nextRevisionNo(agreement.revisions);
    const revision = await tx.employmentAgreementRevision.create({
      data: {
        agreementId: agreement.id,
        revisionNo,
        recordState: command.kind === "revise" ? "draft" : "published",
        contentJson: JSON.stringify(command.content),
        supersedesRevisionId: command.kind === "supersede" ? agreement.currentPublishedRevisionId : null,
        sourceKind: command.sourceKind,
        sourceRef: command.sourceRef,
        reason: command.reason,
        createdBy: userId,
      },
    });
    if (command.kind === "supersede") {
      await tx.employmentAgreement.update({
        where: { id: agreement.id },
        data: { currentPublishedRevisionId: revision.id },
      });
    }
    return succeeded(agreement.id);
  }

  if (command.kind === "publish") {
    const draft = agreement.revisions.find((revision) => revision.revisionUid === command.revisionUid);
    if (!draft || draft.recordState !== "draft") return failed("待发布草稿不存在", 404);
    const revision = await tx.employmentAgreementRevision.create({
      data: {
        agreementId: agreement.id,
        revisionNo: nextRevisionNo(agreement.revisions),
        recordState: "published",
        contentJson: draft.contentJson,
        supersedesRevisionId: agreement.currentPublishedRevisionId,
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
    await tx.employmentAgreementRevision.update({
      where: { id: draft.id },
      data: { recordState: "cancelled" },
    });
    return succeeded(agreement.id);
  }

  if (command.kind === "renew") {
    const overlap = agreement.terms.some((item) => item.recordState === "confirmed" && employmentAgreementPeriodsOverlap(
      { effectiveFrom: item.effectiveFrom, effectiveThrough: item.effectiveThrough },
      { effectiveFrom: command.effectiveFrom, effectiveThrough: command.effectiveThrough },
    ));
    if (overlap) return failed("续签期限与现有已确认期限重叠", 409);
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
    return succeeded(agreement.id);
  }

  const term = agreement.terms.find((item) => item.termUid === command.termUid);
  if (!term || term.recordState !== "confirmed") return failed("已确认的协议期限不存在", 404);
  if (command.kind === "cancel-future") {
    const today = workspaceBusinessDate(new Date());
    if (term.effectiveFrom <= today) return failed("只有尚未生效的期限可以取消", 409);
    await tx.employmentAgreementTerm.update({
      where: { id: term.id },
      data: {
        recordState: "cancelled",
        sourceKind: command.sourceKind,
        sourceRef: command.sourceRef,
        reason: command.reason,
      },
    });
    return succeeded(agreement.id);
  }

  const replacement = command.kind === "end"
    ? {
        effectiveFrom: term.effectiveFrom,
        effectiveThrough: command.effectiveThrough,
        termKind: term.termKind,
        changeKind: "end-date",
      }
    : {
        effectiveFrom: command.effectiveFrom,
        effectiveThrough: command.effectiveThrough,
        termKind: command.termKind,
        changeKind: "correct",
      };
  if (replacement.effectiveThrough && replacement.effectiveFrom > replacement.effectiveThrough) {
    return failed("协议开始日期不能晚于结束日期", 409);
  }
  if (command.kind === "end" && term.effectiveThrough && command.effectiveThrough > term.effectiveThrough) {
    return failed("延长协议期限请使用续签命令", 409);
  }
  const overlap = agreement.terms.some((item) => item.id !== term.id && item.recordState === "confirmed" && employmentAgreementPeriodsOverlap(
    { effectiveFrom: item.effectiveFrom, effectiveThrough: item.effectiveThrough },
    replacement,
  ));
  if (overlap) return failed("修正后的期限与其他已确认期限重叠", 409);
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

function normalizedAgreementRow(
  agreement: Awaited<ReturnType<typeof _loadAgreementShape>>,
  asOfDate: string,
): ContractRow {
  const terms = agreement.terms.map((term): EmploymentAgreementTermRow => ({
    termUid: term.termUid,
    sequence: term.sequence,
    termKind: term.termKind as EmploymentAgreementTermRow["termKind"],
    effectiveFrom: term.effectiveFrom,
    effectiveThrough: term.effectiveThrough,
    recordState: term.recordState as EmploymentAgreementTermRow["recordState"],
    temporalState: classifyInclusiveBusinessPeriod({ validFrom: term.effectiveFrom, validThrough: term.effectiveThrough }, asOfDate),
    changeKind: term.changeKind,
    reason: term.reason,
  }));
  const revisions = agreement.revisions.map((revision): EmploymentAgreementRevisionRow => ({
    revisionUid: revision.revisionUid,
    revisionNo: revision.revisionNo,
    recordState: revision.recordState === "published"
      ? revision.id === agreement.currentPublishedRevisionId ? "confirmed" : "superseded"
      : revision.recordState as EmploymentAgreementRevisionRow["recordState"],
    content: parseContent(revision.contentJson),
    supersedesRevisionUid: revision.supersedes?.revisionUid ?? null,
    reason: revision.reason,
    createdAt: revision.createdAt.toISOString(),
  }));
  const content = agreement.currentPublishedRevision
    ? parseContent(agreement.currentPublishedRevision.contentJson)
    : emptyContent();
  const confirmedTerms = terms.filter((term) => term.recordState === "confirmed");
  const ordered = [...confirmedTerms].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  const primaryState = preferredTemporalState(confirmedTerms);
  return {
    id: agreement.agreementUid,
    agreementUid: agreement.agreementUid,
    employmentId: agreement.employmentId,
    employeeId: agreement.employment.employee.employeeId || "",
    employeeName: agreement.employment.employee.name || "",
    company: content.company || "",
    isPrimary: agreement.isPrimary,
    isInsuredHere: false,
    insuranceStatus: content.insuranceStatus,
    legalRelation: content.legalRelation || "",
    contractType: content.contractType || "",
    employmentForm: content.employmentForm || "",
    firstContractStartDate: ordered[0]?.effectiveFrom ?? null,
    firstContractEndDate: ordered[0]?.effectiveThrough ?? null,
    secondContractStartDate: ordered[1]?.effectiveFrom ?? null,
    secondContractEndDate: ordered[1]?.effectiveThrough ?? null,
    thirdContractStartDate: ordered[2]?.effectiveFrom ?? null,
    thirdContractEndDate: ordered[2]?.effectiveThrough ?? null,
    permanentContractDate: ordered.find((term) => term.termKind === "permanent")?.effectiveFrom ?? null,
    confidentialityDate: content.confidentialityDate,
    nonCompeteDate: content.nonCompeteDate,
    endDate: lastKnownEnd(ordered),
    recordState: agreement.recordState as ContractRow["recordState"],
    temporalState: primaryState,
    version: agreement.version,
    source: "normalized",
    migrationState: "normalized",
    currentRevisionUid: agreement.currentPublishedRevision?.revisionUid ?? null,
    terms,
    revisions,
  };
}

async function _loadAgreementShape() {
  return prisma.employmentAgreement.findFirstOrThrow({ include: AGREEMENT_INCLUDE });
}

function parseContent(value: string): EmploymentAgreementRevisionRow["content"] {
  try {
    const parsed = JSON.parse(value) as Partial<EmploymentAgreementRevisionRow["content"]>;
    return { ...emptyContent(), ...parsed };
  } catch {
    return emptyContent();
  }
}

function emptyContent(): EmploymentAgreementRevisionRow["content"] {
  return {
    company: null,
    insuranceStatus: null,
    legalRelation: null,
    contractType: null,
    employmentForm: null,
    confidentialityDate: null,
    nonCompeteDate: null,
  };
}

function preferredTemporalState(terms: EmploymentAgreementTermRow[]) {
  if (terms.some((term) => term.temporalState === "current")) return "current" as const;
  if (terms.some((term) => term.temporalState === "upcoming")) return "upcoming" as const;
  if (terms.some((term) => term.temporalState === "invalid")) return "invalid" as const;
  return terms.length > 0 ? "past" as const : "invalid" as const;
}

function lastKnownEnd(terms: EmploymentAgreementTermRow[]) {
  if (terms.some((term) => !term.effectiveThrough)) return null;
  return terms.map((term) => term.effectiveThrough).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

function nextRevisionNo(revisions: Array<{ revisionNo: number }>) {
  return Math.max(0, ...revisions.map((revision) => revision.revisionNo)) + 1;
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
