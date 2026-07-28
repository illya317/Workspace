import { validateBusinessTemporalBaselineMutation } from "@workspace/platform/contracts/business-temporal-baseline";
import { type Prisma } from "@workspace/platform/server/prisma";
import {
  employmentAgreementContentPatchFields,
  validateEmploymentAgreementContentReferences,
  type EmploymentAgreementCommand,
} from "./domain/employment-agreement-validation";
import {
  normalizedEmploymentAgreementContent,
  parseEmploymentAgreementContent,
  refreshEmploymentAgreementBaselineMissingFields,
} from "./employment-agreement-baseline-storage";
import { EMPLOYMENT_AGREEMENT_INCLUDE } from "./employment-agreement-rows";

type AgreementRecord = Prisma.EmploymentAgreementGetPayload<{ include: typeof EMPLOYMENT_AGREEMENT_INCLUDE }>;
type BaselineMutationCommand = Extract<EmploymentAgreementCommand, { kind: "supplement-missing" | "correct-existing" }>;

export async function applyEmploymentAgreementBaselineMutation(input: {
  tx: Prisma.TransactionClient;
  agreement: AgreementRecord;
  missingFields: string[];
  command: BaselineMutationCommand;
  userId: number;
}) {
  const { tx, agreement, missingFields, command, userId } = input;
  if (command.kind === "supplement-missing" && agreement.sourceKind !== "legacy-baseline") {
    return failed("只有已登记缺失字段的 baseline 协议可以补充资料", 409);
  }
  const contentPatch = command.kind === "supplement-missing" ? command.patch.content : command.patch;
  const termPatches = command.kind === "supplement-missing" ? command.patch.terms : [];
  const termChanges = termPatches.map((patch) => {
    const term = agreement.terms.find((item) => item.termUid === patch.termUid);
    return term ? { term, patch } : null;
  });
  if (termChanges.some((change) => change === null)) return failed("协议期限不存在", 404);
  if (termChanges.some((change) => change?.term.recordState !== "confirmed" && change?.term.recordState !== "unknown")) {
    return failed("只有已确认或待补全的协议期限可以补充资料", 409);
  }

  const changedFields = [
    ...employmentAgreementContentPatchFields(contentPatch),
    ...termChanges.flatMap((change) => change ? (["effectiveFrom", "effectiveThrough"] as const)
      .filter((field) => change.patch[field] !== undefined)
      .map((field) => `terms.${change.term.sequence}.${field}`) : []),
  ];
  const baselineMutation = validateBusinessTemporalBaselineMutation({
    kind: command.kind,
    missingFields,
    changedFields,
  });
  if (!baselineMutation.ok) {
    if (baselineMutation.reason === "no-fields") return failed("没有需要保存的协议资料变化", 400);
    return failed(
      command.kind === "supplement-missing"
        ? "补充资料只能填写当前标记为缺失的字段"
        : "修正资料不能同时补充缺失字段，请分别保存",
      409,
    );
  }
  if (
    command.kind === "supplement-missing"
    && Object.values(contentPatch).some((value) => value == null || value === "")
  ) {
    return failed("补充资料必须为缺失字段提供有效值", 400);
  }

  const currentContent = normalizedEmploymentAgreementContent(
    parseEmploymentAgreementContent(agreement.currentPublishedRevision?.contentJson),
  );
  if (Object.keys(contentPatch).length > 0) {
    const nextContent = { ...currentContent, ...contentPatch };
    const nextContentError = await validateEmploymentAgreementContentReferences(nextContent);
    if (nextContentError) return failed(nextContentError.message, 400);
    const revision = await tx.employmentAgreementRevision.create({
      data: {
        agreementId: agreement.id,
        revisionNo: Math.max(0, ...agreement.revisions.map((item) => item.revisionNo)) + 1,
        recordState: "published",
        changeKind: command.kind === "supplement-missing" ? "supplement" : "correction",
        contentJson: JSON.stringify(nextContent),
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
  }

  let nextSequence = Math.max(0, ...agreement.terms.map((term) => term.sequence)) + 1;
  for (const change of termChanges) {
    if (!change) continue;
    const effectiveFrom = change.patch.effectiveFrom ?? change.term.effectiveFrom;
    const effectiveThrough = change.patch.effectiveThrough ?? change.term.effectiveThrough;
    if (effectiveFrom && effectiveThrough && effectiveFrom > effectiveThrough) {
      return failed("协议开始日期不能晚于到期日期", 409);
    }
    await tx.employmentAgreementTerm.update({ where: { id: change.term.id }, data: { recordState: "superseded" } });
    await tx.employmentAgreementTerm.create({
      data: {
        agreementId: agreement.id,
        sequence: nextSequence++,
        termKind: change.term.termKind,
        effectiveFrom,
        effectiveThrough,
        recordState: "confirmed",
        changeKind: "supplement",
        supersedesId: change.term.id,
        sourceKind: command.sourceKind,
        sourceRef: command.sourceRef,
        reason: command.reason,
        createdBy: userId,
      },
    });
  }
  await refreshEmploymentAgreementBaselineMissingFields(tx, agreement.id);
  return { ok: true as const };
}

function failed(error: string, status: number) {
  return { ok: false as const, error, status };
}
